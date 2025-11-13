# Web

The web app is a Next.js 15 App Router application. It contains public pages,
auth pages, the authenticated dashboard, and the React Flow editor.

## Main Areas

- `app/page.tsx`: public landing page.
- `app/auth/*`: sign-in, sign-up, Google OAuth start, and callback route.
- `app/app/layout.tsx`: authenticated shell wrapper.
- `components/app-shell/AppShell.tsx`: sidebar, top bar, sign-out, and page
  chrome.
- `app/app/flows/*`: workflow list and editor route.
- `app/app/runs/*`: run history, filters, sorting, detail timeline, delete.
- `app/app/triggers/page.tsx`: webhook and schedule trigger management.
- `app/app/custom-nodes/page.tsx`: prompt-template custom node builder.
- `app/app/integrations/page.tsx`: provider key storage and connection tests.
- `app/p/[token]/*`: public form execution and result view.

## Editor

The editor lives under `components/editor/`.

- `EditorClient.tsx`: React Flow canvas, node/edge state, save/run logic,
  realtime subscriptions, and keyboard/editor interactions.
- `EditorPalette.tsx`: node creation palette.
- `EditorTopBar.tsx`: editor-level navigation and run controls.
- `RunSidebar.tsx`: active run timeline and node outputs.
- `RunHistoryPanel.tsx`: recent run list for the current flow.
- `NodeFrame.tsx`: shared node chrome.
- `NodeHandleWrapper.tsx`: connection handles and visual affordances.
- `nodes/*`: concrete node renderers.

The editor route is intentionally chrome-less in `AppShell` so React Flow can
own the viewport.

## State And Data

- `lib/api.ts`: typed fetch helpers for the backend API.
- `lib/supabase/client.ts`: browser Supabase client.
- `lib/supabase/server.ts`: server Supabase client for App Router routes.
- `middleware.ts`: protects `/app/*` and redirects logged-in users away from
  auth pages.
- `components/editor/run-state-context.tsx`: node run status store.
- `components/editor/order-context.tsx` and `use-topo-order.ts`: visual topo
  badges and scoped execution hints.

## Styling

Global design tokens live in `app/globals.css`; editor-specific rules live in
`components/editor/editor.css`. Shared primitives are in `components/ui/`.

Keep new dashboard pages aligned with the existing pattern:

- Page title.
- One line of muted subtext.
- Utility controls in restrained, token-based UI.
- Cards only for repeated items, modals, and framed tools.

## Auth

Email/password uses Supabase browser auth. Google sign-in starts at
`/auth/google`, which creates the Supabase OAuth URL on the server and redirects
the browser. `/auth/callback` exchanges the returned code for a session.

This keeps the OAuth redirect handling consistent between local development and
production deployments.
