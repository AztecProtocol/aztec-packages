#!/usr/bin/env python3
"""Reduce Clang time traces to msgpack/serde-specific compiler work."""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


MICROS_PER_SECOND = 1_000_000.0


def real(path: str | Path) -> str:
    return os.path.realpath(os.fspath(path))


def seconds(micros: float) -> float:
    return micros / MICROS_PER_SECOND


def escape_cell(text: str) -> str:
    return text.replace("|", "\\|")


def is_under(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:
        return False


def display_path(path: str, root: str) -> str:
    if not path:
        return ""
    if is_under(path, root):
        return os.path.relpath(path, root)
    return path


def table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_No rows._\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines) + "\n"


def trim(text: str, limit: int = 140) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


@dataclass
class SourceCost:
    inclusive_us: float = 0.0
    self_us: float = 0.0
    count: int = 0
    tus: set[str] = field(default_factory=set)


@dataclass
class EventCost:
    total_us: float = 0.0
    count: int = 0
    tus: set[str] = field(default_factory=set)


@dataclass
class Tu:
    source: str
    trace_path: str
    output: str
    execute_us: float = 0.0
    frontend_us: float = 0.0
    backend_us: float = 0.0
    msgpack_source_us: float = 0.0
    msgpack_self_us: float = 0.0
    tags: set[str] = field(default_factory=set)
    totals: dict[str, float] = field(default_factory=dict)


HEADER_TAGS = (
    ("acir generated", re.compile(r"/dsl/acir_format/serde/acir\.hpp$")),
    ("witness generated", re.compile(r"/dsl/acir_format/serde/witness_stack\.hpp$")),
    ("serde index", re.compile(r"/dsl/acir_format/serde/index\.hpp$")),
    ("serde base", re.compile(r"/dsl/acir_format/serde/serde\.hpp$")),
    ("bb msgpack impl", re.compile(r"/serialize/msgpack_impl\.hpp$")),
    ("bb msgpack facade", re.compile(r"/serialize/msgpack\.hpp$")),
    ("bb msgpack internals", re.compile(r"/serialize/msgpack_impl/")),
    ("third party msgpack", re.compile(r"/include/msgpack/|/msgpack-c/|/msgpack/")),
)


DEFAULT_EVENT_RE = r"msgpack|NamedUnion|NameValue|NVP|MSGPACK|pack_fn|packer|serde"


def source_is_msgpack_related(path: str) -> bool:
    return any(pattern.search(path) for _, pattern in HEADER_TAGS)


def tags_for_source(path: str) -> list[str]:
    return [name for name, pattern in HEADER_TAGS if pattern.search(path)]


def load_compdb(build_dir: Path) -> dict[str, dict[str, Any]]:
    compdb = build_dir / "compile_commands.json"
    if not compdb.exists():
        return {}
    entries = json.loads(compdb.read_text())
    by_output: dict[str, dict[str, Any]] = {}
    for entry in entries:
        output = entry.get("output")
        if output:
            by_output[real(Path(entry["directory"]) / output)] = entry
    return by_output


def trace_output_path(build_dir: Path, trace_path: Path) -> str:
    rel = trace_path.relative_to(build_dir)
    if rel.name.endswith(".json"):
        return real(build_dir / rel.with_name(rel.name[:-5] + ".o"))
    return real(trace_path)


def find_trace_files(build_dir: Path) -> list[Path]:
    skipped = {"Labels.json", "launch.json", "settings.json", "extensions.json"}
    return sorted(path for path in build_dir.rglob("*.json") if path.name not in skipped)


def max_duration(events: list[dict[str, Any]], name: str) -> float:
    return max(
        (float(event.get("dur", 0)) for event in events if event.get("ph") == "X" and event.get("name") == name),
        default=0.0,
    )


def compute_source_self_times(source_events: list[dict[str, Any]]) -> list[tuple[dict[str, Any], float]]:
    indexed = []
    for idx, event in enumerate(source_events):
        start = float(event.get("ts", 0))
        dur = float(event.get("dur", 0))
        indexed.append((start, start + dur, -dur, idx, event))
    indexed.sort()

    child_us = [0.0] * len(source_events)
    stack: list[tuple[float, int]] = []
    for start, end, _neg_dur, idx, event in indexed:
        while stack and stack[-1][0] <= start:
            stack.pop()
        if stack:
            child_us[stack[-1][1]] += float(event.get("dur", 0))
        stack.append((end, idx))

    return [(event, max(float(event.get("dur", 0)) - child_us[idx], 0.0)) for idx, event in enumerate(source_events)]


def target_for_output(output: str, root: str) -> str:
    rel = display_path(output, root)
    match = re.search(r"(?:^|/)CMakeFiles/([^/]+)\.dir/", rel)
    if match:
        return match.group(1)
    return "unknown"


def parse_trace(
    trace_path: Path,
    build_dir: Path,
    compdb: dict[str, dict[str, Any]],
    event_re: re.Pattern[str],
) -> tuple[Tu | None, dict[str, SourceCost], dict[str, EventCost]]:
    try:
        data = json.loads(trace_path.read_text())
    except (json.JSONDecodeError, OSError):
        return None, {}, {}
    if not isinstance(data, dict):
        return None, {}, {}

    events = [event for event in data.get("traceEvents", []) if event.get("ph") == "X"]
    if not any(event.get("name") == "ExecuteCompiler" for event in events):
        return None, {}, {}

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

    tu = Tu(
        source=source,
        trace_path=real(trace_path),
        output=output,
        execute_us=max_duration(events, "ExecuteCompiler"),
        frontend_us=max_duration(events, "Frontend"),
        backend_us=max_duration(events, "Backend"),
    )
    source_costs: dict[str, SourceCost] = {}
    event_costs: dict[str, EventCost] = {}

    source_events = [event for event in events if event.get("name") == "Source"]
    for event, self_us in compute_source_self_times(source_events):
        detail = event.get("args", {}).get("detail")
        if not detail:
            continue
        path = real(detail)
        cost = source_costs.setdefault(path, SourceCost())
        dur = float(event.get("dur", 0))
        cost.inclusive_us += dur
        cost.self_us += self_us
        cost.count += 1
        cost.tus.add(source)
        if source_is_msgpack_related(path):
            tu.msgpack_source_us += dur
            tu.msgpack_self_us += self_us
            tu.tags.update(tags_for_source(path))

    for event in events:
        name = str(event.get("name", ""))
        detail = str(event.get("args", {}).get("detail", ""))
        dur = float(event.get("dur", 0))
        if name.startswith("Total "):
            tu.totals[name.removeprefix("Total ")] = max(tu.totals.get(name.removeprefix("Total "), 0.0), dur)
        if detail and event_re.search(detail):
            key = f"{name}: {detail}"
            cost = event_costs.setdefault(key, EventCost())
            cost.total_us += dur
            cost.count += 1
            cost.tus.add(source)

    return tu, source_costs, event_costs


def merge_source_costs(target: dict[str, SourceCost], source: dict[str, SourceCost]) -> None:
    for path, cost in source.items():
        agg = target.setdefault(path, SourceCost())
        agg.inclusive_us += cost.inclusive_us
        agg.self_us += cost.self_us
        agg.count += cost.count
        agg.tus.update(cost.tus)


def merge_event_costs(target: dict[str, EventCost], source: dict[str, EventCost]) -> None:
    for key, cost in source.items():
        agg = target.setdefault(key, EventCost())
        agg.total_us += cost.total_us
        agg.count += cost.count
        agg.tus.update(cost.tus)


def category_rows(tus: list[Tu], root: str, top: int) -> list[list[str]]:
    buckets: dict[str, dict[str, float | int | set[str]]] = defaultdict(
        lambda: {"tus": set(), "execute": 0.0, "frontend": 0.0, "backend": 0.0, "msgpack_source": 0.0}
    )
    for tu in tus:
        tags = tu.tags or {"no msgpack/serde source event"}
        for tag in tags:
            bucket = buckets[tag]
            assert isinstance(bucket["tus"], set)
            bucket["tus"].add(tu.source)
            bucket["execute"] = float(bucket["execute"]) + tu.execute_us
            bucket["frontend"] = float(bucket["frontend"]) + tu.frontend_us
            bucket["backend"] = float(bucket["backend"]) + tu.backend_us
            bucket["msgpack_source"] = float(bucket["msgpack_source"]) + tu.msgpack_source_us
    rows = []
    for tag, bucket in sorted(buckets.items(), key=lambda item: float(item[1]["frontend"]), reverse=True)[:top]:
        rows.append(
            [
                escape_cell(tag),
                str(len(bucket["tus"])),
                f"{seconds(float(bucket['execute'])):.2f}",
                f"{seconds(float(bucket['frontend'])):.2f}",
                f"{seconds(float(bucket['backend'])):.2f}",
                f"{seconds(float(bucket['msgpack_source'])):.2f}",
            ]
        )
    return rows


def tu_rows(tus: list[Tu], root: str, top: int) -> list[list[str]]:
    exposed = [tu for tu in tus if tu.tags]
    rows = []
    for tu in sorted(exposed, key=lambda item: item.msgpack_source_us, reverse=True)[:top]:
        rows.append(
            [
                f"{seconds(tu.msgpack_source_us):.2f}",
                f"{seconds(tu.msgpack_self_us):.2f}",
                f"{seconds(tu.frontend_us):.2f}",
                f"{seconds(tu.backend_us):.2f}",
                escape_cell(", ".join(sorted(tu.tags))),
                escape_cell(display_path(tu.source, root)),
            ]
        )
    return rows


def source_rows(source_costs: dict[str, SourceCost], root: str, top: int) -> list[list[str]]:
    related = [(path, cost) for path, cost in source_costs.items() if source_is_msgpack_related(path)]
    rows = []
    for path, cost in sorted(related, key=lambda item: item[1].inclusive_us, reverse=True)[:top]:
        rows.append(
            [
                f"{seconds(cost.inclusive_us):.2f}",
                f"{seconds(cost.self_us):.2f}",
                str(cost.count),
                str(len(cost.tus)),
                escape_cell(", ".join(tags_for_source(path))),
                escape_cell(display_path(path, root)),
            ]
        )
    return rows


def event_rows(event_costs: dict[str, EventCost], root: str, top: int) -> list[list[str]]:
    rows = []
    for detail, cost in sorted(event_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:top]:
        rows.append(
            [
                f"{seconds(cost.total_us):.2f}",
                str(cost.count),
                str(len(cost.tus)),
                escape_cell(trim(detail)),
            ]
        )
    return rows


def target_rows(tus: list[Tu], root: str, top: int) -> list[list[str]]:
    buckets: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"tus": 0, "execute": 0.0, "frontend": 0.0, "backend": 0.0, "msgpack_source": 0.0}
    )
    for tu in tus:
        if not tu.tags:
            continue
        target = target_for_output(tu.output, root)
        bucket = buckets[target]
        bucket["tus"] = int(bucket["tus"]) + 1
        bucket["execute"] = float(bucket["execute"]) + tu.execute_us
        bucket["frontend"] = float(bucket["frontend"]) + tu.frontend_us
        bucket["backend"] = float(bucket["backend"]) + tu.backend_us
        bucket["msgpack_source"] = float(bucket["msgpack_source"]) + tu.msgpack_source_us
    rows = []
    for target, bucket in sorted(buckets.items(), key=lambda item: float(item[1]["frontend"]), reverse=True)[:top]:
        rows.append(
            [
                escape_cell(target),
                str(bucket["tus"]),
                f"{seconds(float(bucket['execute'])):.2f}",
                f"{seconds(float(bucket['frontend'])):.2f}",
                f"{seconds(float(bucket['backend'])):.2f}",
                f"{seconds(float(bucket['msgpack_source'])):.2f}",
            ]
        )
    return rows


def totals_rows(tus: list[Tu], top: int) -> list[list[str]]:
    aggregate: dict[str, float] = defaultdict(float)
    for tu in tus:
        if not tu.tags:
            continue
        for key, value in tu.totals.items():
            aggregate[key] += value
    return [[f"{seconds(value):.2f}", escape_cell(key)] for key, value in sorted(aggregate.items(), key=lambda item: item[1], reverse=True)[:top]]


def json_summary(tus: list[Tu], source_costs: dict[str, SourceCost], event_costs: dict[str, EventCost], root: str, top: int) -> dict[str, Any]:
    exposed = [tu for tu in tus if tu.tags]
    return {
        "trace_count": len(tus),
        "msgpack_exposed_tu_count": len(exposed),
        "msgpack_exposed_execute_s": seconds(sum(tu.execute_us for tu in exposed)),
        "msgpack_exposed_frontend_s": seconds(sum(tu.frontend_us for tu in exposed)),
        "msgpack_source_event_s": seconds(sum(tu.msgpack_source_us for tu in exposed)),
        "top_tus": [
            {
                "source": display_path(tu.source, root),
                "msgpack_source_s": seconds(tu.msgpack_source_us),
                "frontend_s": seconds(tu.frontend_us),
                "backend_s": seconds(tu.backend_us),
                "tags": sorted(tu.tags),
            }
            for tu in sorted(exposed, key=lambda item: item.msgpack_source_us, reverse=True)[:top]
        ],
        "top_sources": [
            {
                "path": display_path(path, root),
                "inclusive_s": seconds(cost.inclusive_us),
                "self_s": seconds(cost.self_us),
                "count": cost.count,
                "tu_count": len(cost.tus),
                "tags": tags_for_source(path),
            }
            for path, cost in sorted(
                ((path, cost) for path, cost in source_costs.items() if source_is_msgpack_related(path)),
                key=lambda item: item[1].inclusive_us,
                reverse=True,
            )[:top]
        ],
        "top_events": [
            {
                "event": detail,
                "time_s": seconds(cost.total_us),
                "count": cost.count,
                "tu_count": len(cost.tus),
            }
            for detail, cost in sorted(event_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:top]
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build_dir", type=Path)
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    parser.add_argument("--event-regex", default=DEFAULT_EVENT_RE)
    parser.add_argument("--top", type=int, default=30)
    parser.add_argument("--output", type=Path, default=Path("/tmp/msgpack-compile-work.md"))
    parser.add_argument("--json", dest="json_output", type=Path)
    args = parser.parse_args()

    build_dir = args.build_dir.resolve()
    root = real(args.source_root.resolve())
    event_re = re.compile(args.event_regex)
    compdb = load_compdb(build_dir)

    tus: list[Tu] = []
    source_costs: dict[str, SourceCost] = {}
    event_costs: dict[str, EventCost] = {}
    for trace_path in find_trace_files(build_dir):
        tu, trace_source_costs, trace_event_costs = parse_trace(trace_path, build_dir, compdb, event_re)
        if tu is None:
            continue
        tus.append(tu)
        merge_source_costs(source_costs, trace_source_costs)
        merge_event_costs(event_costs, trace_event_costs)

    exposed = [tu for tu in tus if tu.tags]
    lines = [
        "# Msgpack Compile Work Explorer",
        "",
        f"- Build dir: `{build_dir}`",
        f"- Trace files: `{len(tus)}`",
        f"- Msgpack/serde exposed TUs: `{len(exposed)}`",
        f"- Exposed execute/frontend/backend: `{seconds(sum(tu.execute_us for tu in exposed)):.2f}s / {seconds(sum(tu.frontend_us for tu in exposed)):.2f}s / {seconds(sum(tu.backend_us for tu in exposed)):.2f}s`",
        f"- Msgpack/serde Source-event inclusive/self: `{seconds(sum(tu.msgpack_source_us for tu in exposed)):.2f}s / {seconds(sum(tu.msgpack_self_us for tu in exposed)):.2f}s`",
        "",
        "## Exposure Categories",
        "",
        table(["category", "TUs", "execute s", "frontend s", "backend s", "source event s"], category_rows(tus, root, args.top)),
        "## Targets With Msgpack Exposure",
        "",
        table(["target", "TUs", "execute s", "frontend s", "backend s", "source event s"], target_rows(tus, root, args.top)),
        "## Top Msgpack-Exposed TUs",
        "",
        table(["source event s", "self s", "frontend s", "backend s", "tags", "source"], tu_rows(tus, root, args.top)),
        "## Msgpack/Serde Source Events",
        "",
        table(["inclusive s", "self s", "events", "TUs", "tags", "header"], source_rows(source_costs, root, args.top)),
        "## Matching Template/Function Events",
        "",
        table(["time s", "count", "TUs", "event"], event_rows(event_costs, root, args.top)),
        "## Aggregate Compiler Totals In Exposed TUs",
        "",
        table(["time s", "event"], totals_rows(tus, args.top)),
        "",
    ]
    args.output.write_text("\n".join(lines))
    print(args.output)

    if args.json_output:
        args.json_output.write_text(json.dumps(json_summary(tus, source_costs, event_costs, root, args.top), indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
