let audioContext: AudioContext | null = null;

export function unlockCooldownNotificationSound() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;

  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    // Sound is optional; the on-screen cooldown completion message remains available.
  }
}

export function playCooldownNotificationSound() {
  if (!audioContext) return;

  const play = () => {
    if (!audioContext || audioContext.state !== "running") return;

    const startAt = audioContext.currentTime + 0.02;
    for (const [index, frequency] of [880, 1175].entries()) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = startAt + index * 0.19;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    }
  };

  if (audioContext.state === "suspended") {
    void audioContext.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
