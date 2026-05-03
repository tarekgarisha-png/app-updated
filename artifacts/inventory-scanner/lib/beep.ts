import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

// ─── Web Beep (AudioContext) ──────────────────────────────────────────────────

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

// ─── Native Beep (expo-av + generated WAV) ────────────────────────────────────

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function generateBeepWavBase64(freq = 880, durationMs = 80): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);

  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(v, 36, "data");
  v.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / 80);
    const release = Math.min(1, (numSamples - i) / 150);
    const env = attack * release;
    const sample = Math.floor(
      env * 0.55 * 32767 * Math.sin(2 * Math.PI * freq * t),
    );
    v.setInt16(44 + i * 2, sample, true);
  }

  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

let soundCached: any = null;
let soundLoading = false;

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
    const b64 = generateBeepWavBase64(880, 80);
    const path = (FileSystem.cacheDirectory ?? "") + "inv_beep.wav";
    await FileSystem.writeAsStringAsync(path, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: path });
    soundCached = sound;
    return sound;
  } catch {
    return null;
  } finally {
    soundLoading = false;
  }
}

// Pre-warm the sound on native so first scan has no delay
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
  } catch {
    // fall back to vibration only
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function beepAndShake() {
  if (Platform.OS === "web") {
    playWebBeep(880, 90, 0.4);
    return;
  }
  Vibration.vibrate([0, 30, 20, 30]);
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // haptics not available on all devices
  }
  await playNativeBeep();
}
