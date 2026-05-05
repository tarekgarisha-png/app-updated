/**
 * beep.ts — Fixed version
 *
 * Problems with the original:
 * 1. 406KB MP3 takes too long to copy to cache — sound never loads in time
 * 2. soundLoading flag blocks ALL retries if first load fails silently
 * 3. FileSystem.copyAsync from bundled asset URI is unreliable on Android
 *
 * Fix:
 * - Load the sound directly from the require() asset without copying to cache
 * - Reset soundLoading flag on failure so next scan retries
 * - Keep vibration + haptics as instant fallback (these always work)
 * - Preload eagerly on import
 */

import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

// ─── Web beep (oscillator) ────────────────────────────────────────────────────

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

// ─── Native beep (expo-av) ────────────────────────────────────────────────────

// Use require() directly — Metro bundles the asset and gives a local URI
// that expo-av can load without any FileSystem.copyAsync step
const BEEP_ASSET = require("../assets/scan-beep.mp3");

let soundObject: any = null;
let loadPromise: Promise<any | null> | null = null;

async function loadSound(): Promise<any | null> {
  try {
    const { Audio } = await import("expo-av");

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });

    // Load directly from the bundled asset — no FileSystem copy needed
    const { sound } = await Audio.Sound.createAsync(
      BEEP_ASSET,
      { shouldPlay: false, volume: 1.0 },
    );

    soundObject = sound;
    return sound;
  } catch (e) {
    // Reset so next call retries instead of returning stale null
    loadPromise = null;
    soundObject = null;
    return null;
  }
}

function getSound(): Promise<any | null> {
  if (soundObject) return Promise.resolve(soundObject);
  if (!loadPromise) loadPromise = loadSound();
  return loadPromise;
}

async function playNativeBeep(): Promise<void> {
  try {
    const sound = await getSound();
    if (!sound) return;
    // Rewind to start so rapid scans always play from beginning
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Sound failed — vibration already fired so user still gets feedback
  }
}

// Preload as soon as this module is imported (app startup)
if (Platform.OS !== "web") {
  getSound().catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function beepAndShake(): Promise<void> {
  if (Platform.OS === "web") {
    playWebBeep(880, 90, 0.4);
    return;
  }

  // Vibration + haptics fire instantly (no async needed) — user feels it even
  // if the sound is still loading on first scan
  Vibration.vibrate([0, 30, 20, 30]);
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}

  // Sound plays after — if it fails, vibration already gave feedback
  await playNativeBeep();
}
