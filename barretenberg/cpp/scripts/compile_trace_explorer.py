#!/usr/bin/env python3
"""
Explore Clang -ftime-trace output with include-route attribution.

This is intentionally different from ClangBuildAnalyzer:

* CBA answers "which headers/templates/functions are globally expensive?"
* This tool also answers "is a header expensive itself, or just an expensive
  route to other headers?" by splitting Source events into inclusive and
  source-child-exclusive time.
* With --scan-includes, it runs the exact compile command as syntax-only with
  -H and charges the first parsed occurrence of each header to the parent
  include directive that brought it in.
* With --scan-tokens and --scan-frontend-stats, it asks Clang for lower-level
  preprocessor token ownership and frontend counters. These are useful sanity
  checks when time traces are noisy.

Typical use:

    python3 scripts/compile_trace_explorer.py build-profile-assert-light-1 \
      --top 20 --scan-includes 5 --scan-tokens 2 --scan-frontend-stats 5 \
      --focus src/barretenberg/flavor/mega_flavor.hpp \
      --focus src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shlex
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


MICROS_PER_SECOND = 1_000_000.0


def real(path: str | Path) -> str:
    return os.path.realpath(os.fspath(path))


def seconds(micros: float) -> float:
    return micros / MICROS_PER_SECOND


def ms(micros: float) -> float:
    return micros / 1000.0


def percent(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return 100.0 * numerator / denominator


def table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_No rows._\n"
    out = []
    out.append("| " + " | ".join(headers) + " |")
    out.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for row in rows:
        out.append("| " + " | ".join(row) + " |")
    return "\n".join(out) + "\n"


def escape_cell(text: str) -> str:
    return text.replace("|", "\\|")


@dataclass
class SourceCost:
    inclusive_us: float = 0.0
    self_us: float = 0.0
    count: int = 0
    bytes: int = 0
    tus: set[str] = field(default_factory=set)


@dataclass
class EventCost:
    total_us: float = 0.0
    count: int = 0


@dataclass
class NinjaLogEntry:
    start_ms: int
    end_ms: int
    mtime_ns: int
    output: str
    command_hash: str

    @property
    def duration_us(self) -> float:
        return max(self.end_ms - self.start_ms, 0) * 1000.0


@dataclass
class PchArtifact:
    path: str
    size_bytes: int
    target: str


@dataclass
class TuTrace:
    trace_path: str
    output: str
    source: str
    command: dict[str, Any] | None
    ninja_entry: NinjaLogEntry | None = None
    execute_us: float = 0.0
    frontend_us: float = 0.0
    backend_us: float = 0.0
    optimizer_us: float = 0.0
    codegen_us: float = 0.0
    source_costs: dict[str, SourceCost] = field(default_factory=dict)
    template_costs: dict[str, EventCost] = field(default_factory=dict)
    function_costs: dict[str, EventCost] = field(default_factory=dict)
    constexpr_costs: dict[str, EventCost] = field(default_factory=dict)
    event_totals: dict[str, EventCost] = field(default_factory=dict)


@dataclass
class EdgeCost:
    inclusive_us: float = 0.0
    self_us: float = 0.0
    parse_count: int = 0
    include_count: int = 0
    tus: set[str] = field(default_factory=set)


@dataclass
class IncludeScan:
    tu: TuTrace
    stderr_path: str
    edges: dict[tuple[str, str], EdgeCost] = field(default_factory=dict)
    first_routes: dict[str, list[str]] = field(default_factory=dict)
    repeated_includes: Counter[str] = field(default_factory=Counter)


@dataclass
class TokenScan:
    tu: TuTrace
    stdout_path: str
    token_counts: Counter[str] = field(default_factory=Counter)


@dataclass
class FrontendStatsScan:
    tu: TuTrace
    stderr_path: str
    stats_path: str
    stats: dict[str, int | float] = field(default_factory=dict)


def load_compdb(build_dir: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    compdb_path = build_dir / "compile_commands.json"
    if not compdb_path.exists():
        return {}, {}

    with compdb_path.open("r", encoding="utf-8") as f:
        entries = json.load(f)

    by_output: dict[str, dict[str, Any]] = {}
    by_file: dict[str, dict[str, Any]] = {}
    for entry in entries:
        directory = Path(entry["directory"])
        output = entry.get("output")
        if output:
            by_output[real(directory / output)] = entry
        by_file[real(entry["file"])] = entry
    return by_output, by_file


def parse_since(value: str | None) -> float | None:
    if not value:
        return None
    path = Path(value)
    if path.exists():
        return path.stat().st_mtime
    try:
        return float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"--since must be an existing path or Unix timestamp, got {value!r}") from exc


def ninja_output_path(build_dir: Path, output: str) -> str:
    path = Path(output)
    if path.is_absolute():
        return real(path)
    return real(build_dir / path)


def load_ninja_log(build_dir: Path, since: float | None = None) -> dict[str, NinjaLogEntry]:
    log_path = build_dir / ".ninja_log"
    if not log_path.exists():
        return {}

    cutoff_ns = int(since * 1_000_000_000) if since is not None else None
    entries: dict[str, NinjaLogEntry] = {}
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return {}

    for line in lines:
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) < 5:
            continue
        try:
            start_ms = int(fields[0])
            end_ms = int(fields[1])
            mtime_ns = int(fields[2])
        except ValueError:
            continue
        if cutoff_ns is not None and mtime_ns < cutoff_ns:
            continue
        output = ninja_output_path(build_dir, fields[3])
        entries[output] = NinjaLogEntry(
            start_ms=start_ms,
            end_ms=end_ms,
            mtime_ns=mtime_ns,
            output=output,
            command_hash=fields[4],
        )
    return entries


def pch_target_for_path(path: str, root: str) -> str:
    rel = display_path(path, root)
    match = re.search(r"(?:^|/)CMakeFiles/([^/]+)\.dir/", rel)
    if match:
        return match.group(1)
    return "unknown"


def find_pch_artifacts(build_dir: Path, root: str, since: float | None = None) -> list[PchArtifact]:
    artifacts: list[PchArtifact] = []
    for path in build_dir.rglob("*.pch"):
        try:
            stat = path.stat()
        except OSError:
            continue
        if since is not None and stat.st_mtime < since:
            continue
        artifact_path = real(path)
        artifacts.append(
            PchArtifact(
                path=artifact_path,
                size_bytes=stat.st_size,
                target=pch_target_for_path(artifact_path, root),
            )
        )
    artifacts.sort(key=lambda artifact: artifact.size_bytes, reverse=True)
    return artifacts


def trace_output_path(build_dir: Path, trace_path: Path) -> str:
    rel = trace_path.relative_to(build_dir)
    if rel.name.endswith(".json"):
        obj_name = rel.name[:-5] + ".o"
        return real(build_dir / rel.with_name(obj_name))
    return real(trace_path)


def find_trace_files(build_dir: Path, since: float | None = None) -> list[Path]:
    paths = []
    for path in build_dir.rglob("*.json"):
        if path.name in {"Labels.json", "launch.json", "settings.json", "extensions.json"}:
            continue
        if since is not None and path.stat().st_mtime < since:
            continue
        paths.append(path)
    return sorted(paths)


def max_duration(events: list[dict[str, Any]], name: str) -> float:
    return max(
        (
            float(event.get("dur", 0))
            for event in events
            if event.get("ph") == "X" and event.get("name") == name
        ),
        default=0.0,
    )


def add_event_cost(target: dict[str, EventCost], key: str, dur: float) -> None:
    cost = target.setdefault(key, EventCost())
    cost.total_us += dur
    cost.count += 1


def compute_source_self_times(source_events: list[dict[str, Any]]) -> list[tuple[dict[str, Any], float]]:
    indexed = []
    for idx, event in enumerate(source_events):
        start = float(event.get("ts", 0))
        dur = float(event.get("dur", 0))
        indexed.append((start, start + dur, -dur, idx, event))
    indexed.sort()

    child_us = [0.0] * len(source_events)
    stack: list[tuple[float, int, dict[str, Any]]] = []
    for start, end, _neg_dur, idx, event in indexed:
        while stack and stack[-1][0] <= start:
            stack.pop()
        if stack:
            parent_idx = stack[-1][1]
            child_us[parent_idx] += float(event.get("dur", 0))
        stack.append((end, idx, event))

    result = []
    for idx, event in enumerate(source_events):
        dur = float(event.get("dur", 0))
        result.append((event, max(dur - child_us[idx], 0.0)))
    return result


def load_trace(trace_path: Path, build_dir: Path, compdb_by_output: dict[str, dict[str, Any]], compdb_by_file: dict[str, dict[str, Any]]) -> TuTrace | None:
    try:
        with trace_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, dict):
        return None

    events = [event for event in data.get("traceEvents", []) if event.get("ph") == "X"]
    if not any(event.get("name") == "ExecuteCompiler" for event in events):
        return None

    output = trace_output_path(build_dir, trace_path)
    command = compdb_by_output.get(output)
    source = real(command["file"]) if command else ""
    if not command:
        # Fall back to the first project-looking Source event.
        for event in events:
            if event.get("name") == "Source":
                detail = event.get("args", {}).get("detail")
                if detail:
                    source = real(detail)
                    break

    trace = TuTrace(
        trace_path=real(trace_path),
        output=output,
        source=source,
        command=command or compdb_by_file.get(source),
        execute_us=max_duration(events, "ExecuteCompiler"),
        frontend_us=max_duration(events, "Frontend"),
        backend_us=max_duration(events, "Backend"),
        optimizer_us=max_duration(events, "Optimizer"),
        codegen_us=max_duration(events, "CodeGenPasses"),
    )

    source_events = [event for event in events if event.get("name") == "Source"]
    for event, self_us in compute_source_self_times(source_events):
        detail = event.get("args", {}).get("detail")
        if not detail:
            continue
        path = real(detail)
        cost = trace.source_costs.setdefault(path, SourceCost())
        dur = float(event.get("dur", 0))
        cost.inclusive_us += dur
        cost.self_us += self_us
        cost.count += 1
        cost.bytes = file_size(path)
        cost.tus.add(trace.source)

    for event in events:
        name = str(event.get("name", ""))
        dur = float(event.get("dur", 0))
        detail = str(event.get("args", {}).get("detail", ""))
        if not detail:
            continue
        if name.startswith("Instantiate"):
            add_event_cost(trace.template_costs, detail, dur)
        elif name == "CodeGen Function" or name == "OptFunction":
            add_event_cost(trace.function_costs, detail, dur)
        elif name.startswith("Evaluate"):
            add_event_cost(trace.constexpr_costs, detail, dur)
        elif name.startswith("Total "):
            add_event_cost(trace.event_totals, name.removeprefix("Total "), dur)

    return trace


def file_size(path: str) -> int:
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def is_under(path: str, root: str) -> bool:
    try:
        common = os.path.commonpath([path, root])
    except ValueError:
        return False
    return common == root


def display_path(path: str, root: str) -> str:
    if not path:
        return ""
    if is_under(path, root):
        return os.path.relpath(path, root)
    return path


def cmake_target_for_output(output: str, root: str) -> str:
    rel = display_path(output, root)
    match = re.search(r"(?:^|/)CMakeFiles/([^/]+)\.dir/", rel)
    if match:
        return match.group(1)
    if rel.startswith("lib/"):
        return "archive"
    if rel.startswith("bin/"):
        return "executable"
    return "unknown"


def ninja_span(entries: list[NinjaLogEntry]) -> tuple[int, int, int]:
    if not entries:
        return 0, 0, 0
    start = min(entry.start_ms for entry in entries)
    end = max(entry.end_ms for entry in entries)
    return start, end, max(end - start, 0)


def aggregate_sources(traces: list[TuTrace]) -> dict[str, SourceCost]:
    aggregate: dict[str, SourceCost] = defaultdict(SourceCost)
    for trace in traces:
        for path, cost in trace.source_costs.items():
            agg = aggregate[path]
            agg.inclusive_us += cost.inclusive_us
            agg.self_us += cost.self_us
            agg.count += cost.count
            agg.bytes = max(agg.bytes, cost.bytes)
            agg.tus.add(trace.source)
    return aggregate


def aggregate_events(traces: list[TuTrace], attr: str) -> dict[str, EventCost]:
    aggregate: dict[str, EventCost] = defaultdict(EventCost)
    for trace in traces:
        for key, cost in getattr(trace, attr).items():
            agg = aggregate[key]
            agg.total_us += cost.total_us
            agg.count += cost.count
    return aggregate


def command_without_output(entry: dict[str, Any]) -> list[str]:
    args = shlex.split(entry["command"])
    source = real(entry["file"])
    cleaned: list[str] = []
    skip_next = False
    options_with_arg = {"-o", "-MF", "-MT", "-MQ", "-MJ"}

    for idx, arg in enumerate(args):
        if skip_next:
            skip_next = False
            continue
        if idx == 0:
            cleaned.append(arg)
            continue
        if arg in options_with_arg:
            skip_next = True
            continue
        if any(arg.startswith(prefix) for prefix in ("-o", "-MF", "-MT", "-MQ", "-MJ")) and arg not in options_with_arg:
            continue
        if arg in {"-c", "-MD", "-MMD", "-ftime-trace"}:
            continue
        if arg.startswith("-ftime-trace"):
            continue
        if real(arg) == source and Path(arg).suffix in {".cc", ".cpp", ".cxx", ".c++", ".C"}:
            continue
        cleaned.append(arg)

    return cleaned


def command_for_include_scan(entry: dict[str, Any]) -> list[str]:
    return command_without_output(entry) + [
        "-Wno-unused-command-line-argument",
        "-H",
        "-fsyntax-only",
        "-fdiagnostics-color=never",
        real(entry["file"]),
    ]


def command_for_token_scan(entry: dict[str, Any]) -> list[str]:
    return command_without_output(entry) + [
        "-Wno-unused-command-line-argument",
        "-Xclang",
        "-dump-tokens",
        "-fsyntax-only",
        "-fdiagnostics-color=never",
        real(entry["file"]),
    ]


def command_for_frontend_stats(entry: dict[str, Any], stats_path: Path) -> list[str]:
    return command_without_output(entry) + [
        "-Wno-unused-command-line-argument",
        "-Xclang",
        "-print-stats",
        "-Xclang",
        f"-stats-file={stats_path}",
        "-fsyntax-only",
        "-fdiagnostics-color=never",
        real(entry["file"]),
    ]


def parse_frontend_stats_text(stderr: str) -> dict[str, int | float]:
    stats: dict[str, int | float] = {}

    simple_patterns: list[tuple[str, str]] = [
        (r"^\s*(\d+) types total", "ast-context.types.total"),
        (r"^\s*(\d+) decls total", "ast-context.decls.total"),
        (r"^\s*(\d+) stmts/exprs total", "ast-context.stmts_exprs.total"),
        (r"^\s*(\d+) directives found:", "frontend.preprocessor.directives"),
        (r"^\s*(\d+) #define\.", "frontend.preprocessor.defines"),
        (r"^\s*(\d+) #undef\.", "frontend.preprocessor.undefs"),
        (r"^\s*(\d+) source files entered\.", "frontend.preprocessor.source_files_entered"),
        (r"^\s*(\d+) max include stack depth", "frontend.preprocessor.max_include_stack_depth"),
        (r"^\s*(\d+) #if/#ifndef/#ifdef\.", "frontend.preprocessor.conditionals"),
        (r"^\s*(\d+) #else/#elif/#elifdef/#elifndef\.", "frontend.preprocessor.conditional_alternates"),
        (r"^\s*(\d+) #endif\.", "frontend.preprocessor.endifs"),
        (r"^\s*(\d+) #pragma\.", "frontend.preprocessor.pragmas"),
        (r"^\s*(\d+) #if/#ifndef#ifdef regions skipped", "frontend.preprocessor.skipped_regions"),
        (r"^Preprocessor Memory: (\d+)B total", "frontend.preprocessor.memory_bytes"),
        (r"^# Identifiers:\s+(\d+)", "frontend.identifiers.count"),
        (r"^Max identifier length:\s+(\d+)", "frontend.identifiers.max_length"),
        (r"^(\d+) files tracked\.", "frontend.header_search.files_tracked"),
        (r"^\s*(\d+) #import/#pragma once files\.", "frontend.header_search.once_files"),
        (r"^\s*(\d+) #include/#include_next/#import\.", "frontend.header_search.include_attempts"),
        (r"^\s*(\d+) #includes skipped due to the multi-include optimization\.", "frontend.header_search.multi_include_skips"),
        (r"^(\d+) files mapped, \d+ mem buffers mapped\.", "frontend.source_manager.files_mapped"),
        (r"^\d+ files mapped, (\d+) mem buffers mapped\.", "frontend.source_manager.mem_buffers_mapped"),
        (r"^(\d+) local SLocEntries allocated", "frontend.source_manager.local_sloc_entries"),
        (r"^\d+ local SLocEntries allocated \(\d+ bytes of capacity\), (\d+)B of SLoc address space used\.", "frontend.source_manager.sloc_address_bytes"),
        (r"^(\d+) bytes of files mapped", "frontend.source_manager.file_bytes_mapped"),
        (r"^FileID scans: (\d+) linear, \d+ binary\.", "frontend.source_manager.fileid_linear_scans"),
        (r"^FileID scans: \d+ linear, (\d+) binary\.", "frontend.source_manager.fileid_binary_scans"),
        (r"^(\d+) real files found, \d+ real dirs found\.", "frontend.file_manager.real_files"),
        (r"^\d+ real files found, (\d+) real dirs found\.", "frontend.file_manager.real_dirs"),
        (r"^(\d+) dir lookups, \d+ dir cache misses\.", "frontend.file_manager.dir_lookups"),
        (r"^\d+ dir lookups, (\d+) dir cache misses\.", "frontend.file_manager.dir_cache_misses"),
        (r"^(\d+) file lookups, \d+ file cache misses\.", "frontend.file_manager.file_lookups"),
        (r"^\d+ file lookups, (\d+) file cache misses\.", "frontend.file_manager.file_cache_misses"),
        (r"^(\d+) status\(\) calls", "frontend.vfs.status_calls"),
        (r"^(\d+) openFileForRead\(\) calls", "frontend.vfs.open_file_calls"),
    ]

    for line in stderr.splitlines():
        for pattern, key in simple_patterns:
            match = re.search(pattern, line)
            if match:
                stats[key] = stats.get(key, 0) + int(match.group(1))
                break

        macro_match = re.search(
            r"^(\d+)/(\d+)/(\d+) obj/fn/builtin macros expanded, (\d+) on the fast path\.",
            line,
        )
        if macro_match:
            keys = [
                "frontend.preprocessor.object_macros_expanded",
                "frontend.preprocessor.function_macros_expanded",
                "frontend.preprocessor.builtin_macros_expanded",
                "frontend.preprocessor.fast_macro_expansions",
            ]
            for key, value in zip(keys, macro_match.groups(), strict=True):
                stats[key] = stats.get(key, 0) + int(value)

        paste_match = re.search(r"^(\d+) token paste \(##\) operations performed, (\d+) on the fast path\.", line)
        if paste_match:
            stats["frontend.preprocessor.token_paste_operations"] = (
                stats.get("frontend.preprocessor.token_paste_operations", 0) + int(paste_match.group(1))
            )
            stats["frontend.preprocessor.fast_token_paste_operations"] = (
                stats.get("frontend.preprocessor.fast_token_paste_operations", 0) + int(paste_match.group(2))
            )

        ast_type_match = re.search(r"^\s*(\d+) ([A-Za-z0-9_]+) types,", line)
        if ast_type_match:
            stats[f"ast-context.types.{ast_type_match.group(2)}"] = (
                stats.get(f"ast-context.types.{ast_type_match.group(2)}", 0) + int(ast_type_match.group(1))
            )

        decl_match = re.search(r"^\s*(\d+) ([A-Za-z0-9_]+) decls,", line)
        if decl_match:
            stats[f"ast-context.decls.{decl_match.group(2)}"] = (
                stats.get(f"ast-context.decls.{decl_match.group(2)}", 0) + int(decl_match.group(1))
            )

        stmt_match = re.search(r"^\s*(\d+) ([A-Za-z0-9_]+), \d+ each", line)
        if stmt_match:
            stats[f"ast-context.stmts_exprs.{stmt_match.group(2)}"] = (
                stats.get(f"ast-context.stmts_exprs.{stmt_match.group(2)}", 0) + int(stmt_match.group(1))
            )

    return stats


INCLUDE_LINE_RE = re.compile(r"^(\.+)\s+(.*)$")
TOKEN_LOC_RE = re.compile(r"\bLoc=<([^<>:]+):\d+:\d+(?:\s|>)")


def parse_include_tree(stderr: str, trace: TuTrace) -> IncludeScan:
    scan = IncludeScan(tu=trace, stderr_path="")
    stack: list[str] = []
    seen: set[str] = set()

    for raw_line in stderr.splitlines():
        match = INCLUDE_LINE_RE.match(raw_line)
        if not match:
            continue
        depth = len(match.group(1))
        path = real(match.group(2).strip())
        while len(stack) >= depth:
            stack.pop()
        parent = stack[-1] if stack else trace.source
        stack.append(path)

        edge = scan.edges.setdefault((parent, path), EdgeCost())
        edge.include_count += 1
        edge.tus.add(trace.source)

        if path in seen:
            scan.repeated_includes[path] += 1
            continue
        seen.add(path)
        if path not in scan.first_routes:
            scan.first_routes[path] = list(stack)

        cost = trace.source_costs.get(path)
        if cost:
            edge.inclusive_us += cost.inclusive_us
            edge.self_us += cost.self_us
            edge.parse_count += cost.count

    return scan


def run_include_scan(trace: TuTrace, out_dir: Path) -> IncludeScan | None:
    if not trace.command:
        return None
    cmd = command_for_include_scan(trace.command)
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", display_path(trace.source, real(Path.cwd())))
    stderr_path = out_dir / f"{safe_name}.include-tree"
    try:
        proc = subprocess.run(
            cmd,
            cwd=trace.command["directory"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except OSError as exc:
        print(f"warning: include scan failed to start for {trace.source}: {exc}", file=sys.stderr)
        return None

    stderr_path.write_text(proc.stderr, encoding="utf-8")
    if proc.returncode != 0:
        print(
            f"warning: include scan returned {proc.returncode} for {display_path(trace.source, real(Path.cwd()))}; "
            f"kept stderr at {stderr_path}",
            file=sys.stderr,
        )
    scan = parse_include_tree(proc.stderr, trace)
    scan.stderr_path = real(stderr_path)
    return scan


def run_token_scan(trace: TuTrace, out_dir: Path) -> TokenScan | None:
    if not trace.command:
        return None
    cmd = command_for_token_scan(trace.command)
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", display_path(trace.source, real(Path.cwd())))
    stdout_path = out_dir / f"{safe_name}.tokens"
    try:
        with stdout_path.open("w", encoding="utf-8") as token_output:
            proc = subprocess.run(
                cmd,
                cwd=trace.command["directory"],
                stdout=subprocess.DEVNULL,
                stderr=token_output,
                text=True,
                check=False,
            )
    except OSError as exc:
        print(f"warning: token scan failed to start for {trace.source}: {exc}", file=sys.stderr)
        return None

    if proc.returncode != 0:
        print(
            f"warning: token scan returned {proc.returncode} for {display_path(trace.source, real(Path.cwd()))}; "
            f"kept token dump at {stdout_path}",
            file=sys.stderr,
        )

    scan = TokenScan(tu=trace, stdout_path=real(stdout_path))
    with stdout_path.open("r", encoding="utf-8", errors="replace") as token_file:
        for line in token_file:
            match = TOKEN_LOC_RE.search(line)
            if match:
                scan.token_counts[real(match.group(1))] += 1
    return scan


def run_frontend_stats_scan(trace: TuTrace, out_dir: Path) -> FrontendStatsScan | None:
    if not trace.command:
        return None
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", display_path(trace.source, real(Path.cwd())))
    stats_path = out_dir / f"{safe_name}.stats.json"
    stderr_path = out_dir / f"{safe_name}.stats.stderr"
    cmd = command_for_frontend_stats(trace.command, stats_path)
    try:
        proc = subprocess.run(
            cmd,
            cwd=trace.command["directory"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except OSError as exc:
        print(f"warning: frontend stats scan failed to start for {trace.source}: {exc}", file=sys.stderr)
        return None

    stderr_path.write_text(proc.stderr, encoding="utf-8")
    if proc.returncode != 0:
        print(
            f"warning: frontend stats scan returned {proc.returncode} for {display_path(trace.source, real(Path.cwd()))}; "
            f"kept stderr at {stderr_path}",
            file=sys.stderr,
        )

    stats: dict[str, int | float] = {}
    if stats_path.exists():
        try:
            with stats_path.open("r", encoding="utf-8") as f:
                raw = json.load(f)
            stats = {str(key): value for key, value in raw.items() if isinstance(value, int | float)}
        except (json.JSONDecodeError, OSError):
            stats = {}
    for key, value in parse_frontend_stats_text(proc.stderr).items():
        stats[key] = stats.get(key, 0) + value
    return FrontendStatsScan(tu=trace, stderr_path=real(stderr_path), stats_path=real(stats_path), stats=stats)


def aggregate_edges(scans: list[IncludeScan]) -> dict[tuple[str, str], EdgeCost]:
    aggregate: dict[tuple[str, str], EdgeCost] = defaultdict(EdgeCost)
    for scan in scans:
        for edge_key, edge in scan.edges.items():
            agg = aggregate[edge_key]
            agg.inclusive_us += edge.inclusive_us
            agg.self_us += edge.self_us
            agg.parse_count += edge.parse_count
            agg.include_count += edge.include_count
            agg.tus.update(edge.tus)
    return aggregate


def aggregate_tokens(scans: list[TokenScan]) -> Counter[str]:
    aggregate: Counter[str] = Counter()
    for scan in scans:
        aggregate.update(scan.token_counts)
    return aggregate


def aggregate_frontend_stats(scans: list[FrontendStatsScan]) -> dict[str, float]:
    aggregate: dict[str, float] = defaultdict(float)
    for scan in scans:
        for key, value in scan.stats.items():
            aggregate[key] += float(value)
    return dict(aggregate)


def hot_tus_rows(traces: list[TuTrace], root: str, top: int) -> list[list[str]]:
    rows = []
    for trace in sorted(traces, key=lambda item: item.frontend_us, reverse=True)[:top]:
        rows.append(
            [
                f"{seconds(trace.frontend_us):.2f}",
                f"{seconds(trace.backend_us):.2f}",
                f"{seconds(trace.execute_us):.2f}",
                str(len(trace.source_costs)),
                escape_cell(display_path(trace.source, root)),
            ]
        )
    return rows


def ninja_tu_rows(traces: list[TuTrace], root: str, top: int) -> list[list[str]]:
    rows = []
    items = [trace for trace in traces if trace.ninja_entry]
    for trace in sorted(items, key=lambda item: item.ninja_entry.duration_us if item.ninja_entry else 0.0, reverse=True)[:top]:
        assert trace.ninja_entry is not None
        rows.append(
            [
                f"{trace.ninja_entry.start_ms / 1000.0:.2f}",
                f"{trace.ninja_entry.end_ms / 1000.0:.2f}",
                f"{seconds(trace.ninja_entry.duration_us):.2f}",
                f"{seconds(trace.execute_us):.2f}",
                f"{seconds(trace.frontend_us):.2f}",
                f"{seconds(trace.backend_us):.2f}",
                cmake_target_for_output(trace.output, root),
                escape_cell(display_path(trace.source, root)),
            ]
        )
    return rows


def target_rows(traces: list[TuTrace], root: str, top: int) -> list[list[str]]:
    buckets: dict[str, dict[str, float | int]] = defaultdict(lambda: {
        "count": 0,
        "execute_us": 0.0,
        "frontend_us": 0.0,
        "backend_us": 0.0,
        "ninja_us": 0.0,
        "first_ms": -1,
        "last_ms": 0,
    })
    for trace in traces:
        target = cmake_target_for_output(trace.output, root)
        bucket = buckets[target]
        bucket["count"] = int(bucket["count"]) + 1
        bucket["execute_us"] = float(bucket["execute_us"]) + trace.execute_us
        bucket["frontend_us"] = float(bucket["frontend_us"]) + trace.frontend_us
        bucket["backend_us"] = float(bucket["backend_us"]) + trace.backend_us
        if trace.ninja_entry:
            bucket["ninja_us"] = float(bucket["ninja_us"]) + trace.ninja_entry.duration_us
            start_ms = trace.ninja_entry.start_ms
            end_ms = trace.ninja_entry.end_ms
            bucket["first_ms"] = start_ms if int(bucket["first_ms"]) < 0 else min(int(bucket["first_ms"]), start_ms)
            bucket["last_ms"] = max(int(bucket["last_ms"]), end_ms)

    rows = []
    for target, bucket in sorted(buckets.items(), key=lambda item: float(item[1]["execute_us"]), reverse=True)[:top]:
        first_ms = int(bucket["first_ms"])
        span_ms = max(int(bucket["last_ms"]) - first_ms, 0) if first_ms >= 0 else 0
        rows.append(
            [
                target,
                str(bucket["count"]),
                f"{seconds(float(bucket['execute_us'])):.2f}",
                f"{seconds(float(bucket['frontend_us'])):.2f}",
                f"{seconds(float(bucket['backend_us'])):.2f}",
                f"{seconds(float(bucket['ninja_us'])):.2f}" if bucket["ninja_us"] else "",
                f"{span_ms / 1000.0:.2f}" if span_ms else "",
            ]
        )
    return rows


def pch_rows(artifacts: list[PchArtifact], root: str, top: int) -> list[list[str]]:
    rows = []
    for artifact in artifacts[:top]:
        rows.append(
            [
                artifact.target,
                f"{artifact.size_bytes / (1024.0 * 1024.0):.1f}",
                escape_cell(display_path(artifact.path, root)),
            ]
        )
    return rows


def hot_headers_rows(sources: dict[str, SourceCost], root: str, top: int, project_only: bool) -> list[list[str]]:
    rows = []
    filtered = sources.items()
    if project_only:
        filtered = ((path, cost) for path, cost in sources.items() if is_under(path, root))
    for path, cost in sorted(filtered, key=lambda item: item[1].inclusive_us, reverse=True)[:top]:
        rows.append(
            [
                f"{seconds(cost.inclusive_us):.2f}",
                f"{seconds(cost.self_us):.2f}",
                f"{percent(cost.self_us, cost.inclusive_us):.0f}%",
                str(cost.count),
                str(len(cost.tus)),
                f"{cost.bytes / 1024.0:.1f}",
                escape_cell(display_path(path, root)),
            ]
        )
    return rows


def self_heavy_rows(sources: dict[str, SourceCost], root: str, top: int) -> list[list[str]]:
    candidates = [
        (path, cost)
        for path, cost in sources.items()
        if is_under(path, root) and cost.self_us >= 250_000 and cost.count > 0
    ]
    candidates.sort(key=lambda item: item[1].self_us, reverse=True)
    rows = []
    for path, cost in candidates[:top]:
        rows.append(
            [
                f"{seconds(cost.self_us):.2f}",
                f"{seconds(cost.inclusive_us):.2f}",
                f"{percent(cost.self_us, cost.inclusive_us):.0f}%",
                str(cost.count),
                f"{cost.bytes / 1024.0:.1f}",
                escape_cell(display_path(path, root)),
            ]
        )
    return rows


def route_heavy_rows(sources: dict[str, SourceCost], root: str, top: int) -> list[list[str]]:
    candidates = [
        (path, cost)
        for path, cost in sources.items()
        if is_under(path, root) and cost.inclusive_us >= 500_000 and percent(cost.self_us, cost.inclusive_us) <= 35.0
    ]
    candidates.sort(key=lambda item: item[1].inclusive_us - item[1].self_us, reverse=True)
    rows = []
    for path, cost in candidates[:top]:
        transit_us = cost.inclusive_us - cost.self_us
        rows.append(
            [
                f"{seconds(transit_us):.2f}",
                f"{seconds(cost.inclusive_us):.2f}",
                f"{seconds(cost.self_us):.2f}",
                str(cost.count),
                escape_cell(display_path(path, root)),
            ]
        )
    return rows


def event_rows(costs: dict[str, EventCost], top: int) -> list[list[str]]:
    rows = []
    for detail, cost in sorted(costs.items(), key=lambda item: item[1].total_us, reverse=True)[:top]:
        rows.append([f"{seconds(cost.total_us):.2f}", str(cost.count), escape_cell(trim(detail, 120))])
    return rows


def duplicated_event_rows(traces: list[TuTrace], root: str, top: int) -> list[list[str]]:
    buckets: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {
            "total_us": 0.0,
            "count": 0,
            "tus": defaultdict(float),
        }
    )
    event_groups = (
        ("template", "template_costs"),
        ("function", "function_costs"),
        ("constexpr", "constexpr_costs"),
    )
    for trace in traces:
        for kind, attr in event_groups:
            for detail, cost in getattr(trace, attr).items():
                bucket = buckets[(kind, detail)]
                bucket["total_us"] += cost.total_us
                bucket["count"] += cost.count
                bucket["tus"][trace.source] += cost.total_us

    rows = []
    candidates = [
        (kind, detail, bucket)
        for (kind, detail), bucket in buckets.items()
        if len(bucket["tus"]) > 1 and bucket["total_us"] >= 250_000
    ]
    candidates.sort(key=lambda item: float(item[2]["total_us"]), reverse=True)
    for kind, detail, bucket in candidates[:top]:
        top_tus = sorted(bucket["tus"].items(), key=lambda item: item[1], reverse=True)[:3]
        rows.append(
            [
                f"{seconds(float(bucket['total_us'])):.2f}",
                str(len(bucket["tus"])),
                str(bucket["count"]),
                kind,
                escape_cell("; ".join(f"{seconds(cost):.2f}s {display_path(source, root)}" for source, cost in top_tus)),
                escape_cell(trim(detail, 120)),
            ]
        )
    return rows


def duplicated_event_summary(traces: list[TuTrace], root: str, top: int) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {
            "total_us": 0.0,
            "count": 0,
            "tus": defaultdict(float),
        }
    )
    event_groups = (
        ("template", "template_costs"),
        ("function", "function_costs"),
        ("constexpr", "constexpr_costs"),
    )
    for trace in traces:
        for kind, attr in event_groups:
            for detail, cost in getattr(trace, attr).items():
                bucket = buckets[(kind, detail)]
                bucket["total_us"] += cost.total_us
                bucket["count"] += cost.count
                bucket["tus"][trace.source] += cost.total_us

    candidates = [
        (kind, detail, bucket)
        for (kind, detail), bucket in buckets.items()
        if len(bucket["tus"]) > 1 and bucket["total_us"] >= 250_000
    ]
    candidates.sort(key=lambda item: float(item[2]["total_us"]), reverse=True)
    return [
        {
            "kind": kind,
            "event": detail,
            "total_us": float(bucket["total_us"]),
            "count": int(bucket["count"]),
            "tu_count": len(bucket["tus"]),
            "top_tus": [
                {
                    "source": display_path(source, root),
                    "time_us": cost,
                }
                for source, cost in sorted(bucket["tus"].items(), key=lambda item: item[1], reverse=True)[:5]
            ],
        }
        for kind, detail, bucket in candidates[:top]
    ]


def edge_rows(edges: dict[tuple[str, str], EdgeCost], root: str, top: int, project_only: bool) -> list[list[str]]:
    rows = []
    items = edges.items()
    if project_only:
        items = ((edge, cost) for edge, cost in edges.items() if is_under(edge[1], root) or is_under(edge[0], root))
    for (parent, child), cost in sorted(items, key=lambda item: item[1].inclusive_us, reverse=True)[:top]:
        rows.append(
            [
                f"{seconds(cost.inclusive_us):.2f}",
                f"{seconds(cost.self_us):.2f}",
                str(cost.parse_count),
                str(cost.include_count),
                str(len(cost.tus)),
                escape_cell(display_path(parent, root)),
                escape_cell(display_path(child, root)),
            ]
        )
    return rows


def token_rows(tokens: Counter[str], source_costs: dict[str, SourceCost], root: str, top: int, project_only: bool) -> list[list[str]]:
    rows = []
    items = tokens.items()
    if project_only:
        items = ((path, count) for path, count in tokens.items() if is_under(path, root))
    for path, count in sorted(items, key=lambda item: item[1], reverse=True)[:top]:
        cost = source_costs.get(path)
        rows.append(
            [
                str(count),
                f"{seconds(cost.inclusive_us):.2f}" if cost else "",
                f"{seconds(cost.self_us):.2f}" if cost else "",
                escape_cell(display_path(path, root)),
            ]
        )
    return rows


def frontend_stats_rows(stats: dict[str, float], top: int) -> list[list[str]]:
    interesting_prefixes = (
        "file-search.",
        "frontend.",
        "template-instantiation.",
        "semantic-analysis.",
        "ast-context.",
    )
    candidates = {
        key: value
        for key, value in stats.items()
        if key.startswith(interesting_prefixes) or "Template" in key or "Decl" in key or "Type" in key
    }
    return [[f"{value:.0f}", escape_cell(key)] for key, value in sorted(candidates.items(), key=lambda item: item[1], reverse=True)[:top]]


def trim(text: str, width: int) -> str:
    if len(text) <= width:
        return text
    return text[: max(width - 3, 0)] + "..."


def focus_routes(scans: list[IncludeScan], focus_paths: list[str], root: str) -> str:
    if not scans or not focus_paths:
        return ""
    lines: list[str] = []
    lines.append("## Focus Include Routes\n")
    for focus in focus_paths:
        focus_real = real(focus)
        lines.append(f"### `{escape_cell(display_path(focus_real, root))}`\n")
        found = False
        for scan in scans:
            route = scan.first_routes.get(focus_real)
            if not route:
                continue
            found = True
            lines.append(f"* `{escape_cell(display_path(scan.tu.source, root))}`")
            for depth, item in enumerate(route, start=1):
                prefix = "  " * depth + "- "
                cost = scan.tu.source_costs.get(item)
                cost_text = f" ({seconds(cost.inclusive_us):.2f}s incl, {seconds(cost.self_us):.2f}s self)" if cost else ""
                lines.append(f"{prefix}`{escape_cell(display_path(item, root))}`{cost_text}")
        if not found:
            lines.append("_Not found in scanned include trees._")
        lines.append("")
    return "\n".join(lines)


def render_report(
    build_dir: Path,
    root: str,
    traces: list[TuTrace],
    source_costs: dict[str, SourceCost],
    ninja_entries: dict[str, NinjaLogEntry],
    pch_artifacts: list[PchArtifact],
    since: float | None,
    scans: list[IncludeScan],
    token_scans: list[TokenScan],
    frontend_stats_scans: list[FrontendStatsScan],
    focus: list[str],
    top: int,
    project_only: bool,
) -> str:
    total_execute = sum(trace.execute_us for trace in traces)
    total_frontend = sum(trace.frontend_us for trace in traces)
    total_backend = sum(trace.backend_us for trace in traces)
    total_optimizer = sum(trace.optimizer_us for trace in traces)
    total_codegen = sum(trace.codegen_us for trace in traces)
    traced_ninja_entries = [trace.ninja_entry for trace in traces if trace.ninja_entry]
    ninja_start_ms, ninja_end_ms, ninja_wall_ms = ninja_span([entry for entry in traced_ninja_entries if entry])
    ninja_command_us = sum(entry.duration_us for entry in traced_ninja_entries if entry)
    total_pch_bytes = sum(artifact.size_bytes for artifact in pch_artifacts)

    template_costs = aggregate_events(traces, "template_costs")
    function_costs = aggregate_events(traces, "function_costs")
    constexpr_costs = aggregate_events(traces, "constexpr_costs")
    edge_costs = aggregate_edges(scans)
    token_counts = aggregate_tokens(token_scans)
    frontend_stats = aggregate_frontend_stats(frontend_stats_scans)

    lines: list[str] = []
    lines.append("# Compile Trace Explorer Report\n")
    lines.append(f"* Build dir: `{display_path(real(build_dir), root)}`")
    lines.append(f"* Trace files: `{len(traces)}`")
    lines.append(f"* Include scans: `{len(scans)}`")
    lines.append(f"* Token scans: `{len(token_scans)}`")
    lines.append(f"* Frontend stats scans: `{len(frontend_stats_scans)}`")
    if since is not None:
        lines.append(f"* Freshness filter: traces and Ninja log outputs newer than Unix time `{since:.3f}`")
    lines.append(
        f"* Aggregate traced work: `{seconds(total_execute):.1f}s` execute, "
        f"`{seconds(total_frontend):.1f}s` frontend, `{seconds(total_backend):.1f}s` backend"
    )
    if ninja_entries:
        lines.append(f"* Ninja log outputs in scope: `{len(ninja_entries)}`")
    if traced_ninja_entries:
        avg_parallelism = (ninja_command_us / (ninja_wall_ms * 1000.0)) if ninja_wall_ms else 0.0
        lines.append(
            f"* Traced Ninja span: `{ninja_wall_ms / 1000.0:.2f}s` wall "
            f"({ninja_start_ms / 1000.0:.2f}s to {ninja_end_ms / 1000.0:.2f}s), "
            f"`{seconds(ninja_command_us):.1f}s` summed command time, `{avg_parallelism:.1f}x` average parallelism"
        )
    if pch_artifacts:
        lines.append(
            f"* PCH artifacts: `{len(pch_artifacts)}` files, `{total_pch_bytes / (1024.0 * 1024.0):.1f} MiB` total"
        )
    if total_optimizer or total_codegen:
        lines.append(
            f"* Backend split: `{seconds(total_optimizer):.1f}s` optimizer, "
            f"`{seconds(total_codegen):.1f}s` codegen passes"
        )
    lines.append("")

    lines.append("## Hottest Translation Units\n")
    lines.append(table(["frontend s", "backend s", "execute s", "headers", "source"], hot_tus_rows(traces, root, top)))

    if traced_ninja_entries:
        lines.append("## Hottest Ninja Compile Commands\n")
        lines.append(
            table(
                ["start s", "end s", "ninja s", "trace execute s", "frontend s", "backend s", "target", "source"],
                ninja_tu_rows(traces, root, top),
            )
        )

        lines.append("## CMake Target Work Buckets\n")
        lines.append(
            table(
                ["target", "TUs", "execute s", "frontend s", "backend s", "ninja command s", "ninja span s"],
                target_rows(traces, root, top),
            )
        )

    if pch_artifacts:
        lines.append("## Precompiled Header Artifacts\n")
        lines.append(table(["target", "size MiB", "path"], pch_rows(pch_artifacts, root, top)))

    lines.append("## Hot Project Headers By Inclusive Parse Time\n")
    lines.append(
        table(
            ["incl s", "self s", "self %", "source events", "TUs", "KiB", "header"],
            hot_headers_rows(source_costs, root, top, project_only=True),
        )
    )

    if not project_only:
        lines.append("## Hot Headers Including External\n")
        lines.append(
            table(
                ["incl s", "self s", "self %", "source events", "TUs", "KiB", "header"],
                hot_headers_rows(source_costs, root, top, project_only=False),
            )
        )

    lines.append("## Self-Heavy Header Candidates\n")
    lines.append("These are good split/out-of-line candidates because time is spent in the file's own contents, not only children.\n")
    lines.append(table(["self s", "incl s", "self %", "events", "KiB", "header"], self_heavy_rows(source_costs, root, top)))

    lines.append("## Route-Heavy Header Candidates\n")
    lines.append("These are good include-pruning candidates because most time is in their transitive subtree.\n")
    lines.append(table(["transitive s", "incl s", "self s", "events", "header"], route_heavy_rows(source_costs, root, top)))

    if edge_costs:
        lines.append("## Expensive Include Edges From Scanned TUs\n")
        lines.append(
            table(
                ["charged incl s", "self s", "parsed", "included", "TUs", "including file", "included file"],
                edge_rows(edge_costs, root, top, project_only=True),
            )
        )

    if token_counts:
        lines.append("## Token Sources From Scanned TUs\n")
        lines.append(
            "Tokens come from `-Xclang -dump-tokens`; this is a lower-level proxy for frontend input volume.\n"
        )
        lines.append(table(["tokens", "incl s", "self s", "source file"], token_rows(token_counts, source_costs, root, top, project_only=True)))

    if frontend_stats:
        lines.append("## Frontend Counters From Scanned TUs\n")
        lines.append(
            "These are Clang `-Xclang -print-stats`/`-stats-file` counters aggregated over scanned TUs.\n"
        )
        lines.append(table(["value", "counter"], frontend_stats_rows(frontend_stats, top)))

    lines.append("## Duplicated Template/Function/Constexpr Work\n")
    lines.append(
        "These events appear in more than one translation unit, so reducing a duplicate site removes real repeated work.\n"
    )
    lines.append(
        table(
            ["time s", "TUs", "count", "kind", "hottest TUs", "event"],
            duplicated_event_rows(traces, root, top),
        )
    )

    lines.append("## Top Template Instantiations\n")
    lines.append(table(["time s", "count", "template"], event_rows(template_costs, top)))

    lines.append("## Top Compile/Optimize Functions\n")
    lines.append(table(["time s", "count", "function"], event_rows(function_costs, top)))

    lines.append("## Top Constant Evaluation Events\n")
    lines.append(table(["time s", "count", "event"], event_rows(constexpr_costs, top)))

    if focus:
        lines.append(focus_routes(scans, focus, root))

    if scans:
        lines.append("## Include Scan Artifacts\n")
        for scan in scans:
            lines.append(f"* `{display_path(scan.tu.source, root)}` -> `{scan.stderr_path}`")
        lines.append("")

    if token_scans:
        lines.append("## Token Scan Artifacts\n")
        for scan in token_scans:
            lines.append(f"* `{display_path(scan.tu.source, root)}` -> `{scan.stdout_path}`")
        lines.append("")

    if frontend_stats_scans:
        lines.append("## Frontend Stats Artifacts\n")
        for scan in frontend_stats_scans:
            lines.append(
                f"* `{display_path(scan.tu.source, root)}` -> `{scan.stats_path}`, stderr `{scan.stderr_path}`"
            )
        lines.append("")

    return "\n".join(lines)


def json_summary(
    root: str,
    traces: list[TuTrace],
    source_costs: dict[str, SourceCost],
    ninja_entries: dict[str, NinjaLogEntry],
    pch_artifacts: list[PchArtifact],
    since: float | None,
    scans: list[IncludeScan],
    token_scans: list[TokenScan],
    frontend_stats_scans: list[FrontendStatsScan],
    top: int,
) -> dict[str, Any]:
    edge_costs = aggregate_edges(scans)
    token_counts = aggregate_tokens(token_scans)
    frontend_stats = aggregate_frontend_stats(frontend_stats_scans)
    traced_ninja_entries = [trace.ninja_entry for trace in traces if trace.ninja_entry]
    _ninja_start_ms, _ninja_end_ms, ninja_wall_ms = ninja_span([entry for entry in traced_ninja_entries if entry])
    ninja_command_us = sum(entry.duration_us for entry in traced_ninja_entries if entry)
    return {
        "trace_count": len(traces),
        "ninja_log_output_count": len(ninja_entries),
        "pch_artifact_count": len(pch_artifacts),
        "pch_total_bytes": sum(artifact.size_bytes for artifact in pch_artifacts),
        "pch_artifacts": [
            {
                "target": artifact.target,
                "size_bytes": artifact.size_bytes,
                "path": display_path(artifact.path, root),
            }
            for artifact in pch_artifacts[:top]
        ],
        "since_unix": since,
        "include_scan_count": len(scans),
        "token_scan_count": len(token_scans),
        "frontend_stats_scan_count": len(frontend_stats_scans),
        "totals": {
            "execute_us": sum(trace.execute_us for trace in traces),
            "frontend_us": sum(trace.frontend_us for trace in traces),
            "backend_us": sum(trace.backend_us for trace in traces),
        },
        "ninja": {
            "mapped_trace_count": len(traced_ninja_entries),
            "wall_us": ninja_wall_ms * 1000,
            "summed_command_us": ninja_command_us,
            "average_parallelism": (ninja_command_us / (ninja_wall_ms * 1000.0)) if ninja_wall_ms else 0.0,
        },
        "frontend_stats": frontend_stats,
        "duplicated_events": duplicated_event_summary(traces, root, top),
        "hot_tus": [
            {
                "source": display_path(trace.source, root),
                "frontend_us": trace.frontend_us,
                "backend_us": trace.backend_us,
                "execute_us": trace.execute_us,
                "ninja_us": trace.ninja_entry.duration_us if trace.ninja_entry else None,
                "cmake_target": cmake_target_for_output(trace.output, root),
                "header_count": len(trace.source_costs),
            }
            for trace in sorted(traces, key=lambda item: item.frontend_us, reverse=True)[:top]
        ],
        "cmake_targets": [
            {
                "target": row[0],
                "translation_units": int(row[1]),
                "execute_s": float(row[2]),
                "frontend_s": float(row[3]),
                "backend_s": float(row[4]),
                "ninja_command_s": float(row[5]) if row[5] else None,
                "ninja_span_s": float(row[6]) if row[6] else None,
            }
            for row in target_rows(traces, root, top)
        ],
        "hot_project_headers": [
            {
                "path": display_path(path, root),
                "inclusive_us": cost.inclusive_us,
                "self_us": cost.self_us,
                "source_event_count": cost.count,
                "tu_count": len(cost.tus),
                "bytes": cost.bytes,
            }
            for path, cost in sorted(source_costs.items(), key=lambda item: item[1].inclusive_us, reverse=True)
            if is_under(path, root)
        ][:top],
        "expensive_edges": [
            {
                "parent": display_path(parent, root),
                "child": display_path(child, root),
                "inclusive_us": cost.inclusive_us,
                "self_us": cost.self_us,
                "parse_count": cost.parse_count,
                "include_count": cost.include_count,
                "tu_count": len(cost.tus),
            }
            for (parent, child), cost in sorted(edge_costs.items(), key=lambda item: item[1].inclusive_us, reverse=True)
        ][:top],
        "token_sources": [
            {
                "path": display_path(path, root),
                "tokens": count,
                "inclusive_us": source_costs.get(path, SourceCost()).inclusive_us,
                "self_us": source_costs.get(path, SourceCost()).self_us,
            }
            for path, count in sorted(token_counts.items(), key=lambda item: item[1], reverse=True)
            if is_under(path, root)
        ][:top],
    }


def h(text: object) -> str:
    return html.escape(str(text), quote=True)


def fmt_seconds(micros: float) -> str:
    return f"{seconds(micros):.2f}s"


def fmt_count(value: int | float) -> str:
    return f"{value:,.0f}"


def slug(text: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return value or "item"


BB_TERM_RULES: list[tuple[str, str, tuple[str, ...], str]] = [
    ("Flavor", "Flavor definitions", ("src/barretenberg/flavor/",), "Arithmetization shape, entity lists, relation tuples, recursive variants."),
    ("Sumcheck", "Sumcheck", ("src/barretenberg/sumcheck/",), "Round logic, prover/verifier folding, relation accumulation."),
    ("PCS", "Commitment/PCS", ("src/barretenberg/commitment_schemes/", "src/barretenberg/srs/"), "KZG/IPA/Shplonk/Gemini and CRS machinery."),
    ("ECC", "Curves, fields, ECC", ("src/barretenberg/ecc/",), "Native field arithmetic, curve groups, scalar multiplication."),
    ("Stdlib", "Stdlib primitives", ("src/barretenberg/stdlib/primitives/", "src/barretenberg/stdlib/hash/"), "Circuit field/group/hash gadgets and recursive verifier ingredients."),
    ("Builders", "Circuit builders", ("src/barretenberg/stdlib_circuit_builders/",), "Builder state, gates, lookup tables, op queues, trace construction."),
    ("Relations", "Relations", ("src/barretenberg/relations/",), "Constraint relation code and VM relation accumulators."),
    ("Crypto", "Crypto params/hash", ("src/barretenberg/crypto/",), "Native hash implementations and compile-time constants."),
    ("Transcript", "Transcript", ("src/barretenberg/transcript/",), "Fiat-Shamir transcript codecs, manifests, challenges."),
    ("Polynomials", "Polynomials", ("src/barretenberg/polynomials/",), "Polynomial/univariate containers and arithmetic."),
    ("UltraHonk", "Ultra Honk/Oink", ("src/barretenberg/ultra_honk/",), "Main Honk prover/verifier/test harnesses."),
    ("Goblin", "Goblin/ECCVM", ("src/barretenberg/goblin/", "src/barretenberg/goblin_avm/", "src/barretenberg/eccvm/"), "Goblin merge, ECCVM, translator-adjacent structures."),
    ("Common", "Common infrastructure", ("src/barretenberg/common/", "src/barretenberg/env/", "src/barretenberg/numeric/"), "Logging, assertions, serialization, env, numeric utilities."),
]


def bb_term_for_path(path: str, root: str) -> tuple[str, str, str]:
    rel = display_path(path, root)
    for term, label, needles, description in BB_TERM_RULES:
        if any(needle in rel for needle in needles):
            return term, label, description
    if is_under(path, root):
        return "OtherBB", "Other Barretenberg", "Project source outside the main compile-time buckets."
    return "External", "External/system", "Compiler, standard library, or third-party dependency headers."


def html_table(headers: list[str], rows: list[list[object]], class_name: str = "data-table") -> str:
    if not rows:
        return '<p class="empty">No rows.</p>'
    head = "".join(f"<th>{h(header)}</th>" for header in headers)
    body = []
    for row in rows:
        body.append("<tr>" + "".join(f"<td>{h(cell)}</td>" for cell in row) + "</tr>")
    return f'<table class="{class_name}"><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


def nav_html(active: str, pages: list[tuple[str, str]]) -> str:
    links = []
    for filename, title in pages:
        cls = "active" if filename == active else ""
        links.append(f'<a class="{cls}" href="{h(filename)}">{h(title)}</a>')
    return f'<nav class="top-nav">{"".join(links)}</nav>'


def html_shell(title: str, active: str, pages: list[tuple[str, str]], body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{h(title)}</title>
<style>
:root {{
  color-scheme: light;
  --bg: #f7f8f6;
  --panel: #ffffff;
  --ink: #172018;
  --muted: #647067;
  --line: #d9dfd9;
  --accent: #226f54;
  --accent-2: #7c3aed;
  --accent-3: #b45309;
  --warn: #b42318;
  --code: #10251d;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}}
header {{
  padding: 20px 28px 12px;
  background: #10251d;
  color: #f6fff9;
}}
h1 {{ margin: 0 0 6px; font-size: 26px; letter-spacing: 0; }}
h2 {{ margin: 28px 0 12px; font-size: 19px; }}
h3 {{ margin: 18px 0 8px; font-size: 15px; }}
p {{ max-width: 980px; }}
code {{ color: var(--code); background: #edf2ee; padding: 1px 4px; border-radius: 4px; }}
.top-nav {{
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 28px;
  background: #e6ece7;
  border-bottom: 1px solid var(--line);
}}
.top-nav a {{
  color: #18362b;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 9px;
  font-weight: 600;
}}
.top-nav a.active, .top-nav a:hover {{
  background: var(--panel);
  border-color: #c8d4cc;
}}
main {{ padding: 16px 28px 40px; max-width: 1500px; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }}
.panel {{
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(20, 35, 25, 0.05);
}}
.metric .value {{ font-size: 25px; font-weight: 760; }}
.metric .label {{ color: var(--muted); font-weight: 650; }}
.metric .sub {{ color: var(--muted); margin-top: 4px; }}
.chart {{ width: 100%; min-height: 240px; overflow-x: auto; }}
.chart svg {{ max-width: 100%; height: auto; }}
.data-table {{ width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); }}
.data-table th, .data-table td {{ padding: 7px 9px; border-bottom: 1px solid #e6ebe6; vertical-align: top; }}
.data-table th {{ text-align: left; color: #26382e; background: #edf2ee; position: sticky; top: 0; z-index: 1; }}
.data-table tbody tr:hover {{ background: #fbf7ea; }}
.scroll {{ max-height: 620px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }}
.tag {{ display: inline-block; padding: 2px 6px; border-radius: 999px; background: #e8f3ee; color: #174d3a; font-weight: 650; }}
.warn {{ color: var(--warn); font-weight: 700; }}
.muted {{ color: var(--muted); }}
.empty {{ color: var(--muted); }}
.two-col {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }}
@media (max-width: 900px) {{ .two-col {{ grid-template-columns: 1fr; }} main, header, .top-nav {{ padding-left: 14px; padding-right: 14px; }} }}
</style>
</head>
<body>
<header>
  <h1>{h(title)}</h1>
  <div class="muted">Static compile-work report generated by <code>compile_trace_explorer.py</code>.</div>
</header>
{nav_html(active, pages)}
<main>
{body}
</main>
</body>
</html>
"""


def html_spa_shell(title: str, sections: list[tuple[str, str, str]]) -> str:
    nav = "".join(f'<a href="#{h(section_id)}" data-spa-link="{h(section_id)}">{h(label)}</a>' for section_id, label, _body in sections)
    section_html = "\n".join(
        f'<section id="{h(section_id)}" class="spa-section" data-title="{h(label)}"><h1 class="section-title">{h(label)}</h1>{body}</section>'
        for section_id, label, body in sections
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{h(title)}</title>
<style>
:root {{
  color-scheme: light;
  --bg: #f7f8f6;
  --panel: #ffffff;
  --ink: #172018;
  --muted: #647067;
  --line: #d9dfd9;
  --accent: #226f54;
  --accent-2: #7c3aed;
  --accent-3: #b45309;
  --warn: #b42318;
  --code: #10251d;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}}
header {{
  padding: 20px 28px 12px;
  background: #10251d;
  color: #f6fff9;
}}
h1 {{ margin: 0 0 6px; font-size: 26px; letter-spacing: 0; }}
h2 {{ margin: 28px 0 12px; font-size: 19px; }}
h3 {{ margin: 18px 0 8px; font-size: 15px; }}
p {{ max-width: 980px; }}
code {{ color: var(--code); background: #edf2ee; padding: 1px 4px; border-radius: 4px; }}
.top-nav {{
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 28px;
  background: #e6ece7;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 10;
}}
.top-nav a {{
  color: #18362b;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 9px;
  font-weight: 600;
}}
.top-nav a.active, .top-nav a:hover {{
  background: var(--panel);
  border-color: #c8d4cc;
}}
main {{ padding: 16px 28px 40px; max-width: 1500px; }}
.section-title {{ margin-bottom: 14px; }}
.spa-ready .spa-section {{ display: none; }}
.spa-ready .spa-section.active {{ display: block; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }}
.panel {{
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(20, 35, 25, 0.05);
}}
.metric .value {{ font-size: 25px; font-weight: 760; }}
.metric .label {{ color: var(--muted); font-weight: 650; }}
.metric .sub {{ color: var(--muted); margin-top: 4px; }}
.chart {{ width: 100%; min-height: 240px; overflow-x: auto; }}
.chart svg {{ max-width: 100%; height: auto; }}
.data-table {{ width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); }}
.data-table th, .data-table td {{ padding: 7px 9px; border-bottom: 1px solid #e6ebe6; vertical-align: top; }}
.data-table th {{ text-align: left; color: #26382e; background: #edf2ee; position: sticky; top: 0; z-index: 1; }}
.data-table tbody tr:hover {{ background: #fbf7ea; }}
.scroll {{ max-height: 620px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }}
.tag {{ display: inline-block; padding: 2px 6px; border-radius: 999px; background: #e8f3ee; color: #174d3a; font-weight: 650; }}
.warn {{ color: var(--warn); font-weight: 700; }}
.muted {{ color: var(--muted); }}
.empty {{ color: var(--muted); }}
.two-col {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }}
@media (max-width: 900px) {{ .two-col {{ grid-template-columns: 1fr; }} main, header, .top-nav {{ padding-left: 14px; padding-right: 14px; }} }}
</style>
</head>
<body>
<header>
  <h1>{h(title)}</h1>
  <div class="muted">Single-file compile-work report generated by <code>compile_trace_explorer.py</code>.</div>
</header>
<nav class="top-nav">{nav}</nav>
<main>
{section_html}
</main>
<script>
(() => {{
  const ids = {json.dumps([section_id for section_id, _label, _body in sections])};
  const labels = {json.dumps({section_id: label for section_id, label, _body in sections})};
  const reportTitle = {json.dumps(title)};
  document.body.classList.add("spa-ready");
  function currentId() {{
    const id = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    return ids.includes(id) ? id : ids[0];
  }}
  function show(id) {{
    for (const section of document.querySelectorAll(".spa-section")) {{
      section.classList.toggle("active", section.id === id);
    }}
    for (const link of document.querySelectorAll("[data-spa-link]")) {{
      link.classList.toggle("active", link.getAttribute("data-spa-link") === id);
    }}
    document.title = labels[id] ? `${{labels[id]}} - ${{reportTitle}}` : reportTitle;
  }}
  window.addEventListener("hashchange", () => show(currentId()));
  show(currentId());
}})();
</script>
</body>
</html>
"""


def metric(label: str, value: str, sub: str = "") -> str:
    return f'<div class="panel metric"><div class="label">{h(label)}</div><div class="value">{h(value)}</div><div class="sub">{h(sub)}</div></div>'


def svg_bar_chart(items: list[tuple[str, float, str]], width: int = 980, row_height: int = 26, color: str = "#226f54") -> str:
    if not items:
        return '<p class="empty">No chart data.</p>'
    label_width = 330
    value_width = 90
    chart_width = max(width - label_width - value_width - 40, 100)
    height = 28 + row_height * len(items)
    max_value = max(value for _label, value, _tip in items) or 1.0
    rows = []
    for idx, (label, value, tip) in enumerate(items):
        y = 22 + idx * row_height
        bar_w = max(1.0, chart_width * value / max_value)
        rows.append(
            f'<text x="0" y="{y + 14}" font-size="12">{h(trim(label, 58))}</text>'
            f'<rect x="{label_width}" y="{y + 3}" width="{bar_w:.1f}" height="16" rx="3" fill="{color}"><title>{h(tip)}</title></rect>'
            f'<text x="{label_width + chart_width + 10}" y="{y + 14}" font-size="12">{h(fmt_seconds(value))}</text>'
        )
    return f'<div class="chart"><svg viewBox="0 0 {width} {height}" role="img">{"".join(rows)}</svg></div>'


def svg_stacked_tu_chart(traces: list[TuTrace], root: str, top: int = 18) -> str:
    items = sorted(traces, key=lambda trace: trace.execute_us, reverse=True)[:top]
    if not items:
        return '<p class="empty">No chart data.</p>'
    width = 1080
    label_width = 360
    chart_width = 570
    row_height = 28
    height = 30 + row_height * len(items)
    max_total = max(trace.frontend_us + trace.backend_us for trace in items) or 1.0
    rows = []
    for idx, trace in enumerate(items):
        y = 22 + idx * row_height
        fw = chart_width * trace.frontend_us / max_total
        bw = chart_width * trace.backend_us / max_total
        label = display_path(trace.source, root)
        rows.append(
            f'<text x="0" y="{y + 14}" font-size="12">{h(trim(label, 62))}</text>'
            f'<rect x="{label_width}" y="{y + 3}" width="{fw:.1f}" height="16" rx="3" fill="#226f54"><title>frontend {fmt_seconds(trace.frontend_us)}</title></rect>'
            f'<rect x="{label_width + fw:.1f}" y="{y + 3}" width="{bw:.1f}" height="16" rx="3" fill="#7c3aed"><title>backend {fmt_seconds(trace.backend_us)}</title></rect>'
            f'<text x="{label_width + chart_width + 12}" y="{y + 14}" font-size="12">{h(fmt_seconds(trace.execute_us))}</text>'
        )
    legend = '<rect x="0" y="3" width="12" height="12" fill="#226f54"/><text x="18" y="14" font-size="12">frontend</text><rect x="96" y="3" width="12" height="12" fill="#7c3aed"/><text x="114" y="14" font-size="12">backend</text>'
    return f'<div class="chart"><svg viewBox="0 0 {width} {height + 22}" role="img"><g transform="translate(0,0)">{legend}</g><g transform="translate(0,22)">{"".join(rows)}</g></svg></div>'


def svg_scatter(points: list[tuple[float, float, str, str]], x_label: str, y_label: str, width: int = 820, height: int = 430) -> str:
    if not points:
        return '<p class="empty">No chart data.</p>'
    pad_l, pad_r, pad_t, pad_b = 74, 22, 20, 58
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    max_x = max(point[0] for point in points) or 1.0
    max_y = max(point[1] for point in points) or 1.0
    circles = []
    for x_val, y_val, label, color in points:
        x = pad_l + plot_w * x_val / max_x
        y = pad_t + plot_h * (1.0 - y_val / max_y)
        circles.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.2" fill="{color}" opacity="0.78">'
            f'<title>{h(label)}: x={x_val:.1f}, y={y_val:.1f}</title></circle>'
        )
    return (
        f'<div class="chart"><svg viewBox="0 0 {width} {height}" role="img">'
        f'<line x1="{pad_l}" y1="{pad_t + plot_h}" x2="{pad_l + plot_w}" y2="{pad_t + plot_h}" stroke="#88938b"/>'
        f'<line x1="{pad_l}" y1="{pad_t}" x2="{pad_l}" y2="{pad_t + plot_h}" stroke="#88938b"/>'
        f'<text x="{pad_l + plot_w / 2:.1f}" y="{height - 14}" text-anchor="middle" font-size="12">{h(x_label)}</text>'
        f'<text x="18" y="{pad_t + plot_h / 2:.1f}" transform="rotate(-90 18 {pad_t + plot_h / 2:.1f})" text-anchor="middle" font-size="12">{h(y_label)}</text>'
        f'{"".join(circles)}</svg></div>'
    )


def svg_treemap(items: list[tuple[str, float, str]], width: int = 980, height: int = 280) -> str:
    if not items:
        return '<p class="empty">No chart data.</p>'
    total = sum(value for _label, value, _tip in items) or 1.0
    palette = ["#226f54", "#7c3aed", "#b45309", "#2563eb", "#be123c", "#0f766e", "#6d28d9", "#a16207"]
    x = 0.0
    rects = []
    for idx, (label, value, tip) in enumerate(items):
        w = width * value / total
        if w < 2:
            continue
        color = palette[idx % len(palette)]
        rects.append(
            f'<rect x="{x:.1f}" y="0" width="{w:.1f}" height="{height}" fill="{color}" opacity="0.86"><title>{h(tip)}</title></rect>'
        )
        if w > 84:
            rects.append(f'<text x="{x + 8:.1f}" y="22" fill="white" font-size="12" font-weight="700">{h(trim(label, int(w / 7)))}</text>')
        x += w
    return f'<div class="chart"><svg viewBox="0 0 {width} {height}" role="img">{"".join(rects)}</svg></div>'


def svg_edge_graph(edges: dict[tuple[str, str], EdgeCost], root: str, top: int = 18) -> str:
    items = sorted(
        [(edge, cost) for edge, cost in edges.items() if is_under(edge[0], root) or is_under(edge[1], root)],
        key=lambda item: item[1].inclusive_us,
        reverse=True,
    )[:top]
    if not items:
        return '<p class="empty">No scanned include edges.</p>'
    width = 1120
    row_height = 34
    height = 40 + row_height * len(items)
    max_value = max(cost.inclusive_us for _edge, cost in items) or 1.0
    rows = []
    for idx, ((parent, child), cost) in enumerate(items):
        y = 26 + idx * row_height
        stroke_w = 1.0 + 7.0 * cost.inclusive_us / max_value
        rows.append(
            f'<text x="0" y="{y + 4}" font-size="11">{h(trim(display_path(parent, root), 58))}</text>'
            f'<line x1="390" y1="{y}" x2="705" y2="{y}" stroke="#226f54" stroke-width="{stroke_w:.1f}" opacity="0.75"><title>{h(fmt_seconds(cost.inclusive_us))}</title></line>'
            f'<polygon points="705,{y - 4} 714,{y} 705,{y + 4}" fill="#226f54"/>'
            f'<text x="730" y="{y + 4}" font-size="11">{h(trim(display_path(child, root), 58))}</text>'
            f'<text x="1040" y="{y + 4}" font-size="11">{h(fmt_seconds(cost.inclusive_us))}</text>'
        )
    return f'<div class="chart"><svg viewBox="0 0 {width} {height}" role="img">{"".join(rows)}</svg></div>'


def domain_summary(source_costs: dict[str, SourceCost], tokens: Counter[str], root: str) -> list[dict[str, object]]:
    domains: dict[str, dict[str, object]] = {}
    for path, cost in source_costs.items():
        term, label, description = bb_term_for_path(path, root)
        entry = domains.setdefault(
            term,
            {
                "term": term,
                "label": label,
                "description": description,
                "inclusive_us": 0.0,
                "self_us": 0.0,
                "source_events": 0,
                "files": set(),
                "tus": set(),
                "bytes": 0,
                "tokens": 0,
            },
        )
        entry["inclusive_us"] = float(entry["inclusive_us"]) + cost.inclusive_us
        entry["self_us"] = float(entry["self_us"]) + cost.self_us
        entry["source_events"] = int(entry["source_events"]) + cost.count
        entry["bytes"] = int(entry["bytes"]) + cost.bytes
        entry["tokens"] = int(entry["tokens"]) + int(tokens.get(path, 0))
        entry["files"].add(path)  # type: ignore[union-attr]
        entry["tus"].update(cost.tus)  # type: ignore[union-attr]
    result = []
    for entry in domains.values():
        entry = dict(entry)
        entry["file_count"] = len(entry.pop("files"))
        entry["tu_count"] = len(entry.pop("tus"))
        result.append(entry)
    result.sort(key=lambda item: float(item["inclusive_us"]), reverse=True)
    return result


def recommendation_rows(source_costs: dict[str, SourceCost], tokens: Counter[str], edges: dict[tuple[str, str], EdgeCost], root: str, top: int) -> list[list[object]]:
    candidates: list[tuple[float, list[object]]] = []
    for path, cost in source_costs.items():
        if not is_under(path, root):
            continue
        term, label, _description = bb_term_for_path(path, root)
        token_count = int(tokens.get(path, 0))
        transitive_us = max(cost.inclusive_us - cost.self_us, 0.0)
        if cost.self_us >= 1_000_000:
            score = cost.self_us + token_count * 40.0
            candidates.append(
                (
                    score,
                    [
                        "Split/out-of-line",
                        label,
                        fmt_seconds(cost.self_us),
                        fmt_seconds(cost.inclusive_us),
                        fmt_count(token_count),
                        f"{percent(cost.self_us, cost.inclusive_us):.0f}%",
                        display_path(path, root),
                    ],
                )
            )
        if transitive_us >= 3_000_000 and percent(cost.self_us, cost.inclusive_us) <= 25.0:
            score = transitive_us + token_count * 20.0
            candidates.append(
                (
                    score,
                    [
                        "Prune include route",
                        label,
                        fmt_seconds(cost.self_us),
                        fmt_seconds(cost.inclusive_us),
                        fmt_count(token_count),
                        f"{percent(cost.self_us, cost.inclusive_us):.0f}%",
                        display_path(path, root),
                    ],
                )
            )
    for (parent, child), cost in edges.items():
        if cost.inclusive_us < 2_000_000:
            continue
        if not (is_under(parent, root) or is_under(child, root)):
            continue
        term, label, _description = bb_term_for_path(child, root)
        candidates.append(
            (
                cost.inclusive_us,
                [
                    "Cut include edge",
                    label,
                    fmt_seconds(cost.self_us),
                    fmt_seconds(cost.inclusive_us),
                    "",
                    "",
                    f"{display_path(parent, root)} -> {display_path(child, root)}",
                ],
            )
        )
    seen = set()
    rows = []
    for _score, row in sorted(candidates, key=lambda item: item[0], reverse=True):
        key = (row[0], row[-1])
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
        if len(rows) >= top:
            break
    return rows


def write_data_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def records_for_html(
    root: str,
    traces: list[TuTrace],
    source_costs: dict[str, SourceCost],
    pch_artifacts: list[PchArtifact],
    scans: list[IncludeScan],
    token_scans: list[TokenScan],
    frontend_stats_scans: list[FrontendStatsScan],
) -> dict[str, object]:
    edge_costs = aggregate_edges(scans)
    token_counts = aggregate_tokens(token_scans)
    frontend_stats = aggregate_frontend_stats(frontend_stats_scans)
    template_costs = aggregate_events(traces, "template_costs")
    function_costs = aggregate_events(traces, "function_costs")
    constexpr_costs = aggregate_events(traces, "constexpr_costs")
    event_totals = aggregate_events(traces, "event_totals")
    domains = domain_summary(source_costs, token_counts, root)
    project_headers = [
        {
            "path": display_path(path, root),
            "term": bb_term_for_path(path, root)[1],
            "inclusive_us": cost.inclusive_us,
            "self_us": cost.self_us,
            "transitive_us": max(cost.inclusive_us - cost.self_us, 0.0),
            "self_pct": percent(cost.self_us, cost.inclusive_us),
            "source_events": cost.count,
            "tu_count": len(cost.tus),
            "bytes": cost.bytes,
            "tokens": int(token_counts.get(path, 0)),
        }
        for path, cost in source_costs.items()
        if is_under(path, root)
    ]
    project_headers.sort(key=lambda item: float(item["inclusive_us"]), reverse=True)
    edge_records = [
        {
            "parent": display_path(parent, root),
            "child": display_path(child, root),
            "term": bb_term_for_path(child, root)[1],
            "inclusive_us": cost.inclusive_us,
            "self_us": cost.self_us,
            "parse_count": cost.parse_count,
            "include_count": cost.include_count,
            "tu_count": len(cost.tus),
        }
        for (parent, child), cost in edge_costs.items()
        if is_under(parent, root) or is_under(child, root)
    ]
    edge_records.sort(key=lambda item: float(item["inclusive_us"]), reverse=True)
    return {
        "traces": traces,
        "source_costs": source_costs,
        "pch_artifacts": pch_artifacts,
        "edges": edge_costs,
        "tokens": token_counts,
        "frontend_stats": frontend_stats,
        "templates": template_costs,
        "functions": function_costs,
        "constexpr": constexpr_costs,
        "event_totals": event_totals,
        "domains": domains,
        "project_headers": project_headers,
        "edge_records": edge_records,
    }


def render_html_reports(
    html_dir: Path,
    build_dir: Path,
    root: str,
    traces: list[TuTrace],
    source_costs: dict[str, SourceCost],
    ninja_entries: dict[str, NinjaLogEntry],
    pch_artifacts: list[PchArtifact],
    since: float | None,
    scans: list[IncludeScan],
    token_scans: list[TokenScan],
    frontend_stats_scans: list[FrontendStatsScan],
    top: int,
) -> None:
    html_dir.mkdir(parents=True, exist_ok=True)
    data = records_for_html(root, traces, source_costs, pch_artifacts, scans, token_scans, frontend_stats_scans)
    edge_costs: dict[tuple[str, str], EdgeCost] = data["edges"]  # type: ignore[assignment]
    token_counts: Counter[str] = data["tokens"]  # type: ignore[assignment]
    frontend_stats: dict[str, float] = data["frontend_stats"]  # type: ignore[assignment]
    domains: list[dict[str, object]] = data["domains"]  # type: ignore[assignment]
    project_headers: list[dict[str, object]] = data["project_headers"]  # type: ignore[assignment]
    edge_records: list[dict[str, object]] = data["edge_records"]  # type: ignore[assignment]
    template_costs: dict[str, EventCost] = data["templates"]  # type: ignore[assignment]
    function_costs: dict[str, EventCost] = data["functions"]  # type: ignore[assignment]
    constexpr_costs: dict[str, EventCost] = data["constexpr"]  # type: ignore[assignment]
    event_totals: dict[str, EventCost] = data["event_totals"]  # type: ignore[assignment]

    pages = [
        ("index.html", "Overview"),
        ("translation-units.html", "Translation Units"),
        ("headers.html", "Headers"),
        ("include-routes.html", "Include Routes"),
        ("bb-breakdown.html", "BB Terms"),
        ("templates.html", "Templates/Constexpr"),
        ("raw-data.html", "Raw Data"),
    ]

    total_execute = sum(trace.execute_us for trace in traces)
    total_frontend = sum(trace.frontend_us for trace in traces)
    total_backend = sum(trace.backend_us for trace in traces)
    total_optimizer = sum(trace.optimizer_us for trace in traces)
    total_codegen = sum(trace.codegen_us for trace in traces)
    recommendation_table = html_table(
        ["action", "BB term", "self", "inclusive", "tokens", "self %", "target"],
        recommendation_rows(source_costs, token_counts, edge_costs, root, 30),
    )

    domain_items = [
        (str(item["label"]), float(item["inclusive_us"]), f'{item["label"]}: {fmt_seconds(float(item["inclusive_us"]))}')
        for item in domains[:12]
    ]
    hot_header_items = [
        (str(item["path"]), float(item["inclusive_us"]), f'{item["path"]}: {fmt_seconds(float(item["inclusive_us"]))}')
        for item in project_headers[:18]
    ]
    tu_points = [
        (
            seconds(trace.frontend_us),
            seconds(trace.backend_us),
            display_path(trace.source, root),
            "#226f54" if trace.frontend_us >= trace.backend_us else "#7c3aed",
        )
        for trace in traces[:80]
    ]
    header_points = [
        (
            float(item["tokens"]),
            seconds(float(item["self_us"])),
            str(item["path"]),
            "#b45309" if float(item["self_pct"]) >= 50.0 else "#226f54",
        )
        for item in project_headers
        if int(item["tokens"]) > 0
    ][:120]

    index_body = "\n".join(
        [
            '<section class="grid">',
            metric("Trace files", fmt_count(len(traces)), "Clang -ftime-trace JSON files consumed"),
            metric("Frontend work", fmt_seconds(total_frontend), f"{percent(total_frontend, total_execute):.0f}% of execute trace"),
            metric("Backend work", fmt_seconds(total_backend), f"optimizer {fmt_seconds(total_optimizer)}, codegen {fmt_seconds(total_codegen)}"),
            metric("Scanned artifacts", f"{len(scans)} include / {len(token_scans)} token", f"{len(frontend_stats_scans)} frontend stats scans"),
            "</section>",
            "<h2>Domain Treemap</h2>",
            svg_treemap(domain_items),
            "<h2>Hottest Translation Units</h2>",
            svg_stacked_tu_chart(traces, root, min(top, 24)),
            "<h2>Most Useful Next Cuts</h2>",
            '<div class="scroll">',
            recommendation_table,
            "</div>",
            "<h2>Hot Headers</h2>",
            svg_bar_chart(hot_header_items, color="#b45309"),
        ]
    )
    (html_dir / "index.html").write_text(html_shell("Compile Work Overview", "index.html", pages, index_body), encoding="utf-8")

    tu_rows = [
        [
            display_path(trace.source, root),
            fmt_seconds(trace.frontend_us),
            fmt_seconds(trace.backend_us),
            fmt_seconds(trace.execute_us),
            len(trace.source_costs),
            display_path(trace.output, root),
        ]
        for trace in traces[:200]
    ]
    tu_body = "\n".join(
        [
            "<h2>Frontend vs Backend Work</h2>",
            svg_stacked_tu_chart(traces, root, 35),
            '<div class="two-col"><div class="panel"><h3>Frontend/backend scatter</h3>',
            svg_scatter(tu_points, "frontend seconds", "backend seconds"),
            '</div><div class="panel"><h3>Interpretation</h3><p>Points above the diagonal are backend/codegen dominated. Points far right are parser/template dominated. Use this to avoid fixing header routes when the real bottleneck is backend IR.</p></div></div>',
            "<h2>Top Translation Units</h2>",
            '<div class="scroll">',
            html_table(["source", "frontend", "backend", "execute", "header events", "object"], tu_rows),
            "</div>",
        ]
    )
    (html_dir / "translation-units.html").write_text(html_shell("Translation Unit Work", "translation-units.html", pages, tu_body), encoding="utf-8")

    header_rows = [
        [
            item["path"],
            item["term"],
            fmt_seconds(float(item["inclusive_us"])),
            fmt_seconds(float(item["self_us"])),
            fmt_seconds(float(item["transitive_us"])),
            f'{float(item["self_pct"]):.0f}%',
            fmt_count(int(item["tokens"])),
            fmt_count(int(item["source_events"])),
            fmt_count(int(item["tu_count"])),
            f'{int(item["bytes"]) / 1024.0:.1f}',
        ]
        for item in project_headers[:250]
    ]
    self_items = [
        (str(item["path"]), float(item["self_us"]), f'{item["path"]}: {fmt_seconds(float(item["self_us"]))}')
        for item in sorted(project_headers, key=lambda item: float(item["self_us"]), reverse=True)[:24]
    ]
    transitive_items = [
        (str(item["path"]), float(item["transitive_us"]), f'{item["path"]}: {fmt_seconds(float(item["transitive_us"]))}')
        for item in sorted(project_headers, key=lambda item: float(item["transitive_us"]), reverse=True)[:24]
    ]
    token_items = [
        (str(item["path"]), float(item["tokens"]), f'{item["path"]}: {fmt_count(int(item["tokens"]))} tokens')
        for item in sorted(project_headers, key=lambda item: int(item["tokens"]), reverse=True)
        if int(item["tokens"]) > 0
    ][:24]
    headers_body = "\n".join(
        [
            '<div class="two-col"><div class="panel"><h2>Self-heavy headers</h2>',
            svg_bar_chart(self_items, color="#b42318"),
            '</div><div class="panel"><h2>Route-heavy headers</h2>',
            svg_bar_chart(transitive_items, color="#226f54"),
            "</div></div>",
            '<div class="two-col"><div class="panel"><h2>Token-heavy scanned sources</h2>',
            svg_bar_chart(token_items, color="#7c3aed"),
            '</div><div class="panel"><h2>Tokens vs self work</h2>',
            svg_scatter(header_points, "tokens in scanned TUs", "self seconds"),
            "</div></div>",
            "<h2>Header Ledger</h2>",
            '<div class="scroll">',
            html_table(["header", "BB term", "inclusive", "self", "transitive", "self %", "tokens", "events", "TUs", "KiB"], header_rows),
            "</div>",
        ]
    )
    (html_dir / "headers.html").write_text(html_shell("Header Work", "headers.html", pages, headers_body), encoding="utf-8")

    edge_rows_html = [
        [
            item["parent"],
            item["child"],
            item["term"],
            fmt_seconds(float(item["inclusive_us"])),
            fmt_seconds(float(item["self_us"])),
            fmt_count(int(item["parse_count"])),
            fmt_count(int(item["include_count"])),
            fmt_count(int(item["tu_count"])),
        ]
        for item in edge_records[:220]
    ]
    repeated_rows = []
    for scan in scans:
        for path, count in scan.repeated_includes.most_common(20):
            if is_under(path, root):
                repeated_rows.append([display_path(scan.tu.source, root), display_path(path, root), count])
    include_body = "\n".join(
        [
            "<h2>Charged Include Edge Graph</h2>",
            svg_edge_graph(edge_costs, root, 28),
            "<h2>Expensive Include Edges</h2>",
            '<div class="scroll">',
            html_table(["including file", "included file", "BB term", "charged inclusive", "self", "parsed", "included", "TUs"], edge_rows_html),
            "</div>",
            "<h2>Repeated Includes Observed During Scans</h2>",
            '<div class="scroll">',
            html_table(["TU", "header", "repeat count"], repeated_rows[:120]),
            "</div>",
            "<h2>Scan Artifacts</h2>",
            html_table(["TU", "include tree stderr"], [[display_path(scan.tu.source, root), scan.stderr_path] for scan in scans]),
        ]
    )
    (html_dir / "include-routes.html").write_text(html_shell("Include Routes", "include-routes.html", pages, include_body), encoding="utf-8")

    domain_rows = [
        [
            item["label"],
            fmt_seconds(float(item["inclusive_us"])),
            fmt_seconds(float(item["self_us"])),
            f'{percent(float(item["self_us"]), float(item["inclusive_us"])):.0f}%',
            fmt_count(int(item["tokens"])),
            fmt_count(int(item["file_count"])),
            fmt_count(int(item["tu_count"])),
            item["description"],
        ]
        for item in domains
    ]
    domain_points = [
        (
            seconds(float(item["inclusive_us"])),
            seconds(float(item["self_us"])),
            str(item["label"]),
            "#b42318" if percent(float(item["self_us"]), float(item["inclusive_us"])) >= 50.0 else "#226f54",
        )
        for item in domains
    ]
    glossary_rows = [[label, description] for _term, label, _needles, description in BB_TERM_RULES]
    bb_body = "\n".join(
        [
            '<div class="two-col"><div class="panel"><h2>BB term inclusive work</h2>',
            svg_bar_chart(domain_items, color="#226f54"),
            '</div><div class="panel"><h2>Inclusive vs self by term</h2>',
            svg_scatter(domain_points, "inclusive seconds", "self seconds"),
            "</div></div>",
            "<h2>BB-Term Ledger</h2>",
            '<div class="scroll">',
            html_table(["BB term", "inclusive", "self", "self %", "tokens", "files", "TUs", "meaning"], domain_rows),
            "</div>",
            "<h2>Actionable Candidates</h2>",
            '<div class="scroll">',
            recommendation_table,
            "</div>",
            "<h2>Local Glossary</h2>",
            html_table(["term", "what it groups"], glossary_rows),
        ]
    )
    (html_dir / "bb-breakdown.html").write_text(html_shell("BB-Term Breakdown", "bb-breakdown.html", pages, bb_body), encoding="utf-8")

    template_rows = [[trim(name, 160), fmt_seconds(cost.total_us), fmt_count(cost.count)] for name, cost in sorted(template_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:220]]
    function_rows = [[trim(name, 160), fmt_seconds(cost.total_us), fmt_count(cost.count)] for name, cost in sorted(function_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:220]]
    constexpr_rows = [[trim(name, 160), fmt_seconds(cost.total_us), fmt_count(cost.count)] for name, cost in sorted(constexpr_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:220]]
    pass_rows = [[trim(name, 160), fmt_seconds(cost.total_us), fmt_count(cost.count)] for name, cost in sorted(event_totals.items(), key=lambda item: item[1].total_us, reverse=True)[:220]]
    template_items = [(trim(name, 80), cost.total_us, name) for name, cost in sorted(template_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:22]]
    constexpr_items = [(trim(name, 80), cost.total_us, name) for name, cost in sorted(constexpr_costs.items(), key=lambda item: item[1].total_us, reverse=True)[:22]]
    templates_body = "\n".join(
        [
            '<div class="two-col"><div class="panel"><h2>Template instantiation hot spots</h2>',
            svg_bar_chart(template_items, color="#7c3aed"),
            '</div><div class="panel"><h2>Constexpr evaluation hot spots</h2>',
            svg_bar_chart(constexpr_items, color="#b45309"),
            "</div></div>",
            "<h2>Template Instantiations</h2>",
            '<div class="scroll">',
            html_table(["template", "time", "count"], template_rows),
            "</div>",
            "<h2>Compile/Optimize Functions</h2>",
            '<div class="scroll">',
            html_table(["function", "time", "count"], function_rows),
            "</div>",
            "<h2>Constant Evaluation</h2>",
            '<div class="scroll">',
            html_table(["event", "time", "count"], constexpr_rows),
            "</div>",
            "<h2>Clang Total Event/Pass Counters</h2>",
            '<div class="scroll">',
            html_table(["event/pass", "time", "count"], pass_rows),
            "</div>",
        ]
    )
    (html_dir / "templates.html").write_text(html_shell("Templates And Constexpr", "templates.html", pages, templates_body), encoding="utf-8")

    raw_payload = json_summary(
        root, traces, source_costs, ninja_entries, pch_artifacts, since, scans, token_scans, frontend_stats_scans, max(top, 100)
    )
    raw_payload["bb_domains"] = domains
    generated_files = [["index.html", "Single-page app"], ["data.json", "Machine-readable summary"]]
    generated_files.extend([[filename, title] for filename, title in pages if filename != "index.html"])
    raw_payload["generated_files"] = [filename for filename, _title in generated_files]
    write_data_json(html_dir / "data.json", raw_payload)
    raw_body = "\n".join(
        [
            "<h2>Generated Files</h2>",
            html_table(["file", "description"], generated_files),
            "<h2>Frontend Stats</h2>",
            html_table(["counter", "value"], [[key, fmt_count(value)] for key, value in sorted(frontend_stats.items())]),
            "<h2>Artifact Paths</h2>",
            html_table(
                ["kind", "TU", "path"],
                [[
                    "include",
                    display_path(scan.tu.source, root),
                    scan.stderr_path,
                ] for scan in scans]
                + [["tokens", display_path(scan.tu.source, root), scan.stdout_path] for scan in token_scans]
                + [["frontend stats", display_path(scan.tu.source, root), scan.stats_path] for scan in frontend_stats_scans],
            ),
            "<h2>Embedded Summary</h2>",
            f'<pre>{h(json.dumps(raw_payload, indent=2, sort_keys=True)[:250000])}</pre>',
        ]
    )
    (html_dir / "raw-data.html").write_text(html_shell("Raw Data", "raw-data.html", pages, raw_body), encoding="utf-8")
    spa_sections = [
        ("overview", "Overview", index_body),
        ("translation-units", "Translation Units", tu_body),
        ("headers", "Headers", headers_body),
        ("include-routes", "Include Routes", include_body),
        ("bb-terms", "BB Terms", bb_body),
        ("templates", "Templates/Constexpr", templates_body),
        ("raw-data", "Raw Data", raw_body),
    ]
    (html_dir / "index.html").write_text(html_spa_shell("Compile Trace Explorer", spa_sections), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze Clang -ftime-trace output and include routes.")
    parser.add_argument("build_dir", type=Path, help="CMake/Ninja build dir containing *.cpp.json traces")
    parser.add_argument("--source-root", type=Path, default=Path.cwd(), help="Project root for relative paths")
    parser.add_argument("--top", type=int, default=25, help="Rows per report section")
    parser.add_argument(
        "--since",
        help="Only include traces and Ninja log outputs newer than this marker file or Unix timestamp",
    )
    parser.add_argument(
        "--require-ninja-entry",
        action="store_true",
        help="Drop trace files whose object output is not present in the in-scope Ninja log entries",
    )
    parser.add_argument("--scan-includes", type=int, default=0, help="Run clang -H syntax-only for the N hottest TUs")
    parser.add_argument("--scan-tokens", type=int, default=0, help="Run clang token dumps for the N hottest TUs")
    parser.add_argument("--scan-frontend-stats", type=int, default=0, help="Run clang frontend stats for the N hottest TUs")
    parser.add_argument("--include-scan-dir", type=Path, default=Path("/tmp/compile-trace-include-scans"))
    parser.add_argument("--token-scan-dir", type=Path, default=Path("/tmp/compile-trace-token-scans"))
    parser.add_argument("--frontend-stats-dir", type=Path, default=Path("/tmp/compile-trace-frontend-stats"))
    parser.add_argument("--focus", action="append", default=[], help="Header path to show include routes for")
    parser.add_argument("--include-external", action="store_true", help="Also print external headers in the hot-header section")
    parser.add_argument("--output", type=Path, help="Write markdown report to this file")
    parser.add_argument("--json", dest="json_output", type=Path, help="Write machine-readable summary to this file")
    parser.add_argument("--html-dir", type=Path, help="Write a multi-page static HTML report to this directory")
    args = parser.parse_args()

    build_dir = args.build_dir.resolve()
    root = real(args.source_root.resolve())
    if not build_dir.exists():
        print(f"error: build dir does not exist: {build_dir}", file=sys.stderr)
        return 2

    since = parse_since(args.since)
    ninja_entries = load_ninja_log(build_dir, since)
    pch_artifacts = find_pch_artifacts(build_dir, root, since)
    compdb_by_output, compdb_by_file = load_compdb(build_dir)
    traces: list[TuTrace] = []
    for trace_file in find_trace_files(build_dir, since):
        trace = load_trace(trace_file, build_dir, compdb_by_output, compdb_by_file)
        if trace:
            trace.ninja_entry = ninja_entries.get(trace.output)
            if args.require_ninja_entry and not trace.ninja_entry:
                continue
            traces.append(trace)
    if not traces:
        print(f"error: found no Clang -ftime-trace JSON files under {build_dir}", file=sys.stderr)
        return 1

    traces.sort(key=lambda item: item.frontend_us, reverse=True)
    scans: list[IncludeScan] = []
    for trace in traces[: max(args.scan_includes, 0)]:
        print(f"include-scan: {display_path(trace.source, root)}", file=sys.stderr)
        scan = run_include_scan(trace, args.include_scan_dir)
        if scan:
            scans.append(scan)

    token_scans: list[TokenScan] = []
    for trace in traces[: max(args.scan_tokens, 0)]:
        print(f"token-scan: {display_path(trace.source, root)}", file=sys.stderr)
        scan = run_token_scan(trace, args.token_scan_dir)
        if scan:
            token_scans.append(scan)

    frontend_stats_scans: list[FrontendStatsScan] = []
    for trace in traces[: max(args.scan_frontend_stats, 0)]:
        print(f"frontend-stats-scan: {display_path(trace.source, root)}", file=sys.stderr)
        scan = run_frontend_stats_scan(trace, args.frontend_stats_dir)
        if scan:
            frontend_stats_scans.append(scan)

    source_costs = aggregate_sources(traces)
    focus_paths = [real(Path(path) if Path(path).is_absolute() else Path(root) / path) for path in args.focus]
    report = render_report(
        build_dir=build_dir,
        root=root,
        traces=traces,
        source_costs=source_costs,
        ninja_entries=ninja_entries,
        pch_artifacts=pch_artifacts,
        since=since,
        scans=scans,
        token_scans=token_scans,
        frontend_stats_scans=frontend_stats_scans,
        focus=focus_paths,
        top=args.top,
        project_only=not args.include_external,
    )

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8")
    else:
        print(report)

    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(
            json.dumps(
                json_summary(
                    root,
                    traces,
                    source_costs,
                    ninja_entries,
                    pch_artifacts,
                    since,
                    scans,
                    token_scans,
                    frontend_stats_scans,
                    args.top,
                ),
                indent=2,
            ),
            encoding="utf-8",
        )

    if args.html_dir:
        render_html_reports(
            html_dir=args.html_dir,
            build_dir=build_dir,
            root=root,
            traces=traces,
            source_costs=source_costs,
            ninja_entries=ninja_entries,
            pch_artifacts=pch_artifacts,
            since=since,
            scans=scans,
            token_scans=token_scans,
            frontend_stats_scans=frontend_stats_scans,
            top=args.top,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
