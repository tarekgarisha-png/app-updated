import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (Platform.OS !== "web") return null;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playWebBeep(freq = 880, duration = 80, vol = 0.35) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    gainNode.gain.setValueAtTime(vol, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration / 1000,
    );
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000 + 0.01);
  } catch {
    // ignore
  }
}

export async function beepAndShake() {
  if (Platform.OS === "web") {
    playWebBeep(880, 90, 0.4);
    return;
  }
  Vibration.vibrate([0, 40, 25, 40]);
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // haptics not available on all devices
  }
}
