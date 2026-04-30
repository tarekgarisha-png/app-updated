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

- **Stack**: Expo SDK 54, expo-router, React Native, AsyncStorage (no backend, fully offline)
- **Features**:
  - Barcode scanner with SALE/PURCHASE modes (`expo-camera` `CameraView`)
  - Manual barcode entry (works on web)
  - Scan queue with quantity adjustments before commit
  - Product CRUD (`app/product-form.tsx`) with low-stock alerts
  - In-form barcode camera scan via `components/BarcodeScannerModal.tsx`
  - Bulk CSV import (`app/import-csv.tsx` + `lib/csvImport.ts`); uses `expo-document-picker` on native, hidden `<input type="file">` on web; tolerant header mapping (Barcode/SKU/Code, Name, Arabic Name, Stock, Min Stock, Unit, Price)
  - Transaction history with filtering, search, and CSV export (`expo-file-system/legacy` + `expo-sharing`; web uses Blob download)
  - Settings screen for language toggle (EN/AR)
- **State**: `contexts/InventoryContext.tsx` (provider + `useT` hook)
- **Storage keys**: `inventory:products:v1`, `inventory:history:v1`, `inventory:lang:v1`
- **i18n**: `lib/i18n.ts` — `tFor(lang, key, ...args)` + `isRTLFor(lang)`. RTL handled via `flexDirection: row-reverse` and `textAlign: right`.
