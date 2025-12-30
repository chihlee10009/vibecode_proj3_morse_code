import os
import random
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types
from flask_sqlalchemy import SQLAlchemy

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Database Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///morse.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Gemini Client
api_key = os.getenv("GEMINI_API_KEY")
client = None
if api_key:
    client = genai.Client(api_key=api_key)
    print("Gemini Client initialized")
else:
    print("Warning: GEMINI_API_KEY not found. AI features will be disabled.")

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
        "gemini-3.0-pro"
    ]
    # models = client.models.list() # Overwrite removed to use curated list
    return jsonify({'models': models})

@app.route('/api/generate_challenge', methods=['POST'])
def generate_challenge():
    if not client:
        return jsonify({'error': 'AI not configured'}), 503

    data = request.get_json()
    model_name = data.get('model', 'gemini-2.0-flash-exp')
    
    # Fetch weakest characters
    weakest = UserProgress.query.order_by((UserProgress.successes / UserProgress.attempts).asc()).limit(3).all()
    focus_chars = ", ".join([w.character for w in weakest if w.attempts > 0]) or "random letters"

    prompt = f"Generate a single word or short sentence (max 5 words) for Morse code practice. Focus on these characters if possible: {focus_chars}. Return ONLY the text, no explanations."

    try:
        response = client.models.generate_content(
            model=model_name, 
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=50)
        )
        challenge_text = response.text.strip().upper() if response.text else "MORSE"
        # Remove non-morse chars just in case
        challenge_text = ''.join([c for c in challenge_text if c in MORSE_CODE_DICT or c == ' '])
        return jsonify({'challenge': challenge_text})
    except Exception as e:
        print(f"AI Error: {e}")
        return jsonify({'challenge': 'SOS', 'error': str(e)})

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
    port = int(os.environ.get('PORT', 5003))
    app.run(host='0.0.0.0', port=port, debug=True)
