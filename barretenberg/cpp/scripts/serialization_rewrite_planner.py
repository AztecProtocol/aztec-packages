#!/usr/bin/env python3
"""Inventory msgpack/ACIR serialization shape for compiler-cheap rewrites."""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


MICROS_PER_SECOND = 1_000_000.0


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def cpp_root() -> Path:
    return Path(__file__).resolve().parents[1]


def real(path: str | Path) -> str:
    return os.path.realpath(os.fspath(path))


def seconds(micros: float) -> float:
    return micros / MICROS_PER_SECOND


def display_path(path: str | Path, root: Path) -> str:
    path_s = real(path)
    root_s = real(root)
    try:
        if os.path.commonpath([path_s, root_s]) == root_s:
            return os.path.relpath(path_s, root_s)
    except ValueError:
        pass
    return path_s


def escape_cell(text: str) -> str:
    return text.replace("|", "\\|")


def table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_No rows._\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines) + "\n"


def trim(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def find_matching(text: str, open_pos: int, open_ch: str = "{", close_ch: str = "}") -> int:
    depth = 0
    i = open_pos
    state = "code"
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "line_comment":
            if ch == "\n":
                state = "code"
            i += 1
            continue
        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 2
            else:
                i += 1
            continue
        if state == "string":
            if ch == "\\":
                i += 2
            elif ch == '"':
                state = "code"
                i += 1
            else:
                i += 1
            continue
        if state == "char":
            if ch == "\\":
                i += 2
            elif ch == "'":
                state = "code"
                i += 1
            else:
                i += 1
            continue

        if ch == "/" and nxt == "/":
            state = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            i += 2
            continue
        if ch == '"':
            state = "string"
            i += 1
            continue
        if ch == "'":
            state = "char"
            i += 1
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError(f"unmatched {open_ch!r} at {open_pos}")


def split_top_level_csv(text: str) -> list[str]:
    parts: list[str] = []
    start = 0
    angle = paren = brace = bracket = 0
    state = "code"
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "line_comment":
            if ch == "\n":
                state = "code"
            i += 1
            continue
        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 2
            else:
                i += 1
            continue
        if state == "string":
            if ch == "\\":
                i += 2
            elif ch == '"':
                state = "code"
                i += 1
            else:
                i += 1
            continue
        if state == "char":
            if ch == "\\":
                i += 2
            elif ch == "'":
                state = "code"
                i += 1
            else:
                i += 1
            continue
        if ch == "/" and nxt == "/":
            state = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            i += 2
            continue
        if ch == '"':
            state = "string"
        elif ch == "'":
            state = "char"
        elif ch == "<":
            angle += 1
        elif ch == ">" and angle:
            angle -= 1
        elif ch == "(":
            paren += 1
        elif ch == ")" and paren:
            paren -= 1
        elif ch == "{":
            brace += 1
        elif ch == "}" and brace:
            brace -= 1
        elif ch == "[":
            bracket += 1
        elif ch == "]" and bracket:
            bracket -= 1
        elif ch == "," and angle == paren == brace == bracket == 0:
            parts.append(text[start:i].strip())
            start = i + 1
        i += 1
    tail = text[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def find_macro_args(text: str, macro: str) -> list[str]:
    results: list[str] = []
    pattern = macro + "("
    pos = 0
    while True:
        idx = text.find(pattern, pos)
        if idx == -1:
            return results
        open_pos = idx + len(macro)
        try:
            close_pos = find_matching(text, open_pos, "(", ")")
        except ValueError:
            pos = open_pos + 1
            continue
        results.append(text[open_pos + 1 : close_pos])
        pos = close_pos + 1


@dataclass
class Field:
    type: str
    name: str


@dataclass
class StructInfo:
    name: str
    qualified_name: str
    start: int
    body_start: int
    end: int
    fields: list[Field] = field(default_factory=list)
    variant_alternatives: list[str] = field(default_factory=list)
    kind: str = "struct"


def normalize_type(type_name: str) -> str:
    return " ".join(type_name.split())


def direct_statements(body: str) -> list[str]:
    statements: list[str] = []
    start = 0
    paren = bracket = 0
    i = 0
    state = "code"
    while i < len(body):
        ch = body[i]
        nxt = body[i + 1] if i + 1 < len(body) else ""
        if state == "line_comment":
            if ch == "\n":
                state = "code"
            i += 1
            continue
        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 2
            else:
                i += 1
            continue
        if state == "string":
            if ch == "\\":
                i += 2
            elif ch == '"':
                state = "code"
                i += 1
            else:
                i += 1
            continue
        if state == "char":
            if ch == "\\":
                i += 2
            elif ch == "'":
                state = "code"
                i += 1
            else:
                i += 1
            continue
        if ch == "/" and nxt == "/":
            state = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            i += 2
            continue
        if ch == '"':
            state = "string"
        elif ch == "'":
            state = "char"
        elif ch == "(":
            paren += 1
        elif ch == ")" and paren:
            paren -= 1
        elif ch == "[":
            bracket += 1
        elif ch == "]" and bracket:
            bracket -= 1
        elif ch == "{" and paren == bracket == 0:
            try:
                i = find_matching(body, i)
            except ValueError:
                pass
            start = i + 1
        elif ch == ";" and paren == bracket == 0:
            stmt = body[start:i].strip()
            if stmt:
                statements.append(stmt)
            start = i + 1
        i += 1
    return statements


def parse_field_statement(statement: str) -> Field | None:
    stmt = " ".join(statement.split())
    if not stmt:
        return None
    skip_prefixes = (
        "friend ",
        "using ",
        "template ",
        "static ",
        "struct ",
        "enum ",
        "namespace ",
        "return ",
        "void ",
    )
    if stmt.startswith(skip_prefixes) or "operator" in stmt or "(" in stmt:
        return None
    match = re.match(r"(?P<type>.+?)\s+(?P<name>[A-Za-z_]\w*)(?:\s*\[[^\]]+\])?(?:\s*=.*)?$", stmt)
    if not match:
        return None
    return Field(type=normalize_type(match.group("type")), name=match.group("name"))


def extract_template_args(type_name: str, template_name: str) -> list[str]:
    idx = type_name.find(template_name)
    if idx == -1:
        return []
    open_pos = type_name.find("<", idx + len(template_name))
    if open_pos == -1:
        return []
    depth = 0
    for i in range(open_pos, len(type_name)):
        ch = type_name[i]
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
            if depth == 0:
                return [normalize_type(part) for part in split_top_level_csv(type_name[open_pos + 1 : i])]
    return []


def parse_structs(source: str) -> list[StructInfo]:
    intervals: list[StructInfo] = []
    for match in re.finditer(r"\bstruct\s+([A-Za-z_]\w*)\s*\{", source):
        brace = source.find("{", match.start())
        try:
            end = find_matching(source, brace)
        except ValueError:
            continue
        intervals.append(
            StructInfo(
                name=match.group(1),
                qualified_name=match.group(1),
                start=match.start(),
                body_start=brace + 1,
                end=end,
            )
        )

    intervals.sort(key=lambda item: item.start)
    for idx, info in enumerate(intervals):
        parent = None
        for candidate in intervals[:idx]:
            if candidate.start < info.start and info.end < candidate.end:
                if parent is None or parent.start < candidate.start:
                    parent = candidate
        if parent is not None:
            info.qualified_name = f"{parent.qualified_name}::{info.name}"

    for info in intervals:
        body = source[info.body_start : info.end]
        for statement in direct_statements(body):
            field_info = parse_field_statement(statement)
            if field_info:
                info.fields.append(field_info)
                info.variant_alternatives.extend(extract_template_args(field_info.type, "std::variant"))
        if info.variant_alternatives:
            info.kind = "variant"
        elif not info.fields:
            info.kind = "unit"
        elif len(info.fields) == 1 and info.fields[0].name == "value":
            info.kind = "newtype"
        else:
            info.kind = "struct"
    return intervals


@dataclass
class AcirInventory:
    structs: list[StructInfo]
    serializable_count: int
    deserializable_count: int
    msgpack_pack_count: int
    msgpack_unpack_count: int
    std_visit_count: int
    bytes: int
    lines: int


def analyze_acir_header(header: Path) -> AcirInventory:
    source = header.read_text(encoding="utf-8")
    structs = [record for record in parse_structs(source) if record.qualified_name != "Helpers"]
    return AcirInventory(
        structs=structs,
        serializable_count=len(re.findall(r"\bSerializable\s*<", source)),
        deserializable_count=len(re.findall(r"\bDeserializable\s*<", source)),
        msgpack_pack_count=len(re.findall(r"\bmsgpack_pack\s*\(", source)),
        msgpack_unpack_count=len(re.findall(r"\bmsgpack_unpack\s*\(", source)),
        std_visit_count=len(re.findall(r"\bstd::visit\s*\(", source)),
        bytes=len(source.encode()),
        lines=source.count("\n") + 1,
    )


@dataclass
class MacroUse:
    path: str
    macro: str
    fields: list[str]


@dataclass
class NamedUnionUse:
    path: str
    alias: str
    alternatives: list[str]


@dataclass
class SerializationSurface:
    macro_uses: list[MacroUse]
    named_unions: list[NamedUnionUse]
    msgpack_impl_includes: list[str]
    msgpack_facade_includes: list[str]
    camel_case_includes: list[str]


def source_files(root: Path) -> list[Path]:
    exts = {".h", ".hpp", ".hh", ".cpp", ".ipp", ".tpp"}
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix in exts)


def parse_named_union_uses(text: str, path: Path, root: Path) -> list[NamedUnionUse]:
    uses: list[NamedUnionUse] = []
    for match in re.finditer(r"\busing\s+([A-Za-z_]\w*)\s*=\s*NamedUnion\s*<", text):
        open_pos = text.find("<", match.end() - 1)
        if open_pos == -1:
            continue
        try:
            close_pos = find_matching(text, open_pos, "<", ">")
        except ValueError:
            continue
        uses.append(
            NamedUnionUse(
                path=display_path(path, root),
                alias=match.group(1),
                alternatives=split_top_level_csv(text[open_pos + 1 : close_pos]),
            )
        )
    return uses


def scan_serialization_surface(src_root: Path, root: Path) -> SerializationSurface:
    macro_uses: list[MacroUse] = []
    named_unions: list[NamedUnionUse] = []
    msgpack_impl_includes: list[str] = []
    msgpack_facade_includes: list[str] = []
    camel_case_includes: list[str] = []

    for path in source_files(src_root):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        display = display_path(path, root)
        if "msgpack_impl.hpp" in text:
            msgpack_impl_includes.append(display)
        if "serialize/msgpack.hpp" in text or '"msgpack.hpp"' in text:
            msgpack_facade_includes.append(display)
        if "msgpack_camel_case.hpp" in text:
            camel_case_includes.append(display)
        for macro in ("SERIALIZATION_FIELDS", "MSGPACK_FIELDS"):
            for args in find_macro_args(text, macro):
                fields = [field for field in split_top_level_csv(args) if field]
                macro_uses.append(MacroUse(path=display, macro=macro, fields=fields))
        if "NamedUnion<" in text:
            named_unions.extend(parse_named_union_uses(text, path, root))

    return SerializationSurface(
        macro_uses=macro_uses,
        named_unions=named_unions,
        msgpack_impl_includes=msgpack_impl_includes,
        msgpack_facade_includes=msgpack_facade_includes,
        camel_case_includes=camel_case_includes,
    )


@dataclass
class EventCost:
    micros: float = 0.0
    count: int = 0
    tus: set[str] = field(default_factory=set)


@dataclass
class TraceTu:
    source: str
    output: str
    execute_us: float = 0.0
    frontend_us: float = 0.0
    backend_us: float = 0.0
    msgpack_source_us: float = 0.0
    acir_source_us: float = 0.0
    named_union_us: float = 0.0


@dataclass
class TraceInventory:
    trace_count: int
    total_execute_us: float
    total_frontend_us: float
    total_backend_us: float
    msgpack_exposed_tus: list[TraceTu]
    acir_exposed_tus: list[TraceTu]
    named_union_events: dict[str, EventCost]
    source_events: dict[str, EventCost]


def load_compdb(build_dir: Path) -> dict[str, dict[str, Any]]:
    compdb = build_dir / "compile_commands.json"
    if not compdb.exists():
        return {}
    entries = json.loads(compdb.read_text(encoding="utf-8"))
    by_output: dict[str, dict[str, Any]] = {}
    for entry in entries:
        output = entry.get("output")
        if output:
            by_output[real(Path(entry["directory"]) / output)] = entry
    return by_output


def trace_output_path(build_dir: Path, trace_path: Path) -> str:
    rel = trace_path.relative_to(build_dir)
    return real(build_dir / rel.with_name(rel.name.removesuffix(".json") + ".o"))


def find_trace_files(build_dir: Path) -> list[Path]:
    skipped = {"Labels.json", "launch.json", "settings.json", "extensions.json"}
    return sorted(path for path in build_dir.rglob("*.json") if path.name not in skipped)


def max_duration(events: list[dict[str, Any]], name: str) -> float:
    return max(
        (float(event.get("dur", 0)) for event in events if event.get("ph") == "X" and event.get("name") == name),
        default=0.0,
    )


def source_event_tag(path: str) -> str | None:
    normalized = path.replace("\\", "/")
    if normalized.endswith("/serialize/msgpack_impl.hpp"):
        return "bb msgpack impl"
    if "/serialize/msgpack_impl/" in normalized:
        return "bb msgpack internals"
    if normalized.endswith("/serialize/msgpack.hpp"):
        return "bb msgpack facade"
    if normalized.endswith("/dsl/acir_format/serde/acir.hpp"):
        return "acir generated"
    if "/dsl/acir_format/serde/" in normalized:
        return "acir serde"
    if "/msgpack-c/" in normalized or "/include/msgpack/" in normalized or normalized.endswith("/include/msgpack.hpp"):
        return "third party msgpack"
    return None


def analyze_traces(build_dir: Path, root: Path) -> TraceInventory:
    compdb = load_compdb(build_dir)
    trace_count = 0
    total_execute_us = 0.0
    total_frontend_us = 0.0
    total_backend_us = 0.0
    msgpack_tus: list[TraceTu] = []
    acir_tus: list[TraceTu] = []
    named_union_events: dict[str, EventCost] = {}
    source_events: dict[str, EventCost] = {}

    for trace_path in find_trace_files(build_dir):
        try:
            data = json.loads(trace_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(data, dict):
            continue
        events = [event for event in data.get("traceEvents", []) if event.get("ph") == "X"]
        if not any(event.get("name") == "ExecuteCompiler" for event in events):
            continue
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
        source_display = display_path(source, root) if source else display_path(trace_path, root)
        tu = TraceTu(
            source=source_display,
            output=display_path(output, root),
            execute_us=max_duration(events, "ExecuteCompiler"),
            frontend_us=max_duration(events, "Frontend"),
            backend_us=max_duration(events, "Backend"),
        )
        trace_count += 1
        total_execute_us += tu.execute_us
        total_frontend_us += tu.frontend_us
        total_backend_us += tu.backend_us

        for event in events:
            name = str(event.get("name", ""))
            detail = str(event.get("args", {}).get("detail", ""))
            duration = float(event.get("dur", 0))
            if name == "Source" and detail:
                tag = source_event_tag(real(detail))
                if not tag:
                    continue
                cost = source_events.setdefault(tag, EventCost())
                cost.micros += duration
                cost.count += 1
                cost.tus.add(source_display)
                if "msgpack" in tag:
                    tu.msgpack_source_us += duration
                if "acir" in tag:
                    tu.acir_source_us += duration
            elif detail and "NamedUnion<" in detail and name.startswith("Instantiate"):
                key = f"{name}: {detail}"
                cost = named_union_events.setdefault(key, EventCost())
                cost.micros += duration
                cost.count += 1
                cost.tus.add(source_display)
                tu.named_union_us += duration

        if tu.msgpack_source_us > 0:
            msgpack_tus.append(tu)
        if tu.acir_source_us > 0:
            acir_tus.append(tu)

    msgpack_tus.sort(key=lambda item: item.msgpack_source_us, reverse=True)
    acir_tus.sort(key=lambda item: item.acir_source_us, reverse=True)
    return TraceInventory(
        trace_count=trace_count,
        total_execute_us=total_execute_us,
        total_frontend_us=total_frontend_us,
        total_backend_us=total_backend_us,
        msgpack_exposed_tus=msgpack_tus,
        acir_exposed_tus=acir_tus,
        named_union_events=named_union_events,
        source_events=source_events,
    )


def acir_summary_rows(acir: AcirInventory) -> list[list[str]]:
    kind_counts = Counter(record.kind for record in acir.structs)
    total_fields = sum(len(record.fields) for record in acir.structs)
    total_variant_alts = sum(len(record.variant_alternatives) for record in acir.structs)
    return [
        ["bytes", str(acir.bytes)],
        ["lines", str(acir.lines)],
        ["records", str(len(acir.structs))],
        ["plain structs", str(kind_counts["struct"])],
        ["variant wrappers", str(kind_counts["variant"])],
        ["newtypes", str(kind_counts["newtype"])],
        ["unit structs", str(kind_counts["unit"])],
        ["field slots", str(total_fields)],
        ["variant alternatives", str(total_variant_alts)],
        ["msgpack_pack methods", str(acir.msgpack_pack_count)],
        ["msgpack_unpack methods", str(acir.msgpack_unpack_count)],
        ["std::visit calls", str(acir.std_visit_count)],
        ["Serializable refs", str(acir.serializable_count)],
        ["Deserializable refs", str(acir.deserializable_count)],
    ]


def macro_surface_rows(surface: SerializationSurface, root: Path, limit: int) -> list[list[str]]:
    by_file: dict[str, list[MacroUse]] = defaultdict(list)
    for use in surface.macro_uses:
        by_file[use.path].append(use)
    ranked = sorted(by_file.items(), key=lambda item: sum(len(use.fields) for use in item[1]), reverse=True)
    rows = []
    for path, uses in ranked[:limit]:
        rows.append(
            [
                str(len(uses)),
                str(sum(len(use.fields) for use in uses)),
                escape_cell(path),
            ]
        )
    return rows


def build_report(
    acir: AcirInventory,
    surface: SerializationSurface,
    trace: TraceInventory | None,
    root: Path,
    acir_header: Path,
    build_dir: Path | None,
    limit: int,
) -> str:
    lines: list[str] = [
        "# Serialization Rewrite Planner",
        "",
        f"- ACIR header: `{display_path(acir_header, root)}`",
        f"- Source root: `{display_path(cpp_root() / 'src/barretenberg', root)}`",
    ]
    if build_dir is not None:
        lines.append(f"- Trace build dir: `{display_path(build_dir, root)}`")
    lines.extend(
        [
            "",
            "## Trace Exposure",
            "",
        ]
    )
    if trace is None:
        lines.append("_No trace build dir provided._\n")
    else:
        source_rows = []
        for tag, cost in sorted(trace.source_events.items(), key=lambda item: item[1].micros, reverse=True):
            source_rows.append([tag, str(len(cost.tus)), str(cost.count), f"{seconds(cost.micros):.2f}"])
        lines.extend(
            [
                f"- Trace files: `{trace.trace_count}`",
                f"- Aggregate execute/frontend/backend: `{seconds(trace.total_execute_us):.1f}s` / "
                f"`{seconds(trace.total_frontend_us):.1f}s` / `{seconds(trace.total_backend_us):.1f}s`",
                f"- Msgpack-exposed TUs: `{len(trace.msgpack_exposed_tus)}`",
                f"- ACIR-serde-exposed TUs: `{len(trace.acir_exposed_tus)}`",
                "",
                table(["source group", "TUs", "events", "inclusive s"], source_rows),
                "### Top Msgpack TUs",
                "",
                table(
                    ["msgpack source s", "frontend s", "backend s", "source"],
                    [
                        [
                            f"{seconds(tu.msgpack_source_us):.2f}",
                            f"{seconds(tu.frontend_us):.2f}",
                            f"{seconds(tu.backend_us):.2f}",
                            escape_cell(tu.source),
                        ]
                        for tu in trace.msgpack_exposed_tus[:limit]
                    ],
                ),
                "### Top NamedUnion Instantiations",
                "",
                table(
                    ["time s", "count", "TUs", "event"],
                    [
                        [f"{seconds(cost.micros):.2f}", str(cost.count), str(len(cost.tus)), escape_cell(trim(event, 180))]
                        for event, cost in sorted(
                            trace.named_union_events.items(), key=lambda item: item[1].micros, reverse=True
                        )[:limit]
                    ],
                ),
            ]
        )

    top_variants = sorted(acir.structs, key=lambda item: len(item.variant_alternatives), reverse=True)
    top_structs = sorted(acir.structs, key=lambda item: len(item.fields), reverse=True)
    lines.extend(
        [
            "## ACIR Generated Shape",
            "",
            table(["metric", "value"], acir_summary_rows(acir)),
            "### Largest Variants",
            "",
            table(
                ["alternatives", "qualified type", "first alternatives"],
                [
                    [
                        str(len(record.variant_alternatives)),
                        escape_cell(record.qualified_name),
                        escape_cell(", ".join(record.variant_alternatives[:6])),
                    ]
                    for record in top_variants
                    if record.variant_alternatives
                ][:limit],
            ),
            "### Largest Field Records",
            "",
            table(
                ["fields", "kind", "qualified type", "fields"],
                [
                    [
                        str(len(record.fields)),
                        record.kind,
                        escape_cell(record.qualified_name),
                        escape_cell(", ".join(field.name for field in record.fields[:10])),
                    ]
                    for record in top_structs[:limit]
                ],
            ),
            "## Repo Serialization Surface",
            "",
            f"- `SERIALIZATION_FIELDS`/`MSGPACK_FIELDS` uses: `{len(surface.macro_uses)}`",
            f"- Macro field references: `{sum(len(use.fields) for use in surface.macro_uses)}`",
            f"- `NamedUnion` aliases: `{len(surface.named_unions)}`",
            f"- Files mentioning `msgpack_impl.hpp`: `{len(surface.msgpack_impl_includes)}`",
            f"- Files mentioning `msgpack.hpp`: `{len(surface.msgpack_facade_includes)}`",
            f"- Files mentioning `msgpack_camel_case.hpp`: `{len(surface.camel_case_includes)}`",
            "",
            "### Largest Macro Users",
            "",
            table(["macros", "field refs", "file"], macro_surface_rows(surface, root, limit)),
            "### NamedUnion Aliases",
            "",
            table(
                ["alternatives", "alias", "file"],
                [
                    [str(len(use.alternatives)), use.alias, escape_cell(use.path)]
                    for use in sorted(surface.named_unions, key=lambda item: len(item.alternatives), reverse=True)
                ],
            ),
            "## Rewrite Implications",
            "",
            "- ACIR has enough regular structure to generate field/variant tables: each plain record becomes field descriptors, "
            "and each variant wrapper becomes tag descriptors plus payload type IDs.",
            "- Public generated headers should contain only value types and tiny serde support; all msgpack/object conversion "
            "belongs in generated `.cpp` files or a small table interpreter.",
            "- `bbapi` should not deserialize through a single giant `NamedUnion`; generated command dispatch tables can decode "
            "one payload type after matching the command name.",
            "- Schema output should be generated from descriptor tables or a generated JSON/blob, not through template schema "
            "walks over constructed C++ objects.",
            "",
        ]
    )
    return "\n".join(lines)


def build_json(acir: AcirInventory, surface: SerializationSurface, trace: TraceInventory | None) -> dict[str, Any]:
    kind_counts = Counter(record.kind for record in acir.structs)
    data: dict[str, Any] = {
        "acir": {
            "bytes": acir.bytes,
            "lines": acir.lines,
            "records": len(acir.structs),
            "kinds": dict(kind_counts),
            "fields": sum(len(record.fields) for record in acir.structs),
            "variant_alternatives": sum(len(record.variant_alternatives) for record in acir.structs),
            "msgpack_pack": acir.msgpack_pack_count,
            "msgpack_unpack": acir.msgpack_unpack_count,
            "serializable": acir.serializable_count,
            "deserializable": acir.deserializable_count,
            "top_variants": [
                {
                    "name": record.qualified_name,
                    "alternatives": len(record.variant_alternatives),
                    "first_alternatives": record.variant_alternatives[:10],
                }
                for record in sorted(acir.structs, key=lambda item: len(item.variant_alternatives), reverse=True)[:20]
            ],
            "top_records": [
                {
                    "name": record.qualified_name,
                    "kind": record.kind,
                    "fields": [field.name for field in record.fields],
                }
                for record in sorted(acir.structs, key=lambda item: len(item.fields), reverse=True)[:20]
            ],
        },
        "surface": {
            "macro_uses": len(surface.macro_uses),
            "macro_field_refs": sum(len(use.fields) for use in surface.macro_uses),
            "named_unions": [
                {"path": use.path, "alias": use.alias, "alternatives": len(use.alternatives)}
                for use in surface.named_unions
            ],
            "msgpack_impl_include_files": surface.msgpack_impl_includes,
        },
    }
    if trace is not None:
        data["trace"] = {
            "trace_count": trace.trace_count,
            "execute_s": seconds(trace.total_execute_us),
            "frontend_s": seconds(trace.total_frontend_us),
            "backend_s": seconds(trace.total_backend_us),
            "msgpack_exposed_tus": len(trace.msgpack_exposed_tus),
            "acir_exposed_tus": len(trace.acir_exposed_tus),
            "source_events": {
                tag: {"seconds": seconds(cost.micros), "count": cost.count, "tus": len(cost.tus)}
                for tag, cost in trace.source_events.items()
            },
        }
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acir-header",
        type=Path,
        default=cpp_root() / "src/barretenberg/dsl/acir_format/serde/acir.hpp",
    )
    parser.add_argument("--build-dir", type=Path)
    parser.add_argument("--source-root", type=Path, default=cpp_root() / "src/barretenberg")
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--output", type=Path, default=Path("/tmp/serialization-rewrite-plan.md"))
    parser.add_argument("--json", type=Path, dest="json_output")
    args = parser.parse_args()

    root = repo_root()
    acir_header = args.acir_header.resolve()
    source_root = args.source_root.resolve()
    acir = analyze_acir_header(acir_header)
    surface = scan_serialization_surface(source_root, root)
    trace = analyze_traces(args.build_dir.resolve(), root) if args.build_dir else None
    report = build_report(acir, surface, trace, root, acir_header, args.build_dir, args.top)
    args.output.write_text(report, encoding="utf-8")
    if args.json_output:
        args.json_output.write_text(json.dumps(build_json(acir, surface, trace), indent=2), encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
