# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### inventory-scanner (Expo mobile app)

Bilingual (English/Arabic + RTL) barcode-based inventory app for retail.

- **Stack**: Expo SDK 54, expo-router, React Native, AsyncStorage (offline-first) + optional API server sync
- **Features**:
  - **Shift system**: 2 password-protected shifts (Shift 1 / Shift 2). Lock screen on launch — select shift → enter 4-digit PIN. Default PINs: `1234` (Shift 1), `5678` (Shift 2). Configurable in Settings. Each HistoryEntry tagged with `shiftId`.
  - **Real-time sync**: `POST /api/sync` merges data between devices. Products merge by `updatedAt` timestamp (newer wins). History is a union by ID with OR'd boolean flags (paid, returned). Payments are append-only. Sync fires automatically after commits/saves. Manual "Sync Now" button in Settings. Server URL configurable in Settings.
  - Barcode scanner with SALE/PURCHASE/CREDIT/RETURN modes (`expo-camera` `CameraView`)
  - Native beep on barcode scan: 880Hz WAV generated in JS, written to cache, played via `expo-av`; web uses AudioContext
  - Manual barcode entry (works on web)
  - Scan queue with quantity adjustments before commit
  - Product CRUD (`app/product-form.tsx`) with low-stock alerts
  - History with bill groups, return actions (whole bill or per-item), and PDF print/share via `expo-print` + `expo-sharing`
  - Debts screen: per-person debt summaries, partial payments, remaining owed tracking
  - CSV export for products, history, debts (data management in Settings)
  - In-form barcode camera scan via `components/BarcodeScannerModal.tsx`
  - Bulk CSV import (`app/import-csv.tsx`); tolerant header mapping
  - Settings screen: language toggle (EN/AR), shift PIN management, sync URL + status
- **State**: `contexts/InventoryContext.tsx` + `contexts/ShiftContext.tsx`
- **Storage keys**: `inventory:products:v1`, `inventory:history:v1`, `inventory:lang:v1`, `inventory:partial_payments:v1`, `inventory:sync_url:v1`, `inventory:last_synced:v1`, `inventory:shift1_pin:v1`, `inventory:shift2_pin:v1`
- **i18n**: `lib/i18n.ts` — `tFor(lang, key, ...args)` + `isRTLFor(lang)`. RTL handled via `flexDirection: row-reverse` and `textAlign: right`.
- **Sync**: `lib/sync.ts` client ↔ `artifacts/api-server/src/routes/sync.ts` (POST /api/sync). Server store: in-memory + `/tmp/qasoda_sync.json` backup (`artifacts/api-server/src/lib/store.ts`).

### api-server (Express API)

- **Base path**: `/api`
- **Endpoints**:
  - `GET /api/healthz` — health check
  - `GET /api/sync` — pull full shared dataset
  - `POST /api/sync` — push local data, receive merged dataset back
- **Store**: `src/lib/store.ts` — in-memory store persisted to `/tmp/qasoda_sync.json`
