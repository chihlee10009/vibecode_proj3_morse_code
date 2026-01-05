document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const views = {
        classic: document.getElementById('classicView'),
        quiz: document.getElementById('quizView'),
        ai: document.getElementById('aiView')
    };
    const modeBtns = {
        classic: document.getElementById('modeClassicBtn'),
        quiz: document.getElementById('modeQuizBtn'),
        ai: document.getElementById('modeAIBtn')
    };

    // Classic Elements (Trainer)
    // Removed old inputs, now using Drill elements

    // Quiz Elements
    const quizLocked = document.getElementById('quizLocked');
    const quizActive = document.getElementById('quizActive');
    const quizTargetChar = document.getElementById('quizTargetChar');
    const quizInput = document.getElementById('quizInput');
    const quizFeedback = document.getElementById('quizFeedback');
    const backToTrainerBtn = document.getElementById('backToTrainerBtn');

    // AI Elements
    const modelSelect = document.getElementById('modelSelect');
    const nextChallengeBtn = document.getElementById('nextChallengeBtn');
    const challengeText = document.getElementById('challengeText');
    const aiInput = document.getElementById('aiInput');
    const aiFeedback = document.getElementById('aiFeedback');
    const statsContent = document.getElementById('statsContent');
    const trainerStatsContent = document.getElementById('trainerStatsContent');

    // Audio
    let audioCtx = null;
    let isPlaying = false;
    let keyerOsc = null;
    let keyerGain = null;
    let spaceKeyDownTime = 0;

    // Chart Variables
    let fluencyCharts = {}; // Map canvasId -> chart instance

    // Mastery Trainer Elements
    const drillCard = document.getElementById('drillCard');
    const targetCharElem = document.getElementById('targetChar');
    const morseHintElem = document.getElementById('morseHint');
    const drillInput = document.getElementById('drillInput');
    const drillFeedback = document.getElementById('drillFeedback');

    // Mastery State
    const currentSet = ['A', 'B', 'C', 'D'];
    const morseMap = {
        'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
        'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
        'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
        'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
        'Y': '-.--', 'Z': '--..',
        '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
        '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----'
    };
    let currentTarget = '';
    
    // Quiz State
    let quizTarget = '';
    let masteredChars = [];

    let isProcessing = false;

    // Helper: Get Morse (simple lookup now)
    function getMorseCode(char) {
        return morseMap[char] || '';
    }

    // --- Mode Switching ---
    function switchMode(mode) {
        // Hide all views
        Object.values(views).forEach(v => v.classList.add('hidden'));
        Object.values(modeBtns).forEach(b => b.classList.remove('active'));

        // Show selected
        if (mode === 'classic') {
            views.classic.classList.remove('hidden');
            modeBtns.classic.classList.add('active');
            startDrill();
            drillInput.focus();
            updateStats();
            updateAllCharts();
        } else if (mode === 'quiz') {
            views.quiz.classList.remove('hidden');
            modeBtns.quiz.classList.add('active');
            initQuiz();
        } else if (mode === 'ai') {
            views.ai.classList.remove('hidden');
            modeBtns.ai.classList.add('active');
            updateStats();
            updateAllCharts();
        }
    }

    modeBtns.classic.addEventListener('click', () => switchMode('classic'));
    modeBtns.quiz.addEventListener('click', () => switchMode('quiz'));
    modeBtns.ai.addEventListener('click', () => switchMode('ai'));
    
    backToTrainerBtn.addEventListener('click', () => switchMode('classic'));

    // Fetch Models on Load
    fetch('/api/models')
        .then(res => res.json())
        .then(data => {
            if (data.models && data.models.length > 0) {
                modelSelect.innerHTML = data.models.map(m => 
                    `<option value="${m}">${m.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`
                ).join('');
            }
        })
        .catch(err => console.error('Failed to fetch models:', err));

    // --- Mastery Trainer Logic ---
    function startDrill() {
        // Smart Random: Avoid immediate repeat unless set size is 1
        let nextChar = currentTarget;
        if (currentSet.length > 1) {
            while (nextChar === currentTarget) {
                nextChar = currentSet[Math.floor(Math.random() * currentSet.length)];
            }
        } else {
             nextChar = currentSet[0];
        }
        
        currentTarget = nextChar;
        const targetCode = morseMap[currentTarget]; // Get code here for length
        
        // Update UI
        targetCharElem.textContent = currentTarget;
        morseHintElem.textContent = targetCode;
        drillInput.value = '';
        drillFeedback.textContent = '';
        drillInput.style.borderColor = 'var(--glass-border)';
        
        // Input Constraints
        drillInput.maxLength = targetCode.length;
        drillInput.setAttribute('maxlength', targetCode.length); // Explicit attribute

        isProcessing = false;
        drillInput.focus();
    }

    drillInput.addEventListener('input', (e) => {
        if (isProcessing) return;
        
        const targetCode = morseMap[currentTarget];
        let input = e.target.value.trim();
        
        // Strict Constraint: Truncate if exceeds length
        if (input.length > targetCode.length) {
            input = input.slice(0, targetCode.length);
            e.target.value = input;
        }
        
        // Visual Feedback (Immediate)
        if (input === targetCode) {
            // Perfect match (also implies max length reached)
            handleDrillSuccess();
        } else if (targetCode.startsWith(input)) {
             // Partial correct
             drillFeedback.textContent = '';
             drillInput.style.borderColor = 'var(--glass-border)';
        } else {
             // Wrong char - Immediate Reset
             isProcessing = true; // Lock input
             
             drillFeedback.textContent = 'Incorrect!';
             drillFeedback.className = 'feedback-msg incorrect';
             drillInput.classList.add('shake');
             
             // Reset after delay
             setTimeout(() => {
                 drillInput.value = '';
                 drillInput.classList.remove('shake');
                 drillFeedback.textContent = '';
                 drillInput.style.borderColor = 'var(--glass-border)';
                 isProcessing = false; // Unlock
                 drillInput.focus();
             }, 800);
        }
    });

    function handleDrillSuccess() {
        isProcessing = true;
        drillFeedback.textContent = 'Correct!';
        drillFeedback.className = 'feedback-msg correct';
        drillInput.style.borderColor = '#4ade80';
        
        reportResult(currentTarget, true);

        setTimeout(() => {
            startDrill();
        }, 500);
    }

    // --- Quiz Logic ---
    async function initQuiz() {
        quizLocked.classList.add('hidden');
        quizActive.classList.add('hidden');
        
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            
            // Filter > 80% accuracy and at least 5 attempts (to be safe)
            masteredChars = data.stats
                .filter(s => s.accuracy >= 80 && s.attempts >= 5)
                .map(s => s.character);

            if (masteredChars.length < 3) {
                 quizLocked.classList.remove('hidden');
                 quizLocked.querySelector('p').innerHTML = `
                    You have mastered ${masteredChars.length} / 3 required letters.<br>
                    Need >80% accuracy (min 5 attempts) to master a letter.
                 `;
            } else {
                 quizActive.classList.remove('hidden');
                 startQuizRound();
            }
        } catch(e) {
            console.error("Quiz Init Error", e);
        }
    }

    function startQuizRound() {
        if (masteredChars.length === 0) return;
        
        let nextChar = quizTarget;
        if (masteredChars.length > 1) {
            while (nextChar === quizTarget) {
                nextChar = masteredChars[Math.floor(Math.random() * masteredChars.length)];
            }
        } else {
            nextChar = masteredChars[0];
        }
        
        quizTarget = nextChar;
        const targetCode = getMorseCode(quizTarget);

        quizTargetChar.textContent = quizTarget;
        quizInput.value = '';
        quizFeedback.textContent = '';
        quizInput.style.backgroundColor = 'rgba(0,0,0,0.2)';
        quizInput.style.borderColor = 'var(--accent-gold)';
        
        // Input Constraints
        quizInput.maxLength = targetCode.length;
        quizInput.setAttribute('maxlength', targetCode.length);

        quizInput.focus();
        isProcessing = false;
    }

    // Removed 'change' listener, using 'input' for auto-submit

    quizInput.addEventListener('input', (e) => {
        if (isProcessing) return;
        
        const targetCode = getMorseCode(quizTarget);
        let input = e.target.value.trim();

        // Strict Constraint: Truncate if exceeds length
        if (input.length > targetCode.length) {
            input = input.slice(0, targetCode.length);
            e.target.value = input;
        }

        if (input === targetCode) {
            isProcessing = true;
            quizFeedback.textContent = 'Excellent!';
            quizFeedback.className = 'feedback-msg correct';
            quizInput.style.borderColor = '#4ade80'; 

            reportResult(quizTarget, true);
            setTimeout(() => {
                startQuizRound();
            }, 800);
        } else if (targetCode.startsWith(input)) {
             quizInput.style.borderColor = 'var(--accent-gold)';
        } else {
             quizFeedback.textContent = 'Incorrect';
             quizFeedback.className = 'feedback-msg incorrect';
             quizInput.style.borderColor = '#f87171';
        }
        
        // Auto-validate failure at max length could go here
    });

    // START OF DOMCONTENTLOADED

    async function fetchTranslation(text) {
        const res = await fetch('/translate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text })
        });
        if (!res.ok) throw new Error('Translation failed');
        return await res.json();
    }

    // Play Audio (Shared or just remove if not needed for Drill yet? 
    // Plan didn't explicitly say remove Play Button logic but the button itself is gone from UI)
    // I'll keep the function but it won't be triggered by the button anymore since it's deleted.
    
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

    setupKeyer(drillInput); 
    setupKeyer(aiInput);

    // Initial Start
    startDrill();

    // --- AI Mode Logic ---
    // --- AI Mode Logic ---
    let currentAIChallengeMorse = '';

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
                aiInput.value = '';
                aiFeedback.textContent = '';
                aiInput.style.borderColor = 'var(--glass-border)';
                
                // Pre-fetch translation for constraints
                try {
                    const transData = await fetchTranslation(data.challenge);
                    currentAIChallengeMorse = transData.morse.replace(/\s\/\s/g, ' / ').replace(/\s+/g, ' ').trim();
                    
                    // Set Constraints
                    aiInput.maxLength = currentAIChallengeMorse.length;
                    aiInput.setAttribute('maxlength', currentAIChallengeMorse.length);
                    aiInput.focus();
                } catch (e) {
                    console.error("Translation error for constraints:", e);
                    // Fallback: remove limit if translation fails
                    aiInput.removeAttribute('maxlength');
                    currentAIChallengeMorse = '';
                }
            }
        } catch (e) {
            challengeText.textContent = "ERROR";
        } finally {
            nextChallengeBtn.disabled = false;
        }
    });

    // AI Validation
    aiInput.addEventListener('input', async (e) => {
        const input = e.target.value; 
        // Note: Don't trim immediately if we want to allow spaces while typing?
        // Actually Morse input often uses space separators.
        // Let's stick to simple trim for check, but raw input for length.
        
        if (!currentAIChallengeMorse) return;

        const targetCode = currentAIChallengeMorse;
        let val = input; // Don't trim for length check yet, or do?
        // Usually strict constraint means exact match of string constraints
        // If target has spaces, input needs spaces.
        
        // Strict Constraint: Truncate
        if (val.length > targetCode.length) {
            val = val.slice(0, targetCode.length);
            e.target.value = val;
        }

        const normalizedInput = val.replace(/\s+/g, ' ').trim();
        const normalizedTarget = targetCode.replace(/\s+/g, ' ').trim();

        if (val === targetCode) { // Exact strict match check first? 
            // Or use normalized for success?
            // Let's usage normalized for success to be forgiving of extra spaces if they fit?
            // But we have strict length constraint.
            
            if (normalizedInput === normalizedTarget) {
                 aiFeedback.textContent = 'Correct! 🎉';
                 aiFeedback.className = 'feedback-msg correct';
                 aiInput.style.borderColor = '#4ade80';
                 reportResult(challengeText.textContent, true);
                 // Optionally auto-advance or just let user click next
                 // setTimeout(() => nextChallengeBtn.click(), 1500); 
                 updateStats();
            } else {
                 // Length reached but not correct (Shake)
                 isProcessing = true;
                 aiFeedback.textContent = 'Incorrect';
                 aiFeedback.className = 'feedback-msg incorrect';
                 aiInput.classList.add('shake');
                 
                 setTimeout(() => {
                     aiInput.value = '';
                     aiInput.classList.remove('shake');
                     aiFeedback.textContent = '';
                     aiInput.style.borderColor = 'var(--glass-border)';
                     isProcessing = false;
                     aiInput.focus();
                 }, 800);
            }
        } else if (targetCode.startsWith(val)) {
             aiFeedback.textContent = '...';
             aiFeedback.className = 'feedback-msg';
             aiInput.style.borderColor = 'var(--glass-border)';
        } else {
             // Immediate feedback for wrong char?
             // Constraints usually allow typing until end unless we want immediate fail.
             // Trainer does immediate fail. AI mode might be harder.
             // Let's stick to "Shake at end" or "Red border if wrong prefix"
             if (!targetCode.startsWith(val)) {
                aiInput.style.borderColor = '#f87171';
             }
        }
    });

    async function reportResult(text, success) {
        if (aiInput.dataset.completed === text) return;
        aiInput.dataset.completed = text;

        await fetch('/api/report_result', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text, success: success })
        });
        
        // Update stats and chart
        updateStats();
        updateAllCharts();
    }

    async function updateStats() {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            
            const html = data.stats.length === 0 
                ? '<p>No stats yet. Practice more!</p>'
                : data.stats.map(s => `
                    <div class="stat-item">
                        <span>${s.character}</span>
                        <span>${s.accuracy.toFixed(0)}% (${s.successes}/${s.attempts})</span>
                    </div>
                `).join('');

            if (statsContent) statsContent.innerHTML = html;
            if (trainerStatsContent) trainerStatsContent.innerHTML = html;

        } catch (e) {
            console.error("Stats Error:", e);
        }
    }

    function updateAllCharts() {
        ['fluencyChart', 'trainerFluencyChart'].forEach(id => {
            if (document.getElementById(id)) {
                 updateChart(id);
            }
        });
    }

    async function updateChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            
            const history = data.history.reverse();
            
            const labels = [];
            const dataPoints = [];
            let windowSize = 5;
            
            for (let i = 0; i < history.length; i++) {
                let start = Math.max(0, i - windowSize + 1);
                let subset = history.slice(start, i + 1);
                let wins = subset.filter(h => h.is_success).length;
                let avg = (wins / subset.length) * 100;
                
                labels.push(i + 1);
                dataPoints.push(avg);
            }

            if (fluencyCharts[canvasId]) {
                fluencyCharts[canvasId].data.labels = labels;
                fluencyCharts[canvasId].data.datasets[0].data = dataPoints;
                fluencyCharts[canvasId].update();
            } else {
                fluencyCharts[canvasId] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Fluency (Moving Avg)',
                            data: dataPoints,
                            borderColor: '#4ade80',
                            backgroundColor: 'rgba(74, 222, 128, 0.1)',
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                            pointRadius: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            },
                            x: { display: false }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }

        } catch (e) {
            console.error("Chart Error:", e);
        }
    }

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
