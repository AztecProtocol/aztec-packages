#!/usr/bin/env python3
"""Group Clang -ftime-trace template instantiation work by semantic layer."""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any


MICROS_PER_SECOND = 1_000_000.0


@lru_cache(maxsize=None)
def real(path: str | Path) -> str:
    return os.path.realpath(os.fspath(path))


def seconds(micros: float) -> float:
    return micros / MICROS_PER_SECOND


def table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_No rows._\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines) + "\n"


def escape_cell(text: str) -> str:
    return text.replace("|", "\\|")


def trim(text: str, limit: int = 140) -> str:
    text = text.replace("\n", " ")
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def display_path(path: str, root: str) -> str:
    if not path:
        return ""
    try:
        if os.path.commonpath([path, root]) == root:
            return os.path.relpath(path, root)
    except ValueError:
        pass
    return path


@lru_cache(maxsize=200_000)
def strip_template_args(text: str) -> str:
    out: list[str] = []
    depth = 0
    for ch in text:
        if ch == "<":
            if depth == 0:
                out.append("<...>")
            depth += 1
        elif ch == ">":
            depth = max(depth - 1, 0)
        elif depth == 0:
            out.append(ch)
    text = "".join(out)
    text = re.sub(r"\(lambda at [^)]+\)", "(lambda)", text)
    text = re.sub(r"/mnt/[^: )]+", "<path>", text)
    return text


@lru_cache(maxsize=200_000)
def classify(detail: str) -> str:
    if "bb::NamedUnion<bb::bbapi" in detail or ("std::__detail::__variant" in detail and "bb::bbapi" in detail):
        return "bbapi named_union/variant"
    if "bb::NamedUnion<bb::Wsdb" in detail or ("std::__detail::__variant" in detail and "Wsdb" in detail):
        return "wsdb named_union/variant"
    if "msgpack" in detail or "Msgpack" in detail:
        return "msgpack"
    if "bb::stdlib::bigfield" in detail or "bigfield" in detail:
        return "stdlib bigfield"
    if "bb::stdlib::element" in detail or "biggroup" in detail or "cycle_group" in detail:
        return "stdlib group"
    if "UltraCircuitBuilder" in detail or "MegaCircuitBuilder" in detail or "CircuitBuilder" in detail:
        return "circuit builder"
    if "Relation" in detail or "relation" in detail:
        return "relations"
    if "Flavor" in detail or "Flavor_" in detail:
        return "flavor"
    if "sumcheck" in detail or "Sumcheck" in detail:
        return "sumcheck"
    if "ProverInstance" in detail or "VerifierInstance" in detail:
        return "prover/verifier instance"
    if "bb::field<" in detail or "bb::fr" in detail or "Bn254" in detail or "Grumpkin" in detail:
        return "field/curve"
    if "LookupHashTable" in detail or "plookup" in detail:
        return "lookup tables"
    if "Poseidon" in detail or "generator_data" in detail:
        return "crypto tables"
    if "std::filesystem" in detail:
        return "std filesystem"
    if "std::__detail::_Hashtable" in detail or "std::unordered_map" in detail:
        return "std unordered_map"
    if "std::vector" in detail:
        return "std vector"
    if "std::unique_ptr" in detail or "std::__uniq_ptr" in detail:
        return "std unique_ptr"
    if "std::variant" in detail or "std::__detail::__variant" in detail:
        return "std variant"
    if detail.startswith("std::") or detail.startswith("__gnu_cxx::"):
        return "other std"
    if detail.startswith("bb::"):
        return "other bb"
    return "other"


def target_for_output(output: str, root: str) -> str:
    rel = display_path(output, root)
    match = re.search(r"(?:^|/)CMakeFiles/([^/]+)\.dir/", rel)
    if match:
        return match.group(1)
    return "unknown"


@dataclass
class Cost:
    inclusive_us: float = 0.0
    self_us: float = 0.0
    count: int = 0
    tus: set[str] = field(default_factory=set)
    targets: Counter[str] = field(default_factory=Counter)
    examples: Counter[str] = field(default_factory=Counter)


@dataclass
class TraceSummary:
    source: str
    output: str
    target: str
    execute_us: float = 0.0
    frontend_us: float = 0.0
    backend_us: float = 0.0
    inst_inclusive_us: float = 0.0
    inst_self_us: float = 0.0
    inst_count: int = 0


def find_trace_files(build_dir: Path) -> list[Path]:
    skipped = {"Labels.json", "launch.json", "settings.json", "extensions.json"}
    return sorted(path for path in build_dir.rglob("*.json") if path.name not in skipped)


def trace_output_path(build_dir: Path, trace_path: Path) -> str:
    rel = trace_path.relative_to(build_dir)
    if rel.name.endswith(".json"):
        return real(build_dir / rel.with_name(rel.name[:-5] + ".o"))
    return real(trace_path)


def load_compdb(build_dir: Path) -> dict[str, dict[str, Any]]:
    compdb_path = build_dir / "compile_commands.json"
    if not compdb_path.exists():
        return {}
    entries = json.loads(compdb_path.read_text())
    by_output: dict[str, dict[str, Any]] = {}
    for entry in entries:
        output = entry.get("output")
        if output:
            by_output[real(Path(entry["directory"]) / output)] = entry
    return by_output


def max_duration(events: list[dict[str, Any]], name: str) -> float:
    return max(
        (float(event.get("dur", 0)) for event in events if event.get("ph") == "X" and event.get("name") == name),
        default=0.0,
    )


def compute_inst_self(events: list[dict[str, Any]], inst_indices: list[int]) -> dict[int, float]:
    indexed = []
    for idx in inst_indices:
        event = events[idx]
        start = float(event.get("ts", 0))
        dur = float(event.get("dur", 0))
        indexed.append((start, start + dur, -dur, idx))
    indexed.sort()

    child_us = dict.fromkeys(inst_indices, 0.0)
    stack: list[tuple[float, int]] = []
    for start, end, _neg_dur, idx in indexed:
        while stack and stack[-1][0] <= start:
            stack.pop()
        if stack:
            child_us[stack[-1][1]] += float(events[idx].get("dur", 0))
        stack.append((end, idx))
    return {idx: max(float(events[idx].get("dur", 0)) - child_us[idx], 0.0) for idx in inst_indices}


def nearest_source(stack: list[dict[str, Any]]) -> str:
    for event in reversed(stack):
        if event.get("name") == "Source":
            return str(event.get("args", {}).get("detail", ""))
    return ""


def nearest_context(stack: list[dict[str, Any]]) -> str:
    ignored = {"ExecuteCompiler", "Frontend", "Backend", "Source"}
    for event in reversed(stack):
        name = str(event.get("name", ""))
        if name in ignored or name.startswith("Total "):
            continue
        detail = str(event.get("args", {}).get("detail", ""))
        return f"{name}: {strip_template_args(detail) if detail else ''}".rstrip()
    return ""


def compressed(items: list[str]) -> list[str]:
    result: list[str] = []
    for item in items:
        if item and (not result or result[-1] != item):
            result.append(item)
    return result


def source_route(stack: list[dict[str, Any]], root: str, limit: int = 6) -> str:
    parts: list[str] = []
    for event in stack:
        if event.get("name") == "Source":
            detail = str(event.get("args", {}).get("detail", ""))
            if detail:
                parts.append(display_path(real(detail), root))
    parts = compressed(parts)
    if len(parts) > limit:
        parts = ["..."] + parts[-limit:]
    return " -> ".join(parts) if parts else "(no source route)"


def context_route(stack: list[dict[str, Any]], limit: int = 5) -> str:
    ignored = {"ExecuteCompiler", "Frontend", "Backend", "Source"}
    parts: list[str] = []
    for event in stack:
        name = str(event.get("name", ""))
        if name in ignored or name.startswith("Total "):
            continue
        detail = str(event.get("args", {}).get("detail", ""))
        if detail:
            parts.append(f"{name}: {strip_template_args(detail)}")
        else:
            parts.append(name)
    parts = compressed(parts)
    if len(parts) > limit:
        parts = ["..."] + parts[-limit:]
    return " -> ".join(parts) if parts else "(no context route)"


def layer_route(stack: list[dict[str, Any]], detail: str, limit: int = 8) -> str:
    parts: list[str] = []
    for event in stack:
        if str(event.get("name", "")).startswith("Instantiate"):
            parent_detail = str(event.get("args", {}).get("detail", ""))
            parts.append(classify(parent_detail))
    parts.append(classify(detail))
    parts = compressed(parts)
    if len(parts) > limit:
        parts = ["..."] + parts[-limit:]
    return " -> ".join(parts)


def add_cost(
    bucket: dict[str, Cost],
    key: str,
    source: str,
    target: str,
    detail: str,
    inclusive_us: float,
    self_us: float,
) -> None:
    cost = bucket.setdefault(key, Cost())
    cost.inclusive_us += inclusive_us
    cost.self_us += self_us
    cost.count += 1
    cost.tus.add(source)
    cost.targets[target] += 1
    if detail:
        cost.examples[trim(strip_template_args(detail), 180)] += 1


def parse_trace(
    trace_path: Path,
    build_dir: Path,
    root: str,
    compdb: dict[str, dict[str, Any]],
    route_threshold_us: float,
) -> tuple[TraceSummary | None, list[tuple[str, str, str, str, str, str, str, str, float, float]]]:
    try:
        data = json.loads(trace_path.read_text())
    except (json.JSONDecodeError, OSError):
        return None, []
    if not isinstance(data, dict):
        return None, []

    events = [event for event in data.get("traceEvents", []) if event.get("ph") == "X"]
    if not any(event.get("name") == "ExecuteCompiler" for event in events):
        return None, []

    output = trace_output_path(build_dir, trace_path)
    command = compdb.get(output)
    source = real(command["file"]) if command else ""
    if not source:
        for event in events:
            if event.get("name") == "Source":
                detail = event.get("args", {}).get("detail")
                if detail:
                    source = real(detail)
                    break
    target = target_for_output(output, root)

    inst_indices = [idx for idx, event in enumerate(events) if str(event.get("name", "")).startswith("Instantiate")]
    inst_self = compute_inst_self(events, inst_indices)

    indexed = []
    for idx, event in enumerate(events):
        start = float(event.get("ts", 0))
        dur = float(event.get("dur", 0))
        indexed.append((start, start + dur, -dur, idx, event))
    indexed.sort()

    rows: list[tuple[str, str, str, str, str, str, str, str, float, float]] = []
    stack: list[tuple[float, dict[str, Any]]] = []
    for start, end, _neg_dur, idx, event in indexed:
        while stack and stack[-1][0] <= start:
            stack.pop()
        name = str(event.get("name", ""))
        if name.startswith("Instantiate"):
            detail = str(event.get("args", {}).get("detail", ""))
            inclusive_us = float(event.get("dur", 0))
            self_us = inst_self.get(idx, inclusive_us)
            parent_events = [entry[1] for entry in stack]
            if inclusive_us >= route_threshold_us:
                source_route_key = source_route(parent_events, root)
                context_route_key = context_route(parent_events)
                layer_route_key = layer_route(parent_events, detail)
            else:
                source_route_key = ""
                context_route_key = ""
                layer_route_key = ""
            rows.append(
                (
                    source,
                    target,
                    detail,
                    nearest_source(parent_events),
                    nearest_context(parent_events),
                    source_route_key,
                    context_route_key,
                    layer_route_key,
                    inclusive_us,
                    self_us,
                )
            )
        stack.append((end, event))

    summary = TraceSummary(
        source=source,
        output=output,
        target=target,
        execute_us=max_duration(events, "ExecuteCompiler"),
        frontend_us=max_duration(events, "Frontend"),
        backend_us=max_duration(events, "Backend"),
        inst_inclusive_us=sum(row[8] for row in rows),
        inst_self_us=sum(row[9] for row in rows),
        inst_count=len(rows),
    )
    return summary, rows


def rows_for_costs(costs: dict[str, Cost], root: str, top: int) -> list[list[str]]:
    rows: list[list[str]] = []
    for key, cost in sorted(costs.items(), key=lambda item: item[1].inclusive_us, reverse=True)[:top]:
        top_target = cost.targets.most_common(1)[0][0] if cost.targets else ""
        example = cost.examples.most_common(1)[0][0] if cost.examples else ""
        rows.append(
            [
                f"{seconds(cost.inclusive_us):.2f}",
                f"{seconds(cost.self_us):.2f}",
                str(cost.count),
                str(len(cost.tus)),
                escape_cell(top_target),
                escape_cell(trim(key, 100)),
                escape_cell(trim(example, 120)),
            ]
        )
    return rows


def write_report(
    output: Path,
    build_dir: Path,
    trace_count: int,
    summaries: list[TraceSummary],
    by_layer: dict[str, Cost],
    by_symbol: dict[str, Cost],
    by_parent_source: dict[str, Cost],
    by_parent_layer: dict[str, Cost],
    by_parent_symbol: dict[str, Cost],
    by_context: dict[str, Cost],
    by_source_route: dict[str, Cost],
    by_context_route: dict[str, Cost],
    by_layer_route: dict[str, Cost],
    root: str,
    top: int,
    route_threshold_us: float,
):
    total_execute = sum(summary.execute_us for summary in summaries)
    total_frontend = sum(summary.frontend_us for summary in summaries)
    total_backend = sum(summary.backend_us for summary in summaries)
    total_inst = sum(summary.inst_inclusive_us for summary in summaries)
    total_inst_self = sum(summary.inst_self_us for summary in summaries)
    total_inst_count = sum(summary.inst_count for summary in summaries)

    lines = [
        "# Template Layer Explorer Report",
        "",
        f"- Build dir: `{build_dir}`",
        f"- Trace files: `{trace_count}`",
        f"- Parsed compiler TUs: `{len(summaries)}`",
        f"- Aggregate traced work: `{seconds(total_execute):.1f}s` execute / `{seconds(total_frontend):.1f}s` frontend / `{seconds(total_backend):.1f}s` backend",
        f"- Template instantiation work: `{seconds(total_inst):.1f}s` inclusive / `{seconds(total_inst_self):.1f}s` child-exclusive across `{total_inst_count}` events",
        f"- Route sections include instantiation events with duration >= `{route_threshold_us:.0f}us`",
        "",
        "## Instantiation Layers",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "layer", "example"], rows_for_costs(by_layer, root, top)),
        "## Top Normalized Symbols",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "symbol", "example"], rows_for_costs(by_symbol, root, top)),
        "## Parent Source Headers",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "source", "example"], rows_for_costs(by_parent_source, root, top)),
        "## Parent Source x Layer",
        "",
        table(
            ["incl s", "self s", "events", "TUs", "top target", "source :: layer", "example"],
            rows_for_costs(by_parent_layer, root, top),
        ),
        "## Parent Source x Symbol",
        "",
        table(
            ["incl s", "self s", "events", "TUs", "top target", "source :: symbol", "example"],
            rows_for_costs(by_parent_symbol, root, top),
        ),
        "## Source Routes",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "route", "example"], rows_for_costs(by_source_route, root, top)),
        "## Parent Contexts",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "context", "example"], rows_for_costs(by_context, root, top)),
        "## Context Routes",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "route", "example"], rows_for_costs(by_context_route, root, top)),
        "## Template Layer Routes",
        "",
        table(["incl s", "self s", "events", "TUs", "top target", "route", "example"], rows_for_costs(by_layer_route, root, top)),
        "## TUs By Instantiation Work",
        "",
    ]

    tu_rows = []
    for summary in sorted(summaries, key=lambda item: item.inst_inclusive_us, reverse=True)[:top]:
        tu_rows.append(
            [
                f"{seconds(summary.inst_inclusive_us):.2f}",
                f"{seconds(summary.inst_self_us):.2f}",
                str(summary.inst_count),
                f"{seconds(summary.frontend_us):.2f}",
                f"{seconds(summary.backend_us):.2f}",
                escape_cell(summary.target),
                escape_cell(display_path(summary.source, root)),
            ]
        )
    lines.append(table(["inst incl s", "inst self s", "events", "frontend s", "backend s", "target", "source"], tu_rows))
    output.write_text("\n".join(lines), encoding="utf-8")


def write_json(
    output: Path,
    trace_count: int,
    summaries: list[TraceSummary],
    by_layer: dict[str, Cost],
    by_symbol: dict[str, Cost],
    by_parent_source: dict[str, Cost],
    by_parent_layer: dict[str, Cost],
    by_parent_symbol: dict[str, Cost],
    by_context: dict[str, Cost],
    by_source_route: dict[str, Cost],
    by_context_route: dict[str, Cost],
    by_layer_route: dict[str, Cost],
    root: str,
    route_threshold_us: float,
):
    def costs_to_json(costs: dict[str, Cost]) -> list[dict[str, Any]]:
        return [
            {
                "key": key,
                "inclusive_s": seconds(cost.inclusive_us),
                "self_s": seconds(cost.self_us),
                "count": cost.count,
                "tu_count": len(cost.tus),
                "top_targets": cost.targets.most_common(5),
                "examples": cost.examples.most_common(3),
            }
            for key, cost in sorted(costs.items(), key=lambda item: item[1].inclusive_us, reverse=True)
        ]

    payload = {
        "trace_count": trace_count,
        "translation_unit_count": len(summaries),
        "total_execute_s": seconds(sum(summary.execute_us for summary in summaries)),
        "total_frontend_s": seconds(sum(summary.frontend_us for summary in summaries)),
        "total_backend_s": seconds(sum(summary.backend_us for summary in summaries)),
        "total_instantiation_inclusive_s": seconds(sum(summary.inst_inclusive_us for summary in summaries)),
        "total_instantiation_self_s": seconds(sum(summary.inst_self_us for summary in summaries)),
        "route_threshold_us": route_threshold_us,
        "layers": costs_to_json(by_layer),
        "symbols": costs_to_json(by_symbol)[:200],
        "parent_sources": costs_to_json(by_parent_source)[:200],
        "parent_layers": costs_to_json(by_parent_layer)[:200],
        "parent_symbols": costs_to_json(by_parent_symbol)[:200],
        "contexts": costs_to_json(by_context)[:200],
        "source_routes": costs_to_json(by_source_route)[:200],
        "context_routes": costs_to_json(by_context_route)[:200],
        "layer_routes": costs_to_json(by_layer_route)[:200],
        "translation_units": [
            {
                "source": display_path(summary.source, root),
                "target": summary.target,
                "instantiation_inclusive_s": seconds(summary.inst_inclusive_us),
                "instantiation_self_s": seconds(summary.inst_self_us),
                "instantiation_count": summary.inst_count,
                "frontend_s": seconds(summary.frontend_us),
                "backend_s": seconds(summary.backend_us),
            }
            for summary in sorted(summaries, key=lambda item: item.inst_inclusive_us, reverse=True)
        ],
    }
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build_dir", type=Path)
    parser.add_argument("--top", type=int, default=30)
    parser.add_argument("--output", type=Path, default=Path("/tmp/template-layer-report.md"))
    parser.add_argument("--json", type=Path, default=None)
    parser.add_argument(
        "--route-threshold-us",
        type=float,
        default=5_000.0,
        help="Only build expensive route strings for instantiation events at or above this duration.",
    )
    args = parser.parse_args()

    build_dir = args.build_dir.resolve()
    root = real(build_dir.parent)
    compdb = load_compdb(build_dir)

    by_layer: dict[str, Cost] = {}
    by_symbol: dict[str, Cost] = {}
    by_parent_source: dict[str, Cost] = {}
    by_parent_layer: dict[str, Cost] = {}
    by_parent_symbol: dict[str, Cost] = {}
    by_context: dict[str, Cost] = {}
    by_source_route: dict[str, Cost] = {}
    by_context_route: dict[str, Cost] = {}
    by_layer_route: dict[str, Cost] = {}
    summaries: list[TraceSummary] = []

    trace_files = find_trace_files(build_dir)
    for trace_path in trace_files:
        summary, rows = parse_trace(trace_path, build_dir, root, compdb, args.route_threshold_us)
        if summary is None:
            continue
        summaries.append(summary)
        for (
            source,
            target,
            detail,
            parent_source,
            context,
            source_route_key,
            context_route_key,
            layer_route_key,
            inclusive_us,
            self_us,
        ) in rows:
            layer = classify(detail)
            symbol = strip_template_args(detail)
            parent_key = display_path(real(parent_source), root) if parent_source else "(no source)"
            context_key = context or "(no context)"
            parent_layer_key = f"{parent_key} :: {layer}"
            parent_symbol_key = f"{parent_key} :: {symbol}"
            add_cost(by_layer, layer, source, target, detail, inclusive_us, self_us)
            add_cost(by_symbol, symbol, source, target, detail, inclusive_us, self_us)
            add_cost(by_parent_source, parent_key, source, target, detail, inclusive_us, self_us)
            add_cost(by_parent_layer, parent_layer_key, source, target, detail, inclusive_us, self_us)
            add_cost(by_parent_symbol, parent_symbol_key, source, target, detail, inclusive_us, self_us)
            add_cost(by_context, context_key, source, target, detail, inclusive_us, self_us)
            if source_route_key:
                add_cost(by_source_route, source_route_key, source, target, detail, inclusive_us, self_us)
            if context_route_key:
                add_cost(by_context_route, context_route_key, source, target, detail, inclusive_us, self_us)
            if layer_route_key:
                add_cost(by_layer_route, layer_route_key, source, target, detail, inclusive_us, self_us)

    write_report(
        args.output,
        build_dir,
        len(trace_files),
        summaries,
        by_layer,
        by_symbol,
        by_parent_source,
        by_parent_layer,
        by_parent_symbol,
        by_context,
        by_source_route,
        by_context_route,
        by_layer_route,
        root,
        args.top,
        args.route_threshold_us,
    )
    if args.json:
        write_json(
            args.json,
            len(trace_files),
            summaries,
            by_layer,
            by_symbol,
            by_parent_source,
            by_parent_layer,
            by_parent_symbol,
            by_context,
            by_source_route,
            by_context_route,
            by_layer_route,
            root,
            args.route_threshold_us,
        )
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
