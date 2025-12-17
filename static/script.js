document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const morseOutput = document.getElementById('morseOutput');
    const placeholder = '<span class="placeholder">... --- ...</span>';

    // Focus input on load
    textInput.focus();

    textInput.addEventListener('input', async (e) => {
        const text = e.target.value;
        
        if (text.trim() === '') {
            morseOutput.innerHTML = placeholder;
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
            }, 100);

        } catch (error) {
            console.error('Error:', error);
            morseOutput.textContent = 'Error';
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
});
