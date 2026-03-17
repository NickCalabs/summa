# summa-demo.tape
# VHS tape file for Summa terminal setup recording
# Install vhs: https://github.com/charmbracelet/vhs
# Run: vhs demos/summa-setup.tape

Output demos/summa-setup.gif
Output demos/summa-setup.mp4

Set Shell bash
Set FontSize 18
Set Width 90
Set Height 28
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 40ms
Set PlaybackSpeed 1

# Show the install flow
Type "git clone https://github.com/summa-app/summa" Sleep 500ms Enter
Sleep 2500ms
Type "cd summa" Sleep 300ms Enter
Sleep 500ms
Type "cp .env.example .env" Sleep 300ms Enter
Sleep 500ms
Type "docker compose up -d" Sleep 300ms Enter
Sleep 3500ms
# Simulate docker output (in real recording, actual docker output will appear)
Type "echo 'Open http://localhost:3000 to get started'" Sleep 300ms Enter
Sleep 2000ms
