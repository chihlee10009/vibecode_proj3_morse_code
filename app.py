import os
import random
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types
from flask_sqlalchemy import SQLAlchemy
from google.cloud import secretmanager
import requests
import google.auth
from google.auth.transport.requests import Request

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Database Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///morse.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Gemini Client Setup ---
def get_gemini_key():
    # 1. Try GCP Secret Manager if path is provided
    secret_path = os.getenv("SECRETS_API_KEY_PATH")
    if secret_path:
        try:
            client = secretmanager.SecretManagerServiceClient()
            # Append /versions/latest if not present
            if "/versions/" not in secret_path:
                secret_path = f"{secret_path}/versions/latest"
            
            response = client.access_secret_version(request={"name": secret_path})
            payload = response.payload.data.decode("UTF-8")
            print(f"Successfully fetched API key from Secret Manager: {secret_path}")
            return payload
        except Exception as e:
            print(f"Error fetching from Secret Manager: {e}")
            print("Falling back to environment variable...")

    # 2. Fallback to standard Env Var
    return os.getenv("GEMINI_API_KEY")

api_key = get_gemini_key()
client = None
if api_key:
    try:
        client = genai.Client(api_key=api_key)
        print("Gemini Client initialized")
    except Exception as e:
        print(f"Failed to initialize Gemini Client: {e}")
else:
    print("Warning: No API Key found (checked Secret Manager & GEMINI_API_KEY). AI features will be disabled.")

from datetime import datetime

# Database Models
class UserProgress(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    character = db.Column(db.String(10), nullable=False) # Char or Word
    attempts = db.Column(db.Integer, default=0)
    successes = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'character': self.character,
            'attempts': self.attempts,
            'successes': self.successes,
            'accuracy': (self.successes / self.attempts * 100) if self.attempts > 0 else 0
        }

class ProgressHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    character = db.Column(db.String(10), nullable=False)
    is_success = db.Column(db.Boolean, default=False)

# Initialize DB
with app.app_context():
    db.create_all()

MORSE_CODE_DICT = { 'A':'.-', 'B':'-...',
                    'C':'-.-.', 'D':'-..', 'E':'.',
                    'F':'..-.', 'G':'--.', 'H':'....',
                    'I':'..', 'J':'.---', 'K':'-.-',
                    'L':'.-..', 'M':'--', 'N':'-.',
                    'O':'---', 'P':'.--.', 'Q':'--.-',
                    'R':'.-.', 'S':'...', 'T':'-',
                    'U':'..-', 'V':'...-', 'W':'.--',
                    'X':'-..-', 'Y':'-.--', 'Z':'--..',
                    '1':'.----', '2':'..---', '3':'...--',
                    '4':'....-', '5':'.....', '6':'-....',
                    '7':'--...', '8':'---..', '9':'----.',
                    '0':'-----', ',':'--..--', '.':'.-.-.-',
                    '?':'..--..', '/':'-..-.', '-':'-....-',
                    '(':'-.--.', ')':'-.--.-'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json()
    text = data.get('text', '').upper()
    morse_code = ''
    for char in text:
        if char == ' ':
            morse_code += ' / '
        elif char in MORSE_CODE_DICT:
            morse_code += MORSE_CODE_DICT[char] + ' '
        else:
            morse_code += char + ' ' 
    
    return jsonify({'morse': morse_code.strip()})

# --- AI & Stats Endpoints ---

@app.route('/api/models', methods=['GET'])
def get_models():
    # Hardcoded for now, or fetch if feasible. User asked for specific ones.
    models = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-3.0-pro-preview",
        "qwen-2.5-32b-instruct"
    ]
    return jsonify({'models': models})

def get_vertex_token():
    credentials, project = google.auth.default()
    credentials.refresh(Request())
    return credentials.token

@app.route('/api/generate_challenge', methods=['POST'])
def generate_challenge():
    data = request.get_json()
    model_name = data.get('model', 'gemini-2.5-flash')
    
    # Fetch weakest characters
    weakest = UserProgress.query.order_by((UserProgress.successes / UserProgress.attempts).asc()).limit(3).all()
    focus_chars = ", ".join([w.character for w in weakest if w.attempts > 0]) or "random letters"

    prompt_text = f"Generate a single word or short sentence (max 5 words) for Morse code practice. Focus on these characters if possible: {focus_chars}. Return ONLY the text, no explanations."

    if 'qwen' in model_name.lower():
        try:
            endpoint_id = os.getenv("ENDPOINT_ID")
            project_id = os.getenv("PROJECT_ID")
            location = "us-central1" # Assuming us-central1 from curl command
            
            if not endpoint_id or not project_id:
                return jsonify({'error': 'Vertex AI Config Missing'}), 503

            api_endpoint = f"https://mg-endpoint-c693f38b-30d6-4628-871d-ba2e5163965e.us-central1-304586562104.prediction.vertexai.goog/v1/projects/{project_id}/locations/{location}/endpoints/{endpoint_id}:predict"
            
            token = get_vertex_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            # Construct Qwen-compatible payload
            payload = {
                "instances": [
                    {
                        "text": f"<|im_start|>user\n{prompt_text}<|im_end|>\n<|im_start|>assistant\n"
                    }
                ],
                "parameters": {
                    "sampling_params": {
                        "max_new_tokens": 50,
                        "temperature": 0.6,
                        "top_p": 0.95,
                        "top_k": 20
                    }
                }
            }
            
            response = requests.post(api_endpoint, headers=headers, json=payload)
            response.raise_for_status()
            
            # Parse Vertex Response
            # Structure depends on model, usually predictions[0]...
            result_json = response.json()
            # Adjust based on likely response structure (often raw text completion)
            # For Qwen deployed via vLLM/similar on Vertex, it might be in 'predictions'
            # Assuming 'predictions' list of strings or objects.
            # Looking at test.json, user provided input format but not output. 
            # Standard Vertex prediction response: {"predictions": ["output text..."]}
            
            # Let's try to grab the first prediction.
            if 'predictions' in result_json and len(result_json['predictions']) > 0:
                raw_text = result_json['predictions'][0]
                # It might just be the continuation, let's strip it
                challenge_text = raw_text.strip().upper()
                
                # Cleanup: Qwen might output more chat tokens or the prompt itself if not careful
                # But with text-completion endpoint it usually just continues.
                # If it includes input, we might need to split. 
                # For now assume clean continuation.
            else:
                challenge_text = "MORSE"

        except Exception as e:
            print(f"Vertex Qwen Error: {e}")
            return jsonify({'challenge': 'SOS', 'error': str(e)})

    else:
        # GEMINI Fallback
        if not client:
             return jsonify({'error': 'AI not configured'}), 503
             
        try:
            response = client.models.generate_content(
                model=model_name, 
                contents=prompt_text,
                config=types.GenerateContentConfig(max_output_tokens=50)
            )
            challenge_text = response.text.strip().upper() if response.text else "MORSE"
        except Exception as e:
            print(f"Gemini Error: {e}")
            return jsonify({'challenge': 'SOS', 'error': str(e)})

    # Common Cleanup
    challenge_text = ''.join([c for c in challenge_text if c in MORSE_CODE_DICT or c == ' '])
    return jsonify({'challenge': challenge_text})

@app.route('/api/report_result', methods=['POST'])
def report_result():
    data = request.get_json()
    text = data.get('text', '')
    success = data.get('success', False)
    
    # Simple tracking: track each letter in the text
    for char in text.upper():
        if char in MORSE_CODE_DICT:
            # Aggregate Stats
            record = UserProgress.query.filter_by(character=char).first()
            if not record:
                record = UserProgress(character=char)
                db.session.add(record)
            
            # Fix: Ensure defaults are respected if DB returns None
            if record.attempts is None: record.attempts = 0
            if record.successes is None: record.successes = 0

            record.attempts += 1
            if success:
                record.successes += 1
            
            # History Tracking
            history = ProgressHistory(character=char, is_success=success)
            db.session.add(history)
    
    db.session.commit()
    return jsonify({'status': 'recorded'})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    stats = UserProgress.query.order_by(UserProgress.attempts.desc()).all()
    return jsonify({'stats': [s.to_dict() for s in stats]})

@app.route('/api/history', methods=['GET'])
def get_history():
    # Return last 50 attempts or grouped by date
    # For now, let's just return a simple list of recent attempts for the chart
    # Limit to last 100 for performance
    history = ProgressHistory.query.order_by(ProgressHistory.timestamp.desc()).limit(100).all()
    
    # Format for chart: grouped by "Session" (just time sequence)
    data = [{
        'timestamp': h.timestamp.isoformat(),
        'character': h.character,
        'is_success': h.is_success
    } for h in history]
    
    # Also simple accuracy over time: grouped by chunks? 
    # Let's just return raw data and let frontend process or just return accumulated accuracy
    
    return jsonify({'history': data})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5004))
    app.run(host='0.0.0.0', port=port, debug=True)
