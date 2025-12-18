document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const morseOutput = document.getElementById('morseOutput');
    const playBtn = document.getElementById('playBtn');
    const placeholder = '<span class="placeholder">... --- ...</span>';

    // Audio Context (initialized on user interaction)
    let audioCtx = null;
    let isPlaying = false;

    // Focus input on load
    textInput.focus();

    textInput.addEventListener('input', async (e) => {
        const text = e.target.value;
        
        if (text.trim() === '') {
            morseOutput.innerHTML = placeholder;
            playBtn.disabled = true;
            return;
        }

        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            
            // Animation effect for updating text
            morseOutput.style.opacity = '0';
            setTimeout(() => {
                morseOutput.textContent = data.morse;
                morseOutput.style.opacity = '1';
                playBtn.disabled = false;
            }, 100);

        } catch (error) {
            console.error('Error:', error);
            morseOutput.textContent = 'Error';
            playBtn.disabled = true;
        }
    });

    // Prevent multiple characters if user tries to paste
    textInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.originalEvent || e).clipboardData.getData('text/plain');
        if (text.length > 0) {
            document.execCommand('insertText', false, text.substring(0, 1));
        }
    });

    // Audio Logic
    playBtn.addEventListener('click', async () => {
        if (isPlaying) return;
        
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume context if suspended (browser policy)
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        
        const morseCode = morseOutput.textContent;
        playMorseCode(morseCode);
    });

    async function playMorseCode(code) {
        isPlaying = true;
        playBtn.disabled = true;
        playBtn.innerHTML = 'Playing...';

        const dotDuration = 0.08; // Seconds
        const dashDuration = dotDuration * 3;
        const symbolSpace = dotDuration;
        const letterSpace = dotDuration * 3;
        const wordSpace = dotDuration * 7;
        const frequency = 600; // Hz

        let currentTime = audioCtx.currentTime;

        // Small initial delay to ensure smooth start
        currentTime += 0.1;

        for (let char of code) {
            if (char === '.') {
                createTone(currentTime, dotDuration, frequency);
                currentTime += dotDuration;
            } else if (char === '-') {
                createTone(currentTime, dashDuration, frequency);
                currentTime += dashDuration;
            } else if (char === ' ') {
                currentTime += symbolSpace; // Basic space, logical spacing handled by / or spaces in string
            } else if (char === '/') {
                currentTime += wordSpace;
            }
            
            // Add gap after every tone (except the last one strictly speaking, but consistent gap is fine)
            if (char === '.' || char === '-') {
                currentTime += symbolSpace;
            }
        }

        // Reset UI after playback
        const totalDuration = (currentTime - audioCtx.currentTime) * 1000;
        setTimeout(() => {
            isPlaying = false;
            playBtn.disabled = false;
            playBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                Play Audio
            `;
        }, totalDuration);
    }

    function createTone(startTime, duration, freq) {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.01); // Attack
        gainNode.gain.setValueAtTime(0.5, startTime + duration - 0.01);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    // Practice Logic
    const practiceInput = document.getElementById('practiceInput');
    const feedback = document.getElementById('feedback');

    practiceInput.addEventListener('input', (e) => {
        const input = e.target.value.trim();
        const target = morseOutput.textContent.trim();

        if (input === target) {
            feedback.textContent = 'Correct! 🎉';
            feedback.className = 'feedback-msg correct';
            practiceInput.style.borderColor = '#4ade80';
        } else if (target.startsWith(input)) {
            feedback.textContent = 'Keep going...';
            feedback.className = 'feedback-msg';
            practiceInput.style.borderColor = 'var(--glass-border)';
        } else {
            feedback.textContent = 'Incorrect ❌';
            feedback.className = 'feedback-msg incorrect';
            practiceInput.style.borderColor = '#f87171';
        }
    });

    // Enable practice input when valid morse is shown
    const observer = new MutationObserver(() => {
        const content = morseOutput.textContent.trim();
        if (content && content !== '...' && content !== 'Error' && content !== '... --- ...') {
            practiceInput.disabled = false;
            practiceInput.value = '';
            practiceInput.focus();
            feedback.textContent = '';
            practiceInput.style.borderColor = 'var(--glass-border)';
        } else {
            practiceInput.disabled = true;
            practiceInput.value = '';
            feedback.textContent = '';
        }
    });

    observer.observe(morseOutput, { childList: true, characterData: true, subtree: true });
});
