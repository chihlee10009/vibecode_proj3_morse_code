document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const views = {
        classic: document.getElementById('classicView'),
        ai: document.getElementById('aiView')
    };
    const modeBtns = {
        classic: document.getElementById('modeClassicBtn'),
        ai: document.getElementById('modeAIBtn')
    };

    // Classic Elements
    const textInput = document.getElementById('textInput');
    const morseOutput = document.getElementById('morseOutput');
    const playBtn = document.getElementById('playBtn');
    const practiceInput = document.getElementById('practiceInput');
    const feedback = document.getElementById('feedback');

    // AI Elements
    const modelSelect = document.getElementById('modelSelect');
    const nextChallengeBtn = document.getElementById('nextChallengeBtn');
    const challengeText = document.getElementById('challengeText');
    const aiInput = document.getElementById('aiInput');
    const aiFeedback = document.getElementById('aiFeedback');
    const statsContent = document.getElementById('statsContent');

    // Audio
    let audioCtx = null;
    let isPlaying = false;
    let keyerOsc = null;
    let keyerGain = null;
    let spaceKeyDownTime = 0;

    // --- Mode Switching ---
    function switchMode(mode) {
        if (mode === 'classic') {
            views.classic.classList.remove('hidden');
            views.ai.classList.add('hidden');
            modeBtns.classic.classList.add('active');
            modeBtns.ai.classList.remove('active');
            textInput.focus();
        } else {
            views.classic.classList.add('hidden');
            views.ai.classList.remove('hidden');
            modeBtns.classic.classList.remove('active');
            modeBtns.ai.classList.add('active');
            updateStats();
        }
    }

    modeBtns.classic.addEventListener('click', () => switchMode('classic'));
    modeBtns.ai.addEventListener('click', () => switchMode('ai'));

    // --- Classic Mode Logic ---
    textInput.addEventListener('input', async (e) => {
        const text = e.target.value;
        if (text.trim() === '') {
            morseOutput.innerHTML = '<span class="placeholder">... --- ...</span>';
            playBtn.disabled = true;
            return;
        }

        try {
            const data = await fetchTranslation(text);
            morseOutput.textContent = data.morse;
            playBtn.disabled = false;
        } catch (error) {
            console.error(error);
        }
    });

    async function fetchTranslation(text) {
        const res = await fetch('/translate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text })
        });
        if (!res.ok) throw new Error('Translation failed');
        return await res.json();
    }

    // Play Audio
    playBtn.addEventListener('click', async () => {
        if (isPlaying) return;
        initAudio();
        const code = morseOutput.textContent;
        await playMorseCode(code, playBtn);
    });

    // Practice Logic
    function handlePracticeCommon(inputElem, targetText, feedbackElem) {
        // We only validate against translated morse of targetText
        // For classic, target is morseOutput text
        // For AI, target is translated challenge
    }

    // Classic Practice (Keyer & Text)
    // Re-implementing Keyer for both inputs
    function setupKeyer(input) {
        input.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                startManualTone();
                spaceKeyDownTime = Date.now();
            }
        });

        input.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                stopManualTone();
                const duration = Date.now() - spaceKeyDownTime;
                const char = duration < 200 ? '.' : '-';
                input.value += char;
                input.dispatchEvent(new Event('input'));
            }
        });
    }

    setupKeyer(practiceInput);
    setupKeyer(aiInput); // AI input also supports keyer!

    // Classic Validation
    practiceInput.addEventListener('input', (e) => {
        const input = e.target.value.trim();
        const target = morseOutput.textContent.trim();
        validateInput(input, target, practiceInput, feedback);
    });

    // --- AI Mode Logic ---
    nextChallengeBtn.addEventListener('click', async () => {
        challengeText.textContent = "THINKING...";
        nextChallengeBtn.disabled = true;
        
        try {
            const res = await fetch('/api/generate_challenge', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ model: modelSelect.value })
            });
            const data = await res.json();
            
            if (data.error) {
                challengeText.textContent = "ERROR";
                aiFeedback.textContent = data.error;
            } else {
                challengeText.textContent = data.challenge;
                challengeText.dataset.target = data.challenge; // Store for validation
                aiInput.value = '';
                aiFeedback.textContent = '';
                aiInput.style.borderColor = 'var(--glass-border)';
                aiInput.focus();
            }
        } catch (e) {
            challengeText.textContent = "ERROR";
        } finally {
            nextChallengeBtn.disabled = false;
        }
    });

    // AI Validation
    aiInput.addEventListener('input', async (e) => {
        const input = e.target.value.trim();
        const challenge = challengeText.textContent; // Word like "HELLO"
        
        // We need Morse for the challenge to match against input
        // Let's fetch it or assume user knows it? 
        // User asked for "typing morse code after it is shown".
        // In AI mode, we show text, user types Morse. We need to verify correctness.
        // We can check strictly or lazily.
        // Let's translate challenge to Morse first to compare.
        
        if (!challenge || challenge === "THINKING..." || challenge === "ERROR") return;

        try {
            // Optimization: Cache this or do it once. For now, fetch for simplicity.
            const data = await fetchTranslation(challenge);
            const targetMorse = data.morse.replace(/\s\/\s/g, ' / '); // Normalize spaces
            
            // Allow loose matching (extra spaces)
            const normalizedInput = input.replace(/\s+/g, ' ').trim();
            const normalizedTarget = targetMorse.replace(/\s+/g, ' ').trim();

            if (normalizedInput === normalizedTarget) {
                aiFeedback.textContent = 'Correct! 🎉';
                aiFeedback.className = 'feedback-msg correct';
                aiInput.style.borderColor = '#4ade80';
                reportResult(challenge, true);
                
                // Auto-refresh stats
                setTimeout(updateStats, 1000);
            } else if (normalizedTarget.startsWith(normalizedInput)) {
                 aiFeedback.textContent = '...';
                 aiFeedback.className = 'feedback-msg';
                 aiInput.style.borderColor = 'var(--glass-border)';
            } else {
                 aiFeedback.textContent = 'Incorrect';
                 aiFeedback.className = 'feedback-msg incorrect';
                 aiInput.style.borderColor = '#f87171';
            }
        } catch (e) {
            console.error(e);
        }
    });

    async function reportResult(text, success) {
        // Prevent duplicate reporting? user can keep typing. 
        // Ideally debounce or flag "completed".
        if (aiInput.dataset.completed === text) return;
        aiInput.dataset.completed = text;

        await fetch('/api/report_result', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text, success: success })
        });
    }

    async function updateStats() {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            
            if (data.stats.length === 0) {
                statsContent.innerHTML = '<p>No stats yet. Practice more!</p>';
                return;
            }

            statsContent.innerHTML = data.stats.map(s => `
                <div class="stat-item">
                    <span>${s.character}</span>
                    <span>${s.accuracy.toFixed(0)}% (${s.successes}/${s.attempts})</span>
                </div>
            `).join('');
        } catch (e) {
            statsContent.innerHTML = 'Failed to load stats';
        }
    }

    // --- Helpers ---
    function validateInput(input, target, inputElem, feedbackElem) {
         if (input === target) {
            feedbackElem.textContent = 'Correct! 🎉';
            feedbackElem.className = 'feedback-msg correct';
            inputElem.style.borderColor = '#4ade80';
        } else if (target.startsWith(input)) {
            feedbackElem.textContent = '...';
            feedbackElem.className = 'feedback-msg';
            inputElem.style.borderColor = 'var(--glass-border)';
        } else {
            feedbackElem.textContent = 'Incorrect';
            feedbackElem.className = 'feedback-msg incorrect';
            inputElem.style.borderColor = '#f87171';
        }
    }

    // Audio Helpers
    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
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

    // Reuse playMorseCode from previous steps (omitted details for brevity, assumed copied or preserved if using append, but since I am overwriting, I must include it)
    async function playMorseCode(code, btn) {
        isPlaying = true;
        btn.disabled = true;
        btn.innerHTML = 'Playing...';
        
        const dot = 0.08;
        let now = audioCtx.currentTime + 0.1;

        for (let char of code) {
            if (char === '.') {
                tone(now, dot);
                now += dot;
            } else if (char === '-') {
                tone(now, dot * 3);
                now += dot * 3;
            } else if (char === ' ') {
                now += dot;
            } else if (char === '/') {
                now += dot * 7;
            }
            if (char === '.' || char === '-') now += dot;
        }

        const duration = (now - audioCtx.currentTime) * 1000;
        setTimeout(() => {
            isPlaying = false;
            btn.disabled = false;
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                Play Audio
            `;
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
