document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const cardsContainer = document.getElementById('cardsContainer');
    const targetCharElem = document.getElementById('targetChar');
    const masteryInput = document.getElementById('masteryInput');
    const feedback = document.getElementById('feedback');
    const playTargetBtn = document.getElementById('playTargetBtn');
    const progressSlots = document.getElementById('progressSlots');
    const giveUpBtn = document.getElementById('giveUpBtn');

    // State
    const currentSet = ['A', 'B', 'C', 'D'];
    let targetChar = '';
    let isProcessing = false; // block input during transitions
    
    // Morse Dictionary
    const MORSE_CODE_DICT = { 
        'A':'.-', 'B':'-...', 'C':'-.-.', 'D':'-..', 'E':'.',
        'F':'..-.', 'G':'--.', 'H':'....', 'I':'..', 'J':'.---', 
        'K':'-.-', 'L':'.-..', 'M':'--', 'N':'-.', 'O':'---', 
        'P':'.--.', 'Q':'--.-', 'R':'.-.', 'S':'...', 'T':'-',
        'U':'..-', 'V':'...-', 'W':'.--', 'X':'-..-', 'Y':'-.--', 
        'Z':'--..', '1':'.----', '2':'..---', '3':'...--', 
        '4':'....-', '5':'.....', '6':'-....', '7':'--...', 
        '8':'---..', '9':'----.', '0':'-----'
    };

    // Audio State
    let audioCtx = null;
    let keyerOsc = null;
    let keyerGain = null;
    let spaceKeyDownTime = 0;

    // --- Init ---
    initGame();

    function initGame() {
        renderCards();
        pickNewTarget();
        setupKeyer(masteryInput);
        masteryInput.focus();
    }

    function renderCards() {
        cardsContainer.innerHTML = currentSet.map(char => `
            <div class="mastery-card" id="card-${char}">
                <div class="char">${char}</div>
                <div class="morse">${MORSE_CODE_DICT[char]}</div>
            </div>
        `).join('');
    }

    function pickNewTarget() {
        isProcessing = false;
        masteryInput.disabled = false;
        
        const randomIndex = Math.floor(Math.random() * currentSet.length);
        targetChar = currentSet[randomIndex];
        updateUIForTarget();
    }

    function updateUIForTarget() {
        targetCharElem.textContent = targetChar;
        // Highlight active card
        document.querySelectorAll('.mastery-card').forEach(c => c.classList.remove('active'));
        const card = document.getElementById(`card-${targetChar}`);
        if (card) card.classList.add('active');
        
        masteryInput.value = '';
        updateProgressSlots('');
        feedback.textContent = '';
        feedback.className = 'feedback-msg';
        masteryInput.style.borderColor = 'var(--glass-border)';
        masteryInput.focus();
    }

    // --- Visual Progress Slots ---
    function updateProgressSlots(currentInput) {
        const targetMorse = MORSE_CODE_DICT[targetChar];
        const maxLen = targetMorse.length;
        
        // Render slots if count changed (or first time)
        if (progressSlots.childElementCount !== maxLen) {
            progressSlots.innerHTML = Array(maxLen).fill('<div class="slot"></div>').join('');
        }

        // Fill slots based on input length
        const slots = progressSlots.children;
        for (let i = 0; i < maxLen; i++) {
            if (i < currentInput.length) {
                slots[i].classList.add('filled');
            } else {
                slots[i].classList.remove('filled');
            }
        }
    }

    // --- Input Logic ---
    masteryInput.addEventListener('input', (e) => {
        if (isProcessing) {
            e.target.value = e.target.value.slice(0, MORSE_CODE_DICT[targetChar].length); // ensure no extra
            return;
        }

        const input = e.target.value.trim();
        const targetMorse = MORSE_CODE_DICT[targetChar];
        
        updateProgressSlots(input);

        // Auto-validate logic
        if (input.length >= targetMorse.length) {
            // Check immediately
            if (input === targetMorse) {
                handleSuccess();
            } else {
                handleFailure(targetMorse);
            }
        } else {
            // Typing in progress...
            // Optional: Check strictly if prefix matches to fail early?
            // User requirement said "Prevent any further typing... once max length is hit".
            // Since we check on >= length, we effectively stop there.
            if (!targetMorse.startsWith(input)) {
                masteryInput.style.borderColor = '#f87171';
            } else {
                masteryInput.style.borderColor = 'var(--glass-border)';
            }
        }
    });

    // Provide strict length constraint on input (keydown/keypress)
    // to prevent typing more than needed visible characters
    masteryInput.addEventListener('keydown', (e) => {
        // Allow deletion
        if (e.key === 'Backspace' || e.key === 'Delete') return;
        
        const targetMorse = MORSE_CODE_DICT[targetChar];
        if (masteryInput.value.length >= targetMorse.length) {
             // Block extra chars if not a control key
             if (e.key.length === 1) e.preventDefault();
        }
    });

    function handleSuccess() {
        isProcessing = true;
        masteryInput.disabled = true;
        feedback.textContent = 'Correct!';
        feedback.className = 'feedback-msg correct';
        masteryInput.style.borderColor = '#4ade80';
        
        // Log success (Phase 2 placeholder)
        
        setTimeout(() => {
            pickNewTarget();
        }, 800); 
    }

    function handleFailure(correctAnswer) {
        isProcessing = true;
        masteryInput.disabled = true;
        feedback.textContent = `Incorrect! It was ${correctAnswer}`;
        feedback.className = 'feedback-msg incorrect';
        masteryInput.style.borderColor = '#f87171';
        
        // Log failure (Phase 2 placeholder)

        setTimeout(() => {
            pickNewTarget();
        }, 1500); 
    }

    // --- Give Up Logic ---
    giveUpBtn.addEventListener('click', () => {
        if (isProcessing) return;
        handleFailure(MORSE_CODE_DICT[targetChar]); // Reuse failure logic
    });

    // --- Audio Logic ---
    playTargetBtn.addEventListener('click', () => {
        initAudio(); // user interaction trigger
        playMorseCode(MORSE_CODE_DICT[targetChar], playTargetBtn);
    });

    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function setupKeyer(input) {
        input.addEventListener('keydown', (e) => {
            if (isProcessing) return; // ignore if processing result

            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                // Check if allowed to type more
                if (input.value.length >= MORSE_CODE_DICT[targetChar].length) return;

                startManualTone();
                spaceKeyDownTime = Date.now();
            }
        });

        input.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                stopManualTone();
                
                // If we were blocked from start, don't input
                if (input.value.length >= MORSE_CODE_DICT[targetChar].length) return;

                const duration = Date.now() - spaceKeyDownTime;
                const char = duration < 200 ? '.' : '-';
                input.value += char;
                input.dispatchEvent(new Event('input'));
            }
        });
    }

    function startManualTone() {
        initAudio();
        if (keyerOsc) return;

        const freq = 600;
        keyerOsc = audioCtx.createOscillator();
        keyerGain = audioCtx.createGain();

        keyerOsc.type = 'sine';
        keyerOsc.frequency.value = freq;
        
        keyerGain.gain.setValueAtTime(0, audioCtx.currentTime);
        keyerGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.005);

        keyerOsc.connect(keyerGain);
        keyerGain.connect(audioCtx.destination);
        keyerOsc.start();
    }

    function stopManualTone() {
        if (keyerOsc && keyerGain) {
            const now = audioCtx.currentTime;
            keyerGain.gain.cancelScheduledValues(now);
            keyerGain.gain.setValueAtTime(keyerGain.gain.value, now);
            keyerGain.gain.linearRampToValueAtTime(0, now + 0.005);
            keyerOsc.stop(now + 0.02);
            keyerOsc = null;
            keyerGain = null;
        }
    }

    async function playMorseCode(code, btn) {
        if (btn) btn.disabled = true;
        
        const dot = 0.08;
        let now = audioCtx.currentTime + 0.1;

        for (let char of code) {
            if (char === '.') {
                tone(now, dot);
                now += dot;
            } else if (char === '-') {
                tone(now, dot * 3);
                now += dot * 3;
            }
            if (char === '.' || char === '-') now += dot; // inter-gap
        }

        const duration = (now - audioCtx.currentTime) * 1000;
        setTimeout(() => {
            if (btn) btn.disabled = false;
        }, duration);
    }

    function tone(start, dur) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = 600;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.5, start + 0.01);
        gain.gain.setValueAtTime(0.5, start + dur - 0.01);
        gain.gain.linearRampToValueAtTime(0, start + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur);
    }
});
