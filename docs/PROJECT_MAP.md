# Project Map

This map explains the purpose of each source file currently tracked in the
project.

## Root

- `README.md`: quick start and product summary.
- `ARCHITECTURE.md`: earlier architecture overview kept for compatibility;
  this docs folder is now the canonical expanded documentation.

## API

- `api/README.md`: API-specific local development notes.
- `api/__init__.py`: package marker.
- `api/config.py`: environment settings.
- `api/db.py`: Supabase REST and realtime helpers.
- `api/deps.py`: authenticated request dependencies.
- `api/main.py`: FastAPI app and router registration.
- `api/queue.py`: run queue enqueue helpers.
- `api/scheduler.py`: schedule trigger runner.
- `api/schemas.py`: Pydantic contracts.
- `api/supabase_url.py`: Supabase URL normalization.
- `api/worker.py`: background run worker.
- `api/requirements.txt`: Python dependencies.
- `api/pytest.ini`: pytest configuration.

### API Engine

- `api/engine/context.py`: execution context and event emission.
- `api/engine/executor.py`: graph run orchestration.
- `api/engine/graph.py`: graph validation and topo helpers.
- `api/engine/nodes/chat.py`: chat node input/output state behavior.
- `api/engine/nodes/file.py`: file box output normalization.
- `api/engine/nodes/fileparser.py`: file parsing node.
- `api/engine/nodes/inputs.py`: trigger and boundary input helpers.
- `api/engine/nodes/integrations.py`: selected integration credential loading.
- `api/engine/nodes/llm.py`: text AI node executor and model routing.
- `api/engine/nodes/media.py`: image/audio node executor.
- `api/engine/nodes/passthrough.py`: static node pass-through behavior.
- `api/engine/nodes/prompt_template.py`: custom prompt-template execution.
- `api/engine/nodes/subflow.py`: flow-as-node execution.
- `api/engine/nodes/trigger_input.py`: trigger input payload behavior.

### API Providers

- `api/providers/base.py`: provider result type and base interface.
- `api/providers/openai_provider.py`: OpenAI adapter.
- `api/providers/gemini_provider.py`: Gemini adapter.
- `api/providers/cloudflare_provider.py`: Workers AI adapter.
- `api/providers/deepseek_provider.py`: DeepSeek adapter.
- `api/providers/__init__.py`: provider registry.

### API Routers

- `api/routers/flows.py`: workflow CRUD and run creation.
- `api/routers/runs.py`: run list/detail/delete/cancel behavior.
- `api/routers/triggers.py`: trigger CRUD and webhook ingress.
- `api/routers/custom_nodes.py`: custom node CRUD.
- `api/routers/integrations.py`: provider integration CRUD and tests.
- `api/routers/media.py`: media endpoints.

### API Tests

- `api/tests/conftest.py`: fixtures and fakes.
- `api/tests/test_executor.py`: executor scenarios.
- `api/tests/test_graph.py`: graph utility tests.
- `api/tests/test_nodes.py`: node behavior tests.
- `api/tests/test_providers.py`: provider contract tests.
- `api/tests/test_routers.py`: route behavior tests.

## Web

- `web/app/layout.tsx`: root document, metadata, theme provider, favicon.
- `web/app/globals.css`: global tokens and base styles.
- `web/app/page.tsx`: landing page.
- `web/middleware.ts`: Supabase SSR route protection.
- `web/next.config.ts`: Next configuration.
- `web/package.json`: scripts and dependencies.
- `web/tsconfig.json`: TypeScript configuration.
- `web/vitest.config.ts`: unit test configuration.
- `web/playwright.config.ts`: e2e test configuration.

### Web Routes

- `web/app/auth/sign-in/page.tsx`: sign-in page.
- `web/app/auth/sign-up/page.tsx`: sign-up page.
- `web/app/auth/google/route.ts`: Google OAuth start route.
- `web/app/auth/callback/route.ts`: Supabase auth callback.
- `web/app/app/layout.tsx`: authenticated dashboard layout.
- `web/app/app/page.tsx`: dashboard home.
- `web/app/app/flows/page.tsx`: workflows list.
- `web/app/app/flows/[flowId]/page.tsx`: editor page.
- `web/app/app/runs/page.tsx`: run list with filters and sorting.
- `web/app/app/runs/[runId]/page.tsx`: run detail timeline.
- `web/app/app/triggers/page.tsx`: trigger management.
- `web/app/app/custom-nodes/page.tsx`: custom node builder.
- `web/app/app/integrations/page.tsx`: provider integrations.
- `web/app/app/profile/page.tsx`: profile page.
- `web/app/app/profile/ProfileSignOut.tsx`: profile sign-out button.
- `web/app/p/[token]/page.tsx`: public form page.
- `web/app/p/[token]/result/[runId]/page.tsx`: public run result.

### Web Components

- `web/components/app-shell/AppShell.tsx`: dashboard sidebar and top bar.
- `web/components/brand/BrandWordmark.tsx`: shared icon plus wordmark.
- `web/components/theme-provider.tsx`: theme wrapper.
- `web/components/ui/button.tsx`: shared button primitive.
- `web/components/ui/confirm-dialog.tsx`: shared confirmation modal.

### Editor Components

- `web/components/editor/EditorClient.tsx`: editor coordinator.
- `web/components/editor/EditorPalette.tsx`: node palette.
- `web/components/editor/EditorTopBar.tsx`: editor top bar.
- `web/components/editor/BackendBox.tsx`: visual backend node grouping.
- `web/components/editor/NodeFrame.tsx`: node shell.
- `web/components/editor/NodeHandleWrapper.tsx`: handle rendering.
- `web/components/editor/ResumeOverlay.tsx`: run resume UI.
- `web/components/editor/RunHistoryPanel.tsx`: flow run history panel.
- `web/components/editor/RunSidebar.tsx`: live run sidebar.
- `web/components/editor/editor.css`: editor-specific styling.
- `web/components/editor/order-context.tsx`: topo badge context.
- `web/components/editor/resume-context.tsx`: resume state context.
- `web/components/editor/run-state-context.tsx`: node run state context.
- `web/components/editor/use-topo-order.ts`: topo ordering hook.
- `web/components/editor/edges/DeletableEdge.tsx`: edge UI with delete affordance.

### Editor Nodes

- `AIModelNode.tsx`: text/image/audio/file AI node UI.
- `AudioNode.tsx`: audio box UI.
- `ButtonNode.tsx`: manual button trigger node.
- `ChatNode.tsx`: chat state node UI.
- `FileNode.tsx`: file box UI.
- `HeaderNode.tsx`: visual header node.
- `ImageNode.tsx`: image box UI.
- `PromptTemplateNode.tsx`: custom prompt-template node UI.
- `SubflowNode.tsx`: subflow node UI.
- `TextNode.tsx`: text box UI.
- `TriggerNode.tsx`: webhook/manual trigger node UI.

### Web Libraries And Tests

- `web/lib/api.ts`: API client.
- `web/lib/supabase/client.ts`: browser Supabase client.
- `web/lib/supabase/server.ts`: server Supabase client.
- `web/lib/supabase/supabase-url.ts`: Supabase URL normalization.
- `web/lib/utils.ts`: shared frontend utility helpers.
- `web/tests/unit/topo-order.test.ts`: topo/scoped execution tests.
- `web/tests/e2e/*.spec.ts`: Playwright editor and run flows.

## Shared Package

- `packages/shared/src/index.ts`: shared FloowForge TypeScript types.
- `packages/shared/package.json`: package metadata.
- `packages/shared/tsconfig.json`: package TypeScript config.

## Supabase

- `supabase/README.md`: migration and auth setup notes.
- `supabase/migrations/000_nuke.sql`: local destructive reset helper.
- `supabase/migrations/0001_init.sql`: schema, policies, and core database setup.
