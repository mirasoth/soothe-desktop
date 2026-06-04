# soothe-desktop

Electron + React desktop client for the Soothe daemon. Implements RFC-505 (Soothe Desktop Client Architecture) and IG-465 (Soothe Desktop MVP).

> **Status**: MVP. Connects to a user-managed `soothed`, opens multiple loops as tabs, streams reasoning/tool/diff events, supports inline clarification, slash command palette, and image attachments.

## Requirements

- Node.js ≥ 20
- pnpm (recommended) or npm
- A running `soothed` reachable at `ws://127.0.0.1:8765` (configurable in Settings)

Install the daemon and start it once before launching the desktop app:

```bash
# in the soothe monorepo root
pip install -e packages/soothe-daemon
soothed start
```

## Development

```bash
npm install       # (or pnpm install)
npm run dev       # electron-vite dev with HMR
```

The window opens at startup. If the daemon isn't reachable, the EmptyState shows a copy-pasteable `soothed start` snippet and a Retry button.

> **Note**: The `dev`/`build`/`package` scripts prefix `NODE_OPTIONS=` to clear
> any shell-level `NODE_OPTIONS` (e.g. `--no-deprecation`). Electron's launcher
> rejects most flags for hardening, even in dev. If you run `electron-vite`
> directly, do `NODE_OPTIONS= electron-vite dev`.

## Build / Package

```bash
pnpm build                # bundle main + preload + renderer to out/
pnpm package              # bundle, then electron-builder for current platform
pnpm package:mac          # macOS DMG (arm64 + x64)
```

Output: `release/` directory.

## Testing

```bash
pnpm test           # vitest run
pnpm typecheck      # tsc --noEmit for renderer + main
pnpm lint
```

Unit tests cover state slices, the event-renderer registry, IPC payload contracts, and composer keymap.

## Architecture

See [RFC-505](../../docs/specs/RFC-505-soothe-desktop-client.md) and [IG-465](../../docs/impl/IG-465-soothe-desktop-mvp.md).

Briefly:
- **Main process** owns all WebSocket connections via `soothe-client-typescript`. One `Client` per open tab.
- **Renderer** is a typed IPC consumer with no socket state of its own.
- **Event registry** keys React renderers off the daemon's `soothe.<domain>.<component>.<action>` event types (RFC-403); unknown types render a debug fallback.

## Layout

```
src/
├── shared/            # IPC channel definitions, payload types
├── main/              # Electron main: window, IPC handlers, WSManager
├── preload/           # contextBridge → window.soothe API
└── renderer/          # React UI
    ├── app/           # App shell, Sidebar, TabBar, TabView
    ├── features/      # chat, composer, clarification, settings, command-palette
    ├── event-renderers/ # registry + per-event-family cards
    ├── state/         # zustand store + slices
    ├── lib/           # ipc accessor, markdown, diff, attachments
    └── ui/            # shadcn primitives
```
