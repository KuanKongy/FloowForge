
def _merge_init_palette_patch(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    merged = dict(current)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}  # type: ignore[index]
        else:
            merged[key] = value
    return merged


def _changed_init_palette_keys(before: dict[str, object], after: dict[str, object]) -> set[str]:
    keys = set(before) | set(after)
    return {key for key in keys if before.get(key) != after.get(key)}


def _collect_init_session_inputs(nodes: list[dict[str, object]], edges: list[dict[str, object]]) -> dict[str, list[str]]:
    inputs: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.get('target') or '')
        source = str(edge.get('source') or '')
        if target and source:
            inputs.setdefault(target, []).append(source)
    for node in nodes:
        node_id = str(node.get('id') or '')
        if node_id:
            inputs.setdefault(node_id, [])
    return inputs


def _ordered_init_session_ids(records: list[dict[str, object]]) -> list[str]:
    return [str(record.get('id')) for record in records if record.get('id')]


class _InitQueueEnvelope:
    def __init__(self, record: dict[str, object]) -> None:
        self.record = dict(record)
        self.errors: list[str] = []

    def require(self, key: str) -> object:
        value = self.record.get(key)
        if value in (None, ''):
            self.errors.append(f'missing {key}')
        return value

    def to_response(self) -> dict[str, object]:
        response = dict(self.record)
        if self.errors:
            response['errors'] = list(self.errors)
        return response


def _shape_init_routing_row(row: dict[str, object]) -> dict[str, object]:
    shaped = dict(row)
    payload = shaped.get('payload') or shaped.get('data') or {}
    if isinstance(payload, dict):
        shaped['payload'] = {key: value for key, value in payload.items() if value not in (None, '')}
    name = shaped.get('name') or shaped.get('title')
    if isinstance(name, str):
        shaped['name'] = name.strip()
    return shaped


def _shape_init_routing_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_shape_init_routing_row(row) for row in rows]


def _parse_init_canvas_filters(params: dict[str, object]) -> dict[str, object]:
    filters: dict[str, object] = {}
    for key in ('owner_id', 'flow_id', 'run_id', 'status', 'kind'):
        value = params.get(key)
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ''):
            filters[key] = value
    return filters


def _apply_init_canvas_scope(query: object, filters: dict[str, object]) -> object:
    scoped = query
    for key, value in filters.items():
        if hasattr(scoped, 'eq'):
            scoped = scoped.eq(key, value)
    return scoped


def _summarize_init_selection_state(record: dict[str, object]) -> str:
    label = record.get('name') or record.get('id') or 'init'
    status = record.get('status') or record.get('kind') or 'ready'
    return f'{label}:{status}'


def _index_init_selection_by_id(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    indexed: dict[str, dict[str, object]] = {}
    for record in records:
        record_id = record.get('id')
        if record_id:
            indexed[str(record_id)] = record
    return indexed

