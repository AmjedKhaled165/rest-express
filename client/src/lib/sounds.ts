let audioContext: AudioContext | null = null;
let musicOscillators: OscillatorNode[] = [];
let musicGainNode: GainNode | null = null;
let musicInterval: NodeJS.Timeout | null = null;
let isMusicPlaying = false;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "square", volume: number = 0.1) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio not supported or blocked
  }
}

export function playMoveSound() {
  playTone(200, 0.05, "square", 0.05);
}

export function playRotateSound() {
  playTone(300, 0.08, "sine", 0.08);
}

export function playDropSound() {
  playTone(150, 0.15, "square", 0.12);
  setTimeout(() => playTone(100, 0.1, "square", 0.08), 50);
}

export function playLandSound() {
  playTone(80, 0.1, "square", 0.1);
}

export function playLineClearSound(lines: number) {
  const baseFreq = 400;
  for (let i = 0; i < lines; i++) {
    setTimeout(() => {
      playTone(baseFreq + i * 100, 0.15, "sine", 0.15);
    }, i * 80);
  }
  setTimeout(() => playTone(800, 0.2, "sine", 0.12), lines * 80);
}

export function playLevelUpSound() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, "sine", 0.12), i * 100);
  });
}

export function playGameOverSound() {
  const notes = [400, 350, 300, 250, 200];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, "sawtooth", 0.1), i * 150);
  });
}

export function playStartSound() {
  const notes = [262, 330, 392, 523];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.12, "sine", 0.1), i * 80);
  });
}

// Background music - Tetris-inspired melody at low volume
const musicNotes = [
  // Classic Tetris-style melody pattern (frequencies in Hz)
  { freq: 659, dur: 0.2 },  // E5
  { freq: 494, dur: 0.1 },  // B4
  { freq: 523, dur: 0.1 },  // C5
  { freq: 587, dur: 0.2 },  // D5
  { freq: 523, dur: 0.1 },  // C5
  { freq: 494, dur: 0.1 },  // B4
  { freq: 440, dur: 0.2 },  // A4
  { freq: 440, dur: 0.1 },  // A4
  { freq: 523, dur: 0.1 },  // C5
  { freq: 659, dur: 0.2 },  // E5
  { freq: 587, dur: 0.1 },  // D5
  { freq: 523, dur: 0.1 },  // C5
  { freq: 494, dur: 0.3 },  // B4
  { freq: 523, dur: 0.1 },  // C5
  { freq: 587, dur: 0.2 },  // D5
  { freq: 659, dur: 0.2 },  // E5
  { freq: 523, dur: 0.2 },  // C5
  { freq: 440, dur: 0.2 },  // A4
  { freq: 440, dur: 0.3 },  // A4
  { freq: 0, dur: 0.2 },    // Rest
  { freq: 587, dur: 0.2 },  // D5
  { freq: 698, dur: 0.1 },  // F5
  { freq: 880, dur: 0.2 },  // A5
  { freq: 784, dur: 0.1 },  // G5
  { freq: 698, dur: 0.1 },  // F5
  { freq: 659, dur: 0.3 },  // E5
  { freq: 523, dur: 0.1 },  // C5
  { freq: 659, dur: 0.2 },  // E5
  { freq: 587, dur: 0.1 },  // D5
  { freq: 523, dur: 0.1 },  // C5
  { freq: 494, dur: 0.2 },  // B4
  { freq: 494, dur: 0.1 },  // B4
  { freq: 523, dur: 0.1 },  // C5
  { freq: 587, dur: 0.2 },  // D5
  { freq: 659, dur: 0.2 },  // E5
  { freq: 523, dur: 0.2 },  // C5
  { freq: 440, dur: 0.2 },  // A4
  { freq: 440, dur: 0.3 },  // A4
  { freq: 0, dur: 0.3 },    // Rest
];

let musicNoteIndex = 0;

function playMusicNote() {
  if (!isMusicPlaying) return;
  
  try {
    const ctx = getAudioContext();
    const note = musicNotes[musicNoteIndex];
    
    if (note.freq > 0) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.freq, ctx.currentTime);
      
      // Low volume so it doesn't interfere with sound effects
      const volume = 0.11;
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.dur * 0.9);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + note.dur);
    }
    
    musicNoteIndex = (musicNoteIndex + 1) % musicNotes.length;
    
    // Schedule next note
    const nextDelay = note.dur * 1000;
    musicInterval = setTimeout(playMusicNote, nextDelay);
  } catch (e) {
    // Audio not supported
  }
}

export function startBackgroundMusic() {
  if (isMusicPlaying) return;
  isMusicPlaying = true;
  musicNoteIndex = 0;
  playMusicNote();
}

export function stopBackgroundMusic() {
  isMusicPlaying = false;
  if (musicInterval) {
    clearTimeout(musicInterval);
    musicInterval = null;
  }
}

export function isMusicActive(): boolean {
  return isMusicPlaying;
}
