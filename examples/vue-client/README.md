# Uploadista Vue Client Example

Example playground showcasing the `@uploadista/vue` composables and components. The project mirrors the React demo, letting you connect to the local Uploadista servers, exercise common upload flows, and inspect results in real time.

## Prerequisites

- Node.js 18+
- `pnpm` (recommended for monorepo workflows)
- A running Uploadista server (`examples/express-server` or `examples/hono-server`)

## Getting Started

1. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Start an Uploadista backend in a separate terminal:

   ```bash
   cd examples/express-server # or examples/hono-server
   pnpm dev
   ```

3. Launch the Vue client example:

   ```bash
   cd examples/vue-client
   pnpm dev
   ```

   Vite opens the app on port `5174` by default. Update the server URL at the top of the UI if your backend runs elsewhere.

## Example Tabs

- **Basic Upload** – Single file upload with progress, retry, and abort controls.
- **Flow Upload** – Demonstrates running Uploadista flows with live WebSocket status updates and output inspection.
- **Multi Upload** – Queues multiple files, highlights aggregate progress, and manages retries.
- **Drag & Drop** – Dropzone interface that validates files, auto-starts uploads, and exposes queue controls.

Each tab uses the real `@uploadista/vue` composables (`useUpload`, `useFlowUpload`, `useMultiUpload`, `useDragDrop`) so behavior matches production usage.

## Troubleshooting

- **Uploads never start** – Confirm the server URL is correct and the backend example is running.
- **Flow tab stays in processing** – Make sure the backend flow definitions match the IDs shown in the selector.
- **Type errors or lint failures** – Run `pnpm check` inside `examples/vue-client` for Biome fixes and `pnpm build` to run `vue-tsc`.

For more detail on the Vue client API, see `packages/uploadista/clients/vue/README.md`.
