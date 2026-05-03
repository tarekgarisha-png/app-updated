import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";
import beepAsset from "../assets/scan-beep.mp3";

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
  } catch {}
}

let soundCached: any = null;
let soundLoading = false;
let soundPath: string | null = null;

async function getNativeBeepSound(): Promise<any | null> {
  if (soundCached) return soundCached;
  if (soundLoading) return null;
  soundLoading = true;
  try {
    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
    });
    if (!soundPath) {
      const uri = beepAsset as string;
      if (!uri) return null;
      soundPath = `${FileSystem.cacheDirectory ?? ""}scan-beep.mp3`;
      await FileSystem.copyAsync({ from: uri, to: soundPath });
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: soundPath },
      { shouldPlay: false },
    );
    soundCached = sound;
    return sound;
  } catch {
    return null;
  } finally {
    soundLoading = false;
  }
}

if (Platform.OS !== "web") {
  getNativeBeepSound().catch(() => {});
}

async function playNativeBeep() {
  try {
    const sound = await getNativeBeepSound();
    if (sound) {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    }
  } catch {}
}

export async function beepAndShake() {
  if (Platform.OS === "web") {
    playWebBeep(880, 90, 0.4);
    return;
  }
  Vibration.vibrate([0, 30, 20, 30]);
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
  await playNativeBeep();
}
