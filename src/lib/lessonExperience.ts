type SoundKind = "tap" | "success" | "error" | "page" | "complete";

const SOUND_PATTERNS: Record<SoundKind, Array<{ frequency: number; duration: number; delay?: number; gain?: number }>> = {
  tap: [{ frequency: 520, duration: 0.045, gain: 0.035 }],
  page: [{ frequency: 360, duration: 0.05, gain: 0.028 }, { frequency: 520, duration: 0.06, delay: 0.045, gain: 0.025 }],
  success: [{ frequency: 540, duration: 0.07, gain: 0.035 }, { frequency: 760, duration: 0.09, delay: 0.06, gain: 0.035 }],
  error: [{ frequency: 240, duration: 0.09, gain: 0.035 }, { frequency: 180, duration: 0.11, delay: 0.07, gain: 0.03 }],
  complete: [{ frequency: 440, duration: 0.08, gain: 0.035 }, { frequency: 660, duration: 0.08, delay: 0.07, gain: 0.035 }, { frequency: 880, duration: 0.12, delay: 0.14, gain: 0.03 }],
};

let audioContext: AudioContext | null = null;

function getAudioContext() {
  const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ||= new AudioCtor();
  return audioContext;
}

export function playLessonSound(kind: SoundKind, enabled = true) {
  if (!enabled || typeof window === "undefined") return;
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  SOUND_PATTERNS[kind].forEach(({ frequency, duration, delay = 0, gain = 0.03 }) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + delay);
    envelope.gain.setValueAtTime(0.0001, now + delay);
    envelope.gain.exponentialRampToValueAtTime(gain, now + delay + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration + 0.02);
  });
}
