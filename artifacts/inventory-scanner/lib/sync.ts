import AsyncStorage from "@react-native-async-storage/async-storage";

import type { HistoryEntry, PartialPayment, Product } from "./types";

export type SyncStatus = "idle" | "syncing" | "ok" | "error" | "off";

const SYNC_URL_KEY = "inventory:sync_url:v1";
const LAST_SYNCED_KEY = "inventory:last_synced:v1";

const DEFAULT_URL: string = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api`
  : "";

export async function getSyncUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(SYNC_URL_KEY);
  return stored ?? DEFAULT_URL;
}

export async function saveSyncUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SYNC_URL_KEY, url.trim());
}

export async function getLastSynced(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNCED_KEY);
}

export async function saveLastSynced(ts: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNCED_KEY, ts);
}

export type SyncPayload = {
  products: Product[];
  history: HistoryEntry[];
  partialPayments: PartialPayment[];
};

export async function pushAndPull(
  serverUrl: string,
  local: SyncPayload,
): Promise<SyncPayload> {
  if (!serverUrl) throw new Error("noSyncUrl");
  const url = `${serverUrl.replace(/\/+$/, "")}/sync`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(local),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as SyncPayload & { updatedAt?: string };
  return {
    products: data.products ?? [],
    history: data.history ?? [],
    partialPayments: data.partialPayments ?? [],
  };
}
