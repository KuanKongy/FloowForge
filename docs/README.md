# FlowForge Technical Documentation

This folder is the project map for engineers working on FlowForge. The root
README stays short and product-facing; these docs explain how the system is
put together, where each responsibility lives, and how to operate it.

## Reading Order

1. [`ARCHITECTURE.md`](ARCHITECTURE.md) - system overview and request/run lifecycle.
2. [`PROJECT_MAP.md`](PROJECT_MAP.md) - every tracked source file and what it is for.
3. [`WEB.md`](WEB.md) - Next.js app, dashboard, editor, auth, and realtime UX.
4. [`API.md`](API.md) - FastAPI routes, execution engine, providers, worker, scheduler.
5. [`DATABASE.md`](DATABASE.md) - Supabase tables, auth, RLS, storage, realtime.
6. [`DEPLOYMENT.md`](DEPLOYMENT.md) - cheapest practical deployment options and setup steps.

## Product Surface

FlowForge lets a user build no-code AI workflows on a canvas, save immutable
flow versions, trigger runs manually, through webhooks, from public forms, or
from schedules, and inspect each node execution afterward.

The product currently includes:

- Dashboard pages for workflows, runs, triggers, custom nodes, integrations,
  and profile.
- A React Flow editor with typed nodes, proximity handles, scoped manual runs,
  live run events, and per-node execution state.
- Built-in node families for text, image, audio, files, chat, triggers,
  prompt templates, and subflows.
- Provider adapters for OpenAI, Gemini, Cloudflare Workers AI, DeepSeek, and
  PDF parsing.
- BYO integration keys so users who supply their own provider credentials can
  run AI calls without consuming platform API budget.

## Engineering Principles

- Keep flows reproducible by executing saved `flow_versions`, not whatever is
  currently open on the canvas.
- Keep graph execution deterministic: validate cycles, compute trigger scope,
  and respect barrier/race wait strategy per node.
- Keep provider differences behind `api/providers/*`; node executors should
  work with normalized provider results.
- Keep UI styling consistent through shared CSS tokens, `Button`, AppShell,
  node frames, and page header patterns.
- Prefer incremental product improvements over broad rewrites. The editor is
  central infrastructure; small clear changes are safer than clever ones.
