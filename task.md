# old Task 1
We want to use the spacebar as a "tapper" as if we are on a morse code machine where a tapper is used to send morse code.  The spacebar will be used to send a dot or a dash.  

# old Task 2
Hook this up in GCP
Create a home page where users can click a button to enter classic mode which is the current state or the user can click a button to enter AI mode which I willl explain below.

For AI mode, Gemini will choose a letter, or a word, or sentence, based on past performance so a user will improve their memory of morse code progressivly.

# old Task 3 
Improve upon Task 2 AI Mode and more specifically, instead of using a fixed model version please include a dropdown so the user can choose the latest gemini and gemma models avaialbe from aistudio.google.com or models I have enabled in Vertex AI model garden in my GCP. 

# old Task 4
Utilize a database to keep track of the users fluency on each morse code letter, word, and sentence. Show the user how many times they were succesful vs unsuccessful over time.  



# old Phase 1: The Foundation (Layout & Input)
This prompt establishes the basic UI and the ability to recognize Morse input for a specific set of letters.

Prompt: "Let's rebuild the Morse app to be a mastery-based trainer. Start by creating a clean, minimalist UI that displays a 'Current Set' of 4 letters (e.g., A, B, C, D). For each letter, show the character and its Morse code equivalent (dots and dashes). Below that, provide an input field where I can type the Morse code (using '.' and '-'). Add a listener so that when I finish typing a sequence, it checks if it matches the current letter I'm being quizzed on. No scoring yet—just get the display and the input matching logic working."

# old Phase 2: The Statistics Engine (Tracking Success)  
Now we add the "brain" that tracks how well you are doing with those specific letters.

Prompt: "Now, let's add the tracking logic. Create a state to track 'Success' and 'Failure' for each letter in the current set.

1. If I type the code correctly, increment success; if wrong, increment failure.  
2. Calculate a 'Mastery Percentage' for each letter (Success / 10 Attempts).  
3. Display these percentages subtly next to each letter.  
4. Ensure the app cycles through only the 4 letters in the current set randomly."

# old **Phase 3: The Mastery Logic (The 85% Rule)**

This is where we implement your specific rules for "Leveling Up" and switching to Quiz Mode.

**Prompt:** "Let's implement the progression logic.

1. **Phase A (Learning):** Show the letters and their Morse code. Keep me in this phase until every letter in the current set has an 85% success rate.  
2. **Phase B (Quizzing):** Once that 85% threshold is hit for all letters in the set, hide the Morse code hints and show the letter only and make me type the morse also show the morse on the screen as i tap it out on the spacebar  
3. **Phase C (Level Up):** Once I hit 80% accuracy in the 'Quiz' phase for the current set, trigger a 'Level Up.' Clear the current set and got back to Phase 1 with the next 4 letters in the alphabet to learn.

# old **Phase 4: Polish & Feedback (The "Vibe")**

Finally, add the sensory details that make the app feel good to use.

**Prompt:** "Let's finish the vibe.

1. Add visual feedback: Flash the screen green for a correct answer and a subtle red shake for a wrong one.  
2. Add a 'Mastery Bar' at the top showing how many letters of the alphabet (A-Z) I've completed.  
3. Add a short audio 'beep' for dots and a long 'beep' for dashes as I use the space bar as a tapper for the morse code so I can hear the Morse code rhythm."

# **Prompt 1: Input Constraint Logic**

**Goal:** Prevent the user from typing more dots/dashes than the current letter actually requires.

**Prompt:** "Let's add a strict input constraint. For the current letter being quizzed, the app should know exactly how many Morse characters (dots and dashes) make up its code.

1. Set a 'max length' for the input field equal to the length of the current letter's Morse code.  
2. Once that length is reached, the app should immediately validate the answer (don't wait for me to press Enter).  
3. Prevent any further typing or characters from being entered once the max length is hit."

# **Prompt 2: The "Give Up" Button (Learning from Failure)**

**Goal:** Add a way to skip a letter while ensuring the "Success Rate" logic still accounts for it as a failure.

**Prompt:** "Next Character' button below the input area.

1. If I click 'Next Character,' count the current attempt as a 'Failure' for that letter's statistics.  
2. Briefly show the correct Morse code as a reminder if I give up.  
3. After a 1-second delay, automatically move to the next random letter in the current set of 4.  
4. Style the button to be subtle so it doesn't distract from the main interface."

# **Prompt 3: Visual Progress Indicators**

**Goal:** Since you're tracking character counts now, let's make that visual so you know how many dots/dashes are left to type.

**Prompt:** "To help me stay on track with the character limit, add a series of 'Empty Slots' or placeholders (like underscores or empty circles) that represent the number of Morse characters needed for the current letter. As I type a dot or a dash, fill in those slots in real-time. This will give me a visual cue of how much of the code I have left to enter."