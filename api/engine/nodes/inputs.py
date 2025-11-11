"""Input normalization helpers shared by node executors."""
from __future__ import annotations

from typing import Any


def merge_inputs(inputs: list[Any]) -> Any:
    """Collapse multiple upstream values into one provider-friendly input.

    Text inputs become a single prompt. Lists and dicts are combined in a
    deterministic way for future typed data. Mixed scalar values stay as a
    list so downstream code does not silently discard data.
    """
    real_inputs = [v for v in inputs if v is not None]
    if not real_inputs:
        return None
    if len(real_inputs) == 1:
        return real_inputs[0]

    if all(isinstance(v, str) for v in real_inputs):
        return "\n\n".join(real_inputs)
    if all(isinstance(v, list) for v in real_inputs):
        merged: list[Any] = []
        for value in real_inputs:
            merged.extend(value)
        return merged
    if all(isinstance(v, dict) for v in real_inputs):
        merged_dict: dict[str, Any] = {}
        for value in real_inputs:
            merged_dict.update(value)
        return merged_dict
    return real_inputs
