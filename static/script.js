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

    // Chart Variables
    let fluencyChart = null;

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
            updateChart();
        }
    }

    modeBtns.classic.addEventListener('click', () => switchMode('classic'));
    modeBtns.ai.addEventListener('click', () => switchMode('ai'));

    // ... (rest of simple fetch logic omitted, keeping it clean) ... 
    // actually I need to preserve the fetch models logic if I'm replacing this block, 
    // but the replacement target is safe.

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
    setupKeyer(aiInput);

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
        const challenge = challengeText.textContent; 
        
        if (!challenge || challenge === "THINKING..." || challenge === "ERROR") return;

        try {
            const data = await fetchTranslation(challenge);
            const targetMorse = data.morse.replace(/\s\/\s/g, ' / '); 
            
            const normalizedInput = input.replace(/\s+/g, ' ').trim();
            const normalizedTarget = targetMorse.replace(/\s+/g, ' ').trim();

            if (normalizedInput === normalizedTarget) {
                aiFeedback.textContent = 'Correct! 🎉';
                aiFeedback.className = 'feedback-msg correct';
                aiInput.style.borderColor = '#4ade80';
                reportResult(challenge, true);
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
        if (aiInput.dataset.completed === text) return;
        aiInput.dataset.completed = text;

        await fetch('/api/report_result', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text, success: success })
        });
        
        // Update stats and chart
        updateStats();
        updateChart();
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

    async function updateChart() {
        const ctx = document.getElementById('fluencyChart');
        if (!ctx) return;

        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            
            // Reverse to get chronological order (oldest to newest)
            const history = data.history.reverse();
            
            // Calculate Moving Average Accuracy (Window 5)
            const labels = [];
            const dataPoints = [];
            let windowSize = 5;
            
            for (let i = 0; i < history.length; i++) {
                // Get sub-array for window
                let start = Math.max(0, i - windowSize + 1);
                let subset = history.slice(start, i + 1);
                let wins = subset.filter(h => h.is_success).length;
                let avg = (wins / subset.length) * 100;
                
                labels.push(i + 1); // Attempt number
                dataPoints.push(avg);
            }

            if (fluencyChart) {
                fluencyChart.data.labels = labels;
                fluencyChart.data.datasets[0].data = dataPoints;
                fluencyChart.update();
            } else {
                fluencyChart = new Chart(ctx, {
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
                            x: {
                                display: false // Hide x axis clutter
                            }
                        },
                        plugins: {
                            legend: { display: false }
                        }
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
