"""Run executor.

Per-trigger downstream subgraphs with race/barrier wait semantics, deterministic
multi-parent ordering, cancellation polling, and sink-based final output.

Design summary
==============
1. **Scope.** When ``start_node_ids`` is non-empty, we run only
   ``start ∪ downstream_of(start)``. Edges that cross the scope boundary are
   ignored unless an explicit ``input_overrides`` value is present (used by
   resume-from-node).
2. **Wait strategy.** Each node may declare ``data.wait_strategy`` of
   ``"barrier"`` (default) or ``"race"``. Barrier nodes execute when all
   in-scope parents have produced output. Race nodes execute as soon as ANY
   in-scope parent has produced output.
3. **Concurrency.** Up to ``_MAX_CONCURRENCY`` nodes execute simultaneously
   (capped via ``asyncio.Semaphore``).
4. **Cancellation.** A watchdog task polls ``runs.status``. If the run is
   cancelled externally (via ``POST /runs/{id}/cancel``) we stop scheduling
   new nodes, emit ``node_skipped`` for the remaining ones, and finalize the
   run as ``cancelled``.
5. **Final output.** After execution, the value of the most recently
   resolved sink (a node whose children all live outside the scope) is
   stored on ``runs.output``.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import json
import logging
import time
from collections import defaultdict
from typing import Any

log = logging.getLogger(__name__)

from ..db import SupabaseClient
from .context import ExecutionContext
from .graph import (
    GraphError,
    children_of,
    parents_of,
    scope_for,
    topo_order,
)
from .nodes import get_executor


_MAX_CONCURRENCY = 8
_CANCEL_POLL_INTERVAL = 1.0  # seconds


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _summarize(value: Any, max_len: int = 240) -> Any:
    """Trim large payloads before emitting / persisting."""
    if _is_file_payload(value):
        return _file_payload_preview(value)
    if isinstance(value, str):
        return value if len(value) <= max_len else value[:max_len] + "…"
    if isinstance(value, (list, dict)):
        s = str(value)
        return s if len(s) <= max_len else s[:max_len] + "…"
    return value


def _is_file_payload(value: Any) -> bool:
    return isinstance(value, dict) and value.get("kind") == "file"


def _file_payload_preview(value: dict[str, Any]) -> dict[str, Any]:
    data_url = value.get("data_url")
    byte_len = None
    if isinstance(data_url, str) and "," in data_url:
        byte_len = max(0, int((len(data_url.split(",", 1)[1]) * 3) / 4))
    return {
        "kind": "file",
        "name": value.get("name"),
        "mime": value.get("mime"),
        "size": value.get("size") or byte_len,
        "has_data": bool(data_url),
    }


def _event_value(value: Any) -> Any:
    """Value safe to broadcast/persist in run events.

    Execution outputs may contain full file data URLs. Those must stay inside
    the worker process and never be sent through Realtime/PostgREST.
    """
    if _is_file_payload(value):
        return _file_payload_preview(value)
    if isinstance(value, list):
        return [_event_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _event_value(v) for k, v in value.items()}
    return value


def _snapshot_for_event(value: Any, max_len: int = 4000) -> Any:
    """Trim large values before **persisting** to ``run_events``.

    The live value may still be broadcast to the editor for previewable media,
    but file payloads are reduced to metadata before this function is called.
    Persisted event rows should stay compact because the IO modal only needs a
    recognizable preview.

    Strings longer than ``max_len`` use a clear middle-ellipsis form so the
    truncation is obvious to the user — e.g.
    ``"data:image/png;base64,iVBORw0K…(+239812 more chars)…AAEklEQVR4n"``.
    """
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) <= max_len:
            return value
        head_n = max(80, max_len // 4)
        tail_n = max(40, max_len // 8)
        head = value[:head_n]
        tail = value[-tail_n:]
        omitted = len(value) - head_n - tail_n
        return f"{head}…(+{omitted} more chars)…{tail}"
    if isinstance(value, (bytes, bytearray)):
        return f"<{len(value)} bytes>"
    if isinstance(value, (list, dict)):
        s = str(value)
        if len(s) <= max_len:
            return value
        return s[: max_len // 2] + f"…(+{len(s) - max_len} more chars)…" + s[-(max_len // 4) :]
    return str(value)[:max_len]


def _serialize_output(value: Any) -> Any:
    value = _event_value(value)
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, dict)):
        return value
    return str(value)


def _snapshot_value(node: dict[str, Any]) -> Any:
    """Static value to substitute for an out-of-scope parent.

    Editor convention: ``data.value`` for input nodes (Text/File/Image/Audio
    etc.); ``data.config.value`` is also tolerated for nested configs.
    """
    data = node.get("data") or {}
    if isinstance(data, dict):
        if "value" in data:
            return data["value"]
        config = data.get("config")
        if isinstance(config, dict) and "value" in config:
            return config["value"]
    return None


def _node_output_name(node: dict[str, Any]) -> str:
    data = node.get("data") or {}
    if isinstance(data, dict):
        for key in ("name", "label", "text"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return str(node.get("id") or "input")


def _binding_key(name: str) -> str:
    key = "".join(ch.lower() if ch.isalnum() else "_" for ch in name.strip())
    key = "_".join(part for part in key.split("_") if part)
    return key or "input"


def _coerce_start_node_ids(value: Any) -> list[str] | None:
    """Normalize persisted/queued start ids.

    Supabase stores ``runs.start_node_ids`` as jsonb, but queued jobs may pass
    the same value directly. Treat missing/empty values as a whole-workflow run.
    """
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            value = [value]
    if not isinstance(value, list):
        return None
    ids = [str(v) for v in value if v]
    return ids or None


async def _load_run(run_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    sc = SupabaseClient.as_service()
    run = await sc.select(
        "runs",
        params={"id": f"eq.{run_id}", "select": "*"},
        single=True,
    )
    version = await sc.select(
        "flow_versions",
        params={"id": f"eq.{run['flow_version_id']}", "select": "*"},
        single=True,
    )
    return run, version


async def run_flow(
    run_id: str,
    start_node_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Execute a queued run end-to-end.

    Called by the Redis Streams worker, by the FastAPI ``BackgroundTasks`` fallback
    (when Redis is unavailable), and by ``run_flow_inline`` for subflows.
    """
    sc = SupabaseClient.as_service()
    run, version = await _load_run(run_id)
    user_id = run["user_id"]
    graph: dict[str, Any] = version.get("graph") or {"nodes": [], "edges": []}
    effective_start_node_ids = (
        _coerce_start_node_ids(start_node_ids)
        or _coerce_start_node_ids(run.get("start_node_ids"))
    )

    ctx = ExecutionContext(
        user_id=user_id,
        run_id=run_id,
        flow_id=run["flow_id"],
        flow_version_id=run["flow_version_id"],
        db=sc,
    )
    # Unwrap the wrapped run input that the runs router writes when the
    # editor resumes from a specific node — see api/routers/runs.py
    # ``enqueue_run`` for the wrapping shape. ``input_overrides`` is a
    # ``{node_id: value}`` map that the executor consults below for any
    # out-of-scope parent.
    raw_input = run.get("input")
    input_overrides: dict[str, Any] = {}
    if isinstance(raw_input, dict) and "input_overrides" in raw_input:
        input_overrides = dict(raw_input.get("input_overrides") or {})
        ctx.cache["__run_input__"] = raw_input.get("value")
    else:
        ctx.cache["__run_input__"] = raw_input
    ctx.cache["__input_overrides__"] = input_overrides

    await sc.update(
        "runs",
        {"status": "running", "started_at": _now()},
        params={"id": f"eq.{run_id}"},
        returning=False,
    )
    await ctx.emit("run_started", payload={"input": _event_value(run.get("input"))})

    nodes_by_id: dict[str, dict[str, Any]] = {n["id"]: n for n in graph.get("nodes", [])}
    explicit_start = bool(effective_start_node_ids)
    if explicit_start:
        scope = scope_for(graph, effective_start_node_ids or [])
    else:
        scope = set(nodes_by_id.keys())

    # No-op runs: nothing to schedule.
    if not scope:
        await sc.update(
            "runs",
            {"status": "succeeded", "ended_at": _now(), "output": None},
            params={"id": f"eq.{run_id}"},
            returning=False,
        )
        await ctx.emit("run_succeeded", payload={"output": None})
        return {"ok": True, "output": None}

    # Validate scope (fail fast on cycles or unreachable nodes).
    try:
        topo_order(graph, start_node_ids=list(scope) if explicit_start else None)
    except GraphError as e:
        await sc.update(
            "runs",
            {"status": "failed", "ended_at": _now(), "error": str(e)},
            params={"id": f"eq.{run_id}"},
            returning=False,
        )
        await ctx.emit("run_failed", payload={"error": str(e)})
        return {"ok": False, "error": str(e)}

    parents = parents_of(graph)
    children = children_of(graph)
    events: dict[str, asyncio.Event] = {nid: asyncio.Event() for nid in scope}
    outputs: dict[str, Any] = {}
    failed: set[str] = set()
    skipped: set[str] = set()
    completion_order: list[str] = []
    cancel_event = asyncio.Event()
    sema = asyncio.Semaphore(_MAX_CONCURRENCY)

    async def watchdog() -> None:
        while not cancel_event.is_set():
            try:
                row = await sc.select(
                    "runs",
                    params={"id": f"eq.{run_id}", "select": "status"},
                    single=True,
                )
                if isinstance(row, dict) and row.get("status") == "cancelled":
                    cancel_event.set()
                    return
            except Exception:
                pass
            try:
                await asyncio.wait_for(cancel_event.wait(), timeout=_CANCEL_POLL_INTERVAL)
            except asyncio.TimeoutError:
                continue

    def in_scope_parents(node_id: str) -> list[str]:
        return [p for p in parents.get(node_id, []) if p in scope]

    def parents_ready(node_id: str, strategy: str) -> bool:
        ips = in_scope_parents(node_id)
        if not ips:
            return True
        if strategy == "race":
            # Any in-scope parent has produced output.
            return any(p in outputs for p in ips)
        # Barrier: every in-scope parent must have completed (resolved or failed/skipped).
        return all((p in outputs) or (p in failed) or (p in skipped) for p in ips)

    def race_winner(node_id: str) -> str | None:
        ips = set(in_scope_parents(node_id))
        for nid in completion_order:
            if nid in ips and nid in outputs:
                return nid
        for nid in parents.get(node_id, []):
            if nid in ips and nid in outputs:
                return nid
        return None

    async def wait_for_ready(node_id: str, strategy: str) -> tuple[bool, set[str] | None]:
        """Block until the node is ready to fire (per strategy) or the run is cancelled.

        Returns ``(ready, race_parent_ids)``. ``ready`` is false when
        cancellation/upstream failure should cause this node to be skipped.
        Race nodes receive the single winning parent id captured at readiness
        time, so later parent completions cannot leak into the inputs.
        """
        while True:
            if cancel_event.is_set():
                return (False, None)
            ips = in_scope_parents(node_id)
            if parents_ready(node_id, strategy):
                # Strategy-specific guard against pure-failure parents.
                if strategy == "race":
                    winner = race_winner(node_id)
                    if not winner and ips:
                        return (False, None)
                    return (True, {winner} if winner else set())
                else:  # barrier
                    if any(p in failed for p in ips):
                        return (False, None)
                return (True, None)

            wait_tasks = [
                asyncio.ensure_future(events[p].wait())
                for p in ips
                if p not in outputs and p not in failed and p not in skipped
            ]
            cancel_task = asyncio.ensure_future(cancel_event.wait())
            try:
                await asyncio.wait(
                    wait_tasks + [cancel_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
            finally:
                for t in wait_tasks:
                    if not t.done():
                        t.cancel()
                if not cancel_task.done():
                    cancel_task.cancel()

    async def execute_node(node_id: str) -> None:
        node = nodes_by_id[node_id]
        data = node.get("data") or {}
        strategy = (data.get("wait_strategy") or "barrier").lower()
        if strategy not in {"barrier", "race"}:
            strategy = "barrier"

        ready, race_parent_ids = await wait_for_ready(node_id, strategy)
        if not ready:
            skipped.add(node_id)
            await ctx.emit(
                "node_skipped",
                node_id=node_id,
                payload={
                    "reason": "cancelled" if cancel_event.is_set() else "upstream_failed",
                    "type": node.get("type"),
                },
            )
            events[node_id].set()
            return

        # Build inputs.
        # - In-scope parents that produced output contribute their output (in edge order).
        # - Boundary parents (outside scope) prefer an explicit override
        #   (used by the "Resume from this node" feature so the partial run
        #   sees the same context the failed run had).
        # - Whole-flow runs may also read a root/boundary node's static value.
        overrides: dict[str, Any] = ctx.cache.get("__input_overrides__") or {}
        node_inputs: list[Any] = []
        input_bindings: dict[str, Any] = {}
        input_meta: list[dict[str, Any]] = []

        def add_input_from_parent(parent_id: str, value: Any) -> None:
            node_inputs.append(value)
            parent = nodes_by_id.get(parent_id)
            if parent:
                name = _node_output_name(parent)
                input_bindings[_binding_key(name)] = value
                input_bindings.setdefault(f"input{len(node_inputs)}", value)
                input_meta.append(
                    {
                        "node_id": parent_id,
                        "type": parent.get("type"),
                        "name": name,
                        "binding": _binding_key(name),
                    }
                )

        for p in parents.get(node_id, []):
            if p in scope:
                if p in outputs and (strategy != "race" or race_parent_ids is None or p in race_parent_ids):
                    add_input_from_parent(p, outputs[p])
                # In race mode some parents may not have fired yet; skip them.
            else:
                if strategy == "race" and race_parent_ids:
                    continue
                if p in overrides:
                    add_input_from_parent(p, overrides[p])
                elif not explicit_start and p in nodes_by_id:
                    add_input_from_parent(p, _snapshot_value(nodes_by_id[p]))

        # When the user runs the WHOLE flow (no explicit starts), root nodes
        # receive ``runs.input`` so a webhook payload reaches the graph.
        if not parents.get(node_id) and not explicit_start:
            run_input = ctx.cache.get("__run_input__")
            if run_input is not None and not node_inputs:
                node_inputs = [run_input]
                input_bindings = {"input1": run_input}
                input_meta = [{"node_id": None, "type": "run_input", "name": "Run input", "binding": "input1"}]

        ctx.cache[f"__input_bindings__:{node_id}"] = input_bindings
        ctx.cache[f"__input_meta__:{node_id}"] = input_meta

        async with sema:
            if cancel_event.is_set():
                skipped.add(node_id)
                await ctx.emit("node_skipped", node_id=node_id, payload={"reason": "cancelled"})
                events[node_id].set()
                return

            executor = get_executor(node["type"])
            if executor is None:
                outputs[node_id] = None
                completion_order.append(node_id)
                events[node_id].set()
                return

            t0 = time.perf_counter()
            # Snapshot the resolved inputs onto ``node_started``. File payloads
            # are reduced to metadata for both Realtime and persisted rows; the
            # full value stays in ``outputs`` for downstream execution.
            await ctx.emit(
                "node_started",
                node_id=node_id,
                payload={
                    "type": node["type"],
                    "name": data.get("name"),
                    "inputs": [_event_value(v) for v in node_inputs],
                },
                db_payload={
                    "type": node["type"],
                    "name": data.get("name"),
                    "inputs": [_snapshot_for_event(_event_value(v)) for v in node_inputs],
                },
            )
            try:
                value = await executor(node, node_inputs, ctx)
            except Exception as e:
                duration_ms = int((time.perf_counter() - t0) * 1000)
                failed.add(node_id)
                await ctx.emit(
                    "node_failed",
                    node_id=node_id,
                    payload={"error": str(e), "duration_ms": duration_ms},
                )
                events[node_id].set()
                raise
            duration_ms = int((time.perf_counter() - t0) * 1000)
            outputs[node_id] = value
            completion_order.append(node_id)
            await ctx.emit(
                "node_succeeded",
                node_id=node_id,
                payload={
                    "summary": _summarize(value),
                    "output": _event_value(value),
                    "duration_ms": duration_ms,
                },
                db_payload={
                    "summary": _summarize(value),
                    "output": _snapshot_for_event(_event_value(value)),
                    "duration_ms": duration_ms,
                },
            )
            events[node_id].set()

    watchdog_task = asyncio.create_task(watchdog())
    node_tasks = [asyncio.create_task(execute_node(nid)) for nid in scope]
    try:
        results = await asyncio.gather(*node_tasks, return_exceptions=True)
    finally:
        cancel_event.set()
        watchdog_task.cancel()
        try:
            await watchdog_task
        except (asyncio.CancelledError, Exception):
            pass

    # Surface cancellation first so an in-flight node failure that happened
    # because we cancelled it doesn't get reported as the failure cause.
    cancelled_externally = await _is_cancelled(sc, run_id)
    if cancelled_externally:
        await sc.update(
            "runs",
            {"status": "cancelled", "ended_at": _now()},
            params={"id": f"eq.{run_id}"},
            returning=False,
        )
        await ctx.emit("run_cancelled", payload={})
        return {"ok": False, "cancelled": True}

    real_errors = [
        r for r in results if isinstance(r, Exception) and not isinstance(r, asyncio.CancelledError)
    ]
    if real_errors:
        err = real_errors[0]
        await sc.update(
            "runs",
            {"status": "failed", "ended_at": _now(), "error": str(err)},
            params={"id": f"eq.{run_id}"},
            returning=False,
        )
        await ctx.emit("run_failed", payload={"error": str(err)})
        return {"ok": False, "error": str(err)}

    # Final output: most recently completed sink in the scope.
    final_value: Any = None
    for nid in reversed(completion_order):
        node_children = children.get(nid, [])
        if not any(c in scope for c in node_children):
            final_value = outputs.get(nid)
            break

    await sc.update(
        "runs",
        {
            "status": "succeeded",
            "ended_at": _now(),
            "output": _serialize_output(final_value),
        },
        params={"id": f"eq.{run_id}"},
        returning=False,
    )
    await ctx.emit("run_succeeded", payload={"output": _summarize(final_value)})

    # Outgoing webhook: POST results to callback_url if the trigger has one
    await _fire_callback(sc, run, final_value)

    # Auto-delete one-time schedule triggers after successful execution
    await _cleanup_oneshot_trigger(sc, run)

    return {"ok": True, "output": final_value}


async def _fire_callback(sc: SupabaseClient, run: dict, output: Any) -> None:
    """POST run results to the trigger's callback_url (if configured)."""
    trigger_kind = run.get("trigger_kind")
    if not trigger_kind:
        return
    try:
        triggers = await sc.select(
            "triggers",
            params={
                "flow_id": f"eq.{run['flow_id']}",
                "select": "callback_url,output_node_ids",
            },
        )
        for t in triggers:
            url = t.get("callback_url")
            if not url:
                continue
            payload_output = _serialize_output(output)
            import httpx
            backoff = [1, 5, 25]
            async with httpx.AsyncClient(timeout=10) as client:
                for attempt in range(3):
                    try:
                        resp = await client.post(url, json={
                            "run_id": run["id"],
                            "flow_id": run["flow_id"],
                            "status": "succeeded",
                            "output": payload_output,
                        })
                        resp.raise_for_status()
                        break
                    except Exception:
                        if attempt < 2:
                            await asyncio.sleep(backoff[attempt])
    except Exception as exc:
        log.warning("Callback failed for run %s: %s", run.get("id"), exc)


async def _cleanup_oneshot_trigger(sc: SupabaseClient, run: dict) -> None:
    """Auto-delete one-time schedule triggers (delay/once) after execution."""
    trigger_kind = run.get("trigger_kind")
    if trigger_kind not in {"schedule_in", "schedule"}:
        return
    try:
        triggers = await sc.select(
            "triggers",
            params={
                "flow_id": f"eq.{run['flow_id']}",
                "kind": "eq.schedule",
                "select": "id,config",
            },
        )
        for t in triggers:
            mode = (t.get("config") or {}).get("schedule_mode")
            if mode in ("delay", "once"):
                await sc.delete("triggers", params={"id": f"eq.{t['id']}"})
                log.info("Auto-deleted one-time schedule trigger %s", t["id"])
    except Exception as exc:
        log.warning("Failed to cleanup oneshot trigger for run %s: %s", run.get("id"), exc)


async def _is_cancelled(sc: SupabaseClient, run_id: str) -> bool:
    try:
        row = await sc.select(
            "runs",
            params={"id": f"eq.{run_id}", "select": "status"},
            single=True,
        )
        return isinstance(row, dict) and row.get("status") == "cancelled"
    except Exception:
        return False


async def run_flow_inline(
    *,
    flow_id: str,
    user_id: str,
    input: Any,
    parent_run_id: str | None,
) -> Any:
    """Run a flow as a subflow inside the parent's worker process.

    The created run has ``trigger_kind='subflow'`` and is linked to the parent
    via ``parent_run_id`` so the run-history UI can show subflow lineage.
    """
    sc = SupabaseClient.as_service()
    flow = await sc.select(
        "flows",
        params={"id": f"eq.{flow_id}", "select": "*"},
        single=True,
    )
    if not flow.get("current_version_id"):
        raise ValueError(f"Subflow {flow_id} has no current version")
    runs = await sc.insert(
        "runs",
        {
            "flow_id": flow_id,
            "flow_version_id": flow["current_version_id"],
            "user_id": user_id,
            "status": "queued",
            "trigger_kind": "subflow",
            "input": input,
            "parent_run_id": parent_run_id,
        },
    )
    sub_run_id = runs[0]["id"]
    result = await run_flow(sub_run_id, None)
    if not result.get("ok"):
        raise RuntimeError(f"Subflow {flow_id} failed: {result.get('error')}")
    return result.get("output")
