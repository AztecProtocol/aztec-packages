#!/usr/bin/env python3
"""
spec-manager.py — Manage Claude Code instances for writing Aztec protocol specs.

Commands:
  status                Show all specs and their status
  start <nums...>       Launch Claude instance(s) for spec number(s)
  stop <nums...>        Stop running instance(s)  (use --all to stop all)
  restart <nums...>     Restart instance(s)
  logs <num>            View logs for a spec (less +G)
  dashboard             Interactive TUI dashboard
  prompt <num>          Print the prompt that would be sent to Claude
  update <num> <status> Manually set spec status
  clean                 Remove finished instances from tracking
"""

import argparse
import curses
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import textwrap
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

# ─── Configuration ───────────────────────────────────────────────────
# Edit these to match your setup.

PROJECT_ROOT = Path(__file__).resolve().parent
PLAN_FILE = PROJECT_ROOT / "protocol-spec-plan.local.md"
STATE_DIR = PROJECT_ROOT / ".spec-manager"
STATE_FILE = STATE_DIR / "state.json"
LOGS_DIR = STATE_DIR / "logs"
SPECS_DIR = PROJECT_ROOT / "specs"
OLD_SPECS_DIR = PROJECT_ROOT / "old-protocol-specs"

CLAUDE_CMD = "claude"
MAX_CONCURRENT = 4  # max parallel claude instances

# Flags appended to every `claude -p` invocation.
# Customize as needed — add --dangerously-skip-permissions for full autonomy.
CLAUDE_EXTRA_FLAGS: list[str] = [
    "--output-format", "stream-json",
    "--model", "opus",
    "--verbose",
    "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash,Task",
]


# ─── Data Classes ────────────────────────────────────────────────────

@dataclass
class Spec:
    number: int
    title: str
    file: str
    status: str
    assignee: str
    sources: str
    priority: str  # P0, P1, P2, P3
    description: str = ""


@dataclass
class Source:
    number: int
    file: str           # relative path (e.g. old-protocol-specs/intro.md)
    target_spec: int    # new spec number this maps to
    target_title: str   # new spec title
    status: str         # Not Integrated, In Progress, Integrated, Skipped
    notes: str = ""


@dataclass
class Instance:
    spec_num: int
    pid: int
    started_at: str
    log_file: str
    status: str = "running"  # running | finished | stopped | failed


# ─── Plan Parser ─────────────────────────────────────────────────────

def parse_plan(plan_path: Path) -> list[Spec]:
    """Parse the markdown plan file and extract all specs from inventory tables."""
    text = plan_path.read_text()
    specs: list[Spec] = []

    # Match priority sections (P0, P1, P2, P3) and grab everything until the next section.
    priority_pattern = r"### (P\d)\s*—\s*.*?\n(.*?)(?=### P\d|## \d|$)"
    for m in re.finditer(priority_pattern, text, re.DOTALL):
        priority = m.group(1)
        section = m.group(2)

        rows = re.findall(
            r"^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|",
            section,
            re.MULTILINE,
        )
        for row in rows:
            num_str = row[0].strip()
            if num_str in ("#", "") or num_str.startswith("---"):
                continue
            try:
                num = int(num_str)
            except ValueError:
                continue

            specs.append(
                Spec(
                    number=num,
                    title=row[1].strip(),
                    file=row[2].strip().strip("`"),
                    status=row[3].strip(),
                    assignee=row[4].strip(),
                    sources=row[5].strip(),
                    priority=priority,
                )
            )

    # Parse long-form descriptions from "## 5. Spec Descriptions"
    desc_pattern = r"### (\d+)\.\s+.*?\n\n(.*?)(?=\n### \d+\.|$)"
    for m in re.finditer(desc_pattern, text, re.DOTALL):
        num = int(m.group(1))
        desc = m.group(2).strip()
        for spec in specs:
            if spec.number == num:
                spec.description = desc
                break

    return specs


def _extract_section(plan_path: Path, header_re: str) -> str:
    """Extract a section body from the plan file by header regex."""
    text = plan_path.read_text()
    m = re.search(header_re + r"\n(.*?)(?=\n---|\n## \d)", text, re.DOTALL)
    return m.group(1).strip() if m else ""


def parse_formatting_guidelines(plan_path: Path) -> str:
    return _extract_section(plan_path, r"## 3\. Formatting Guidelines")


def parse_sources(plan_path: Path) -> list[Source]:
    """Parse source integration tracking from plan file (section 6)."""
    text = plan_path.read_text()
    sources: list[Source] = []

    # Match "### Sources → Spec #N: Title" sections
    section_pattern = (
        r"### Sources → Spec #(\d+): (.+?)\n(.*?)(?=### Sources →|## \d|$)"
    )
    for m in re.finditer(section_pattern, text, re.DOTALL):
        target_spec = int(m.group(1))
        target_title = m.group(2).strip()
        section = m.group(3)

        rows = re.findall(
            r"^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|",
            section,
            re.MULTILINE,
        )
        for row in rows:
            num_str = row[0].strip()
            if num_str in ("S#", "") or num_str.startswith("---"):
                continue
            try:
                num = int(num_str)
            except ValueError:
                continue

            sources.append(
                Source(
                    number=num,
                    file=row[1].strip().strip("`"),
                    target_spec=target_spec,
                    target_title=target_title,
                    status=row[2].strip(),
                    notes=row[3].strip(),
                )
            )

    return sources


def parse_scope(plan_path: Path) -> str:
    return _extract_section(plan_path, r"## 2\. Scope Definition")


# ─── State Manager ───────────────────────────────────────────────────

class StateManager:
    """Tracks running / finished Claude instances.  Persists to JSON."""

    def __init__(self):
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        self.instances: dict[int, Instance] = {}
        self.source_instances: dict[int, Instance] = {}
        self._load()
        self._reap()

    # -- persistence --

    def _load(self):
        if STATE_FILE.exists():
            data = json.loads(STATE_FILE.read_text())
            for k, v in data.get("instances", {}).items():
                self.instances[int(k)] = Instance(**v)
            for k, v in data.get("source_instances", {}).items():
                self.source_instances[int(k)] = Instance(**v)

    def save(self):
        data = {
            "instances": {str(k): asdict(v) for k, v in self.instances.items()},
            "source_instances": {
                str(k): asdict(v) for k, v in self.source_instances.items()
            },
        }
        STATE_FILE.write_text(json.dumps(data, indent=2) + "\n")

    # -- process bookkeeping --

    def _is_alive(self, pid: int) -> bool:
        # Try to reap zombie children from this process.
        try:
            result, _ = os.waitpid(pid, os.WNOHANG)
            if result != 0:
                return False  # child was reaped
        except ChildProcessError:
            pass  # not our child, fall through

        try:
            os.kill(pid, 0)
        except (ProcessLookupError, PermissionError):
            return False

        # Process exists in table but may be a zombie (not our child).
        try:
            with open(f"/proc/{pid}/status") as f:
                for line in f:
                    if line.startswith("State:"):
                        return "Z" not in line
        except (FileNotFoundError, IOError):
            return False

        return True

    def _reap(self):
        """Mark dead processes as finished and update plan status."""
        changed = False
        newly_finished_specs: list[int] = []
        newly_finished_sources: list[int] = []

        for inst in self.instances.values():
            if inst.status == "running" and not self._is_alive(inst.pid):
                inst.status = "finished"
                changed = True
                newly_finished_specs.append(inst.spec_num)

        for inst in self.source_instances.values():
            if inst.status == "running" and not self._is_alive(inst.pid):
                inst.status = "finished"
                changed = True
                newly_finished_sources.append(inst.spec_num)

        if changed:
            self.save()
            # Update plan file for each newly finished spec.
            specs = parse_plan(PLAN_FILE)
            spec_map = {s.number: s for s in specs}
            for num in newly_finished_specs:
                spec = spec_map.get(num)
                if spec and (PROJECT_ROOT / spec.file).exists():
                    update_plan_status(PLAN_FILE, num, "In Review", "Claude")
            # Update plan file for each newly finished source integration.
            for num in newly_finished_sources:
                update_source_status(PLAN_FILE, num, "Integrated")

    # -- queries --

    def running_count(self) -> int:
        self._reap()
        return sum(
            1
            for i in list(self.instances.values()) + list(self.source_instances.values())
            if i.status == "running"
        )

    def get(self, spec_num: int) -> Optional[Instance]:
        return self.instances.get(spec_num)

    def get_source(self, source_num: int) -> Optional[Instance]:
        return self.source_instances.get(source_num)

    # -- mutations --

    def register(self, spec_num: int, pid: int, log_file: str):
        self.instances[spec_num] = Instance(
            spec_num=spec_num,
            pid=pid,
            started_at=datetime.now().isoformat(),
            log_file=log_file,
        )
        self.save()

    def remove(self, spec_num: int):
        self.instances.pop(spec_num, None)
        self.save()

    def stop(self, spec_num: int) -> bool:
        inst = self.instances.get(spec_num)
        if not inst or inst.status != "running":
            return False
        try:
            os.killpg(os.getpgid(inst.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        time.sleep(0.3)
        if self._is_alive(inst.pid):
            try:
                os.killpg(os.getpgid(inst.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
        inst.status = "stopped"
        self.save()
        return True

    # -- source mutations --

    def register_source(self, source_num: int, pid: int, log_file: str):
        self.source_instances[source_num] = Instance(
            spec_num=source_num,
            pid=pid,
            started_at=datetime.now().isoformat(),
            log_file=log_file,
        )
        self.save()

    def stop_source(self, source_num: int) -> bool:
        inst = self.source_instances.get(source_num)
        if not inst or inst.status != "running":
            return False
        try:
            os.killpg(os.getpgid(inst.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass
        time.sleep(0.3)
        if self._is_alive(inst.pid):
            try:
                os.killpg(os.getpgid(inst.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
        inst.status = "stopped"
        self.save()
        return True

    def clean(self) -> int:
        removed = 0
        for num in list(self.instances):
            if self.instances[num].status in ("finished", "stopped", "failed"):
                del self.instances[num]
                removed += 1
        for num in list(self.source_instances):
            if self.source_instances[num].status in ("finished", "stopped", "failed"):
                del self.source_instances[num]
                removed += 1
        if removed:
            self.save()
        return removed


# ─── Log Parser (stream-json) ───────────────────────────────────────

def get_instance_activity(log_file: str) -> dict:
    """Read the tail of a stream-json log to extract current activity."""
    info: dict = {"activity": "", "turns": 0, "cost": 0.0, "done": False}
    try:
        with open(log_file, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 8192))
            tail = f.read().decode("utf-8", errors="replace")
    except (FileNotFoundError, IOError):
        return info

    lines = tail.strip().splitlines()
    # Walk backwards looking for the most recent meaningful event.
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Final result event
        if ev.get("type") == "result":
            info["done"] = True
            info["cost"] = ev.get("cost_usd", 0)
            info["turns"] = ev.get("num_turns", 0)
            return info

        # Assistant message with tool_use
        if ev.get("type") == "assistant":
            content = ev.get("message", {}).get("content", [])
            for block in reversed(content):
                if block.get("type") == "tool_use":
                    name = block.get("name", "")
                    inp = block.get("input", {})
                    if name in ("Read", "Write", "Edit"):
                        fp = inp.get("file_path", "")
                        info["activity"] = f"{name} {Path(fp).name}" if fp else name
                    elif name == "Grep":
                        pat = inp.get("pattern", "")
                        info["activity"] = f"Grep '{pat[:20]}'"
                    elif name == "Glob":
                        info["activity"] = f"Glob {inp.get('pattern', '')}"
                    elif name == "Bash":
                        cmd = inp.get("command", "")
                        info["activity"] = f"$ {cmd[:30]}"
                    elif name == "Task":
                        info["activity"] = f"Task: {inp.get('description', '')[:25]}"
                    else:
                        info["activity"] = name
                    return info

            # Plain text (thinking / talking)
            for block in reversed(content):
                if block.get("type") == "text":
                    text = block["text"].strip()
                    if text:
                        info["activity"] = text[:40] + ("..." if len(text) > 40 else "")
                        return info

    return info


# ─── Prompt Builder ──────────────────────────────────────────────────

def _existing_specs_context(exclude_num: int) -> str:
    """Build a context block listing specs already written in specs/."""
    if not SPECS_DIR.exists():
        return ""
    all_specs = parse_plan(PLAN_FILE)
    spec_by_file = {s.file: s for s in all_specs}
    lines = []
    for path in sorted(SPECS_DIR.glob("*.md")):
        rel = f"specs/{path.name}"
        s = spec_by_file.get(rel)
        if s and s.number != exclude_num:
            kb = path.stat().st_size / 1024
            lines.append(f"- `{rel}` — #{s.number} {s.title} ({kb:.0f}KB)")
    if not lines:
        return ""
    return (
        "## Existing Specs\n\n"
        "The following specs have already been written. Read them to ensure "
        "consistency — use the same terminology, reference them where relevant, "
        "and avoid duplicating content they already cover.\n\n"
        + "\n".join(lines)
    )


def build_prompt(spec: Spec) -> str:
    """Build the full prompt sent to a Claude instance."""
    formatting = parse_formatting_guidelines(PLAN_FILE)
    sources = spec.sources.replace("`", "")
    existing = _existing_specs_context(spec.number)

    existing_section = f"\n\n{existing}" if existing else ""

    return f"""\
You are writing a formal protocol specification for the Aztec Network, \
a privacy-preserving stage-2 rollup on Ethereum.

## Your Task

Write spec #{spec.number}: "{spec.title}"

Write the output to: {spec.file}

## Compatibility Criterion

A topic MAY only be included in the protocol spec if changing the thing \
it describes would cause alternative implementations to be incompatible.

The spec must contain sufficient detail for an independent engineering team \
to build a compatible implementation.

## Spec Description

{spec.description}

## Key Source Paths to Explore

{sources}{existing_section}

## Formatting Requirements

{formatting}

## Instructions

1. EXPLORE the key source paths listed above. Read implementation code to \
understand what the protocol actually does.
2. Check the specs/ directory for any other specs that have already been \
written. Read them to align on terminology, cross-reference where appropriate, \
and avoid repeating content they already cover.
3. Write a comprehensive, precise specification following all formatting \
requirements.
4. The spec must be NORMATIVE — it describes what implementations MUST do.
5. Use tables for data structures, Mermaid diagrams for relationships, and \
pseudocode for algorithms.
6. Flag ambiguities or unresolved items in an "Open Questions" section.
7. Write the completed spec to the output file path shown above.

Begin by exploring the source code, then write the spec.
"""


def build_integration_prompt(source: Source, specs: list[Spec]) -> str:
    """Build the prompt for reviewing and integrating an old spec source."""
    formatting = parse_formatting_guidelines(PLAN_FILE)
    target = next((s for s in specs if s.number == source.target_spec), None)
    target_file = target.file if target else f"specs/{source.target_spec:02d}-unknown.md"

    return f"""\
You are reviewing a legacy protocol specification document for the Aztec Network \
and integrating still-valid content into the new protocol spec.

## Source Document

File: {source.file}

## Target Spec

File: {target_file}
Spec #{source.target_spec}: "{source.target_title}"

## Instructions

1. Read the source document: {source.file}
2. Read the target spec: {target_file}
3. Compare the two documents carefully. For each piece of content in the source:
   a. If it is ALREADY COVERED adequately in the new spec → skip it
   b. If it is STILL VALID but MISSING or insufficiently detailed in the new spec → integrate it
   c. If it appears OUTDATED or INCORRECT → skip it
4. For any content where you are UNCERTAIN about current validity, consult the \
actual source code in the repository to determine the truth. Key code paths:
   - `noir-projects/noir-protocol-circuits/` — circuit implementations
   - `yarn-project/` — TypeScript node implementation
   - `l1-contracts/src/` — L1 Solidity contracts
5. When integrating content, make surgical edits to the target spec:
   - Add missing details to existing sections where they fit
   - Add new subsections only if the content doesn't fit existing structure
   - Maintain consistent terminology with the rest of the spec
   - Follow all formatting requirements below
6. Do NOT duplicate content that already exists in the new spec.
7. Do NOT add content that fails the compatibility criterion: \
"A topic MAY only be included if changing what it describes would cause \
alternative implementations to be incompatible."

## Formatting Requirements

{formatting}

## Output

After completing your review and integration, write a brief summary to stdout \
describing what you found:
- What content was already covered
- What content was integrated (and where in the target spec)
- What content was skipped as outdated
- What content required code verification and what you found

Begin by reading both documents, then systematically review and integrate.
"""


# ─── Plan File Updater ───────────────────────────────────────────────

def update_plan_status(
    plan_path: Path, spec_num: int, status: str, assignee: str = ""
) -> bool:
    """Update a spec's Status and Assignee columns in the plan markdown."""
    lines = plan_path.read_text().splitlines()
    pattern = re.compile(rf"^\|\s*{spec_num}\s*\|")
    found = False
    for i, line in enumerate(lines):
        if pattern.match(line):
            parts = line.split("|")
            # Expected parts: ['', ' # ', ' Title ', ' File ', ' Status ', ' Assignee ', ' Sources ', '']
            if len(parts) >= 7:
                # Preserve original column widths by padding.
                sw = max(len(parts[4]) - 1, len(status) + 1)
                aw = max(len(parts[5]) - 1, len(assignee or "—") + 1)
                parts[4] = f" {status:<{sw}}"
                parts[5] = f" {assignee or '—':<{aw}}"
                lines[i] = "|".join(parts)
                found = True
            break
    if found:
        plan_path.write_text("\n".join(lines) + "\n")
    return found


def update_source_status(
    plan_path: Path, source_num: int, status: str, notes: str = ""
) -> bool:
    """Update a source's Status and Notes columns in the plan markdown.

    Only searches within the '## 6. Source Integration Tracking' section
    to avoid collisions with spec table rows.
    """
    lines = plan_path.read_text().splitlines()
    pattern = re.compile(rf"^\|\s*{source_num}\s*\|")
    in_source_section = False
    found = False
    for i, line in enumerate(lines):
        if "## 6. Source Integration Tracking" in line:
            in_source_section = True
            continue
        if not in_source_section:
            continue
        if pattern.match(line):
            parts = line.split("|")
            # Expected: ['', ' S# ', ' Source File ', ' Status ', ' Notes ', '']
            if len(parts) >= 5:
                sw = max(len(parts[3]) - 1, len(status) + 1)
                parts[3] = f" {status:<{sw}}"
                if notes:
                    nw = max(len(parts[4]) - 1, len(notes) + 1)
                    parts[4] = f" {notes:<{nw}}"
                lines[i] = "|".join(parts)
                found = True
            break
    if found:
        plan_path.write_text("\n".join(lines) + "\n")
    return found


# ─── Claude Launcher ────────────────────────────────────────────────

def launch_claude(spec: Spec, state: StateManager) -> tuple[bool, str]:
    """Launch a headless Claude instance for a spec.

    Returns (success, message).
    """
    if state.running_count() >= MAX_CONCURRENT:
        return False, f"Max concurrent instances ({MAX_CONCURRENT}) reached."

    existing = state.get(spec.number)
    if existing and existing.status == "running":
        return False, f"Spec #{spec.number} already running (PID {existing.pid})."

    if not shutil.which(CLAUDE_CMD):
        return False, f"'{CLAUDE_CMD}' not found in PATH."

    # Ensure output directory exists.
    SPECS_DIR.mkdir(parents=True, exist_ok=True)

    prompt = build_prompt(spec)
    log_file = LOGS_DIR / f"spec-{spec.number:02d}.log"

    cmd = [CLAUDE_CMD, "-p", *CLAUDE_EXTRA_FLAGS]

    with open(log_file, "w") as fh:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=fh,
            stderr=subprocess.STDOUT,
            cwd=str(PROJECT_ROOT),
            preexec_fn=os.setsid,
        )
        proc.stdin.write(prompt.encode("utf-8"))  # type: ignore[union-attr]
        proc.stdin.close()  # type: ignore[union-attr]

    state.register(spec.number, proc.pid, str(log_file))
    update_plan_status(PLAN_FILE, spec.number, "In Progress", "Claude")

    return True, f"PID {proc.pid} — logs: {log_file.relative_to(PROJECT_ROOT)}"


def launch_integration(
    source: Source, specs: list[Spec], state: StateManager
) -> tuple[bool, str]:
    """Launch a headless Claude instance for source integration.

    Returns (success, message).
    """
    if state.running_count() >= MAX_CONCURRENT:
        return False, f"Max concurrent instances ({MAX_CONCURRENT}) reached."

    existing = state.get_source(source.number)
    if existing and existing.status == "running":
        return False, f"Source S{source.number} already running (PID {existing.pid})."

    if not shutil.which(CLAUDE_CMD):
        return False, f"'{CLAUDE_CMD}' not found in PATH."

    SPECS_DIR.mkdir(parents=True, exist_ok=True)

    prompt = build_integration_prompt(source, specs)
    log_file = LOGS_DIR / f"source-{source.number:03d}.log"

    cmd = [CLAUDE_CMD, "-p", *CLAUDE_EXTRA_FLAGS]

    with open(log_file, "w") as fh:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=fh,
            stderr=subprocess.STDOUT,
            cwd=str(PROJECT_ROOT),
            preexec_fn=os.setsid,
        )
        proc.stdin.write(prompt.encode("utf-8"))  # type: ignore[union-attr]
        proc.stdin.close()  # type: ignore[union-attr]

    state.register_source(source.number, proc.pid, str(log_file))
    update_source_status(PLAN_FILE, source.number, "In Progress")

    return True, f"PID {proc.pid} — logs: {log_file.relative_to(PROJECT_ROOT)}"


# ─── CLI: status ─────────────────────────────────────────────────────

def cmd_status(_args):
    specs = parse_plan(PLAN_FILE)
    state = StateManager()

    R = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"

    status_color = {
        "Not Started": DIM,
        "In Progress": YELLOW,
        "In Review": BLUE,
        "Approved": GREEN,
    }
    priority_label = {
        "P0": "Foundational",
        "P1": "Core Protocol",
        "P2": "Supporting",
        "P3": "Peripheral",
    }

    cur_p = None
    for spec in specs:
        if spec.priority != cur_p:
            cur_p = spec.priority
            print(f"\n  {BOLD}{cur_p} — {priority_label.get(cur_p, '')}{R}")
            print(f"  {'─' * 72}")

        c = status_color.get(spec.status, R)
        inst = state.get(spec.number)
        tag = ""
        if inst and inst.status == "running":
            elapsed = _elapsed_str(inst.started_at)
            tag = f" {YELLOW}[PID {inst.pid}, {elapsed}]{R}"
        elif inst and inst.status in ("finished", "stopped"):
            tag = f" {DIM}[{inst.status}]{R}"

        # Check if output file exists and show size
        out = PROJECT_ROOT / spec.file
        size_tag = ""
        if out.exists():
            kb = out.stat().st_size / 1024
            size_tag = f" {DIM}({kb:.0f}KB){R}"

        print(f"  {spec.number:>2}. {c}{spec.status:<12}{R} {spec.title}{size_tag}{tag}")

    # Summary
    total = len(specs)
    counts = {}
    for s in specs:
        counts[s.status] = counts.get(s.status, 0) + 1
    running = state.running_count()

    print(f"\n  {BOLD}Summary:{R}", end="")
    for st in ("Approved", "In Review", "In Progress", "Not Started"):
        if counts.get(st, 0):
            c = status_color.get(st, R)
            print(f"  {c}{counts[st]} {st.lower()}{R}", end="")
    print(f"  |  {BOLD}{running}/{MAX_CONCURRENT}{R} instances running\n")


# ─── CLI: start ──────────────────────────────────────────────────────

def _wait_for_completion(state: StateManager, spec_num: int) -> str:
    """Block until a spec's Claude process exits.  Returns final instance status."""
    inst = state.get(spec_num)
    if not inst:
        return "unknown"
    start = time.time()
    while state._is_alive(inst.pid):
        elapsed = _elapsed_str(inst.started_at)
        activity = get_instance_activity(inst.log_file)
        act = activity["activity"]
        line = f"\r      [{elapsed}] {act[:60]}" if act else f"\r      [{elapsed}] waiting..."
        print(f"{line:<80}", end="", flush=True)
        time.sleep(5)
    print(f"\r{'':80}\r", end="")  # clear status line
    state._reap()
    inst = state.get(spec_num)
    return inst.status if inst else "unknown"


def _sleep_countdown(minutes: int):
    """Sleep with a visible countdown.  Raises KeyboardInterrupt on Ctrl-C."""
    total = minutes * 60
    for remaining in range(total, 0, -1):
        m, s = divmod(remaining, 60)
        print(f"\r      Cooldown: {m}m{s:02d}s remaining  ", end="", flush=True)
        time.sleep(1)
    print(f"\r{'':40}\r", end="")


def cmd_start(args):
    specs = parse_plan(PLAN_FILE)
    state = StateManager()
    spec_map = {s.number: s for s in specs}

    nums = args.nums
    if args.p0:
        nums = [s.number for s in specs if s.priority == "P0" and s.status == "Not Started"]
        if not nums:
            print("All P0 specs are already started or complete.")
            return
    if args.all:
        nums = [s.number for s in specs if s.status == "Not Started"]
        if not nums:
            print("All specs are already started or complete.")
            return

    if args.sequential:
        _run_sequential(nums, spec_map, state, delay_minutes=args.delay)
        return

    for num in nums:
        if num not in spec_map:
            print(f"  [!] Spec #{num} not found.")
            continue
        ok, msg = launch_claude(spec_map[num], state)
        sym = "+" if ok else "!"
        print(f"  [{sym}] Spec #{num} ({spec_map[num].title}): {msg}")


def _run_sequential(
    nums: list[int],
    spec_map: dict[int, Spec],
    state: StateManager,
    delay_minutes: int = 15,
):
    """Launch specs one at a time, waiting for each to finish."""
    valid = [n for n in nums if n in spec_map]
    if not valid:
        print("  No valid spec numbers to run.")
        return

    print(f"  Sequential run: {len(valid)} spec(s), {delay_minutes}m cooldown between each.\n")

    try:
        for i, num in enumerate(valid):
            spec = spec_map[num]
            label = f"[{i + 1}/{len(valid)}]"
            ok, msg = launch_claude(spec, state)
            if not ok:
                print(f"  {label} [!] Spec #{num} ({spec.title}): {msg}")
                continue
            print(f"  {label} [+] Spec #{num} — {spec.title}")
            print(f"      {msg}")

            final = _wait_for_completion(state, num)
            out = PROJECT_ROOT / spec.file
            size = f" ({out.stat().st_size / 1024:.0f}KB)" if out.exists() else ""
            print(f"      Done: {final}{size}")

            if i < len(valid) - 1:
                print(f"      Sleeping {delay_minutes}m before next spec...")
                _sleep_countdown(delay_minutes)

    except KeyboardInterrupt:
        remaining = len(valid) - i - 1
        print(f"\n  Interrupted. {remaining} spec(s) not started.")
        return

    print(f"\n  All {len(valid)} spec(s) complete.")


# ─── CLI: stop ───────────────────────────────────────────────────────

def cmd_stop(args):
    state = StateManager()

    if args.all:
        nums = [n for n, i in state.instances.items() if i.status == "running"]
    else:
        nums = args.nums or []

    if not nums:
        print("  No specs specified (use --all to stop everything).")
        return

    for num in nums:
        inst = state.get(num)
        if not inst:
            print(f"  [!] No instance tracked for spec #{num}.")
            continue
        if state.stop(num):
            print(f"  [x] Stopped spec #{num} (PID {inst.pid}).")
            update_plan_status(PLAN_FILE, num, "Not Started", "—")
        else:
            print(f"  [!] Spec #{num} was not running (status: {inst.status}).")


# ─── CLI: restart ────────────────────────────────────────────────────

def cmd_restart(args):
    specs = parse_plan(PLAN_FILE)
    state = StateManager()
    spec_map = {s.number: s for s in specs}

    for num in args.nums:
        if num not in spec_map:
            print(f"  [!] Spec #{num} not found.")
            continue
        inst = state.get(num)
        if inst and inst.status == "running":
            state.stop(num)
            print(f"  [x] Stopped spec #{num} (PID {inst.pid}).")
        ok, msg = launch_claude(spec_map[num], state)
        sym = "+" if ok else "!"
        print(f"  [{sym}] Spec #{num}: {msg}")


# ─── CLI: logs ───────────────────────────────────────────────────────

def cmd_logs(args):
    log_file = LOGS_DIR / f"spec-{args.num:02d}.log"
    if not log_file.exists():
        print(f"  No log file for spec #{args.num}.")
        return
    try:
        subprocess.run(["less", "+G", "-R", str(log_file)], check=False)
    except KeyboardInterrupt:
        pass


# ─── CLI: prompt ─────────────────────────────────────────────────────

def cmd_prompt(args):
    specs = parse_plan(PLAN_FILE)
    spec_map = {s.number: s for s in specs}
    if args.num not in spec_map:
        print(f"Spec #{args.num} not found.")
        return
    print(build_prompt(spec_map[args.num]))


# ─── CLI: update ─────────────────────────────────────────────────────

STATUS_ALIASES = {
    "not-started": "Not Started",
    "in-progress": "In Progress",
    "in-review": "In Review",
    "approved": "Approved",
}


def cmd_update(args):
    status = STATUS_ALIASES.get(args.status)
    if not status:
        print(f"Invalid status '{args.status}'.  Valid: {', '.join(STATUS_ALIASES)}")
        return
    if update_plan_status(PLAN_FILE, args.num, status, args.assignee or ""):
        print(f"  Spec #{args.num} -> {status}")
    else:
        print(f"  [!] Spec #{args.num} not found in plan.")


# ─── CLI: clean ──────────────────────────────────────────────────────

def cmd_clean(_args):
    state = StateManager()
    n = state.clean()
    print(f"  Cleaned {n} finished/stopped instance(s).")


# ─── CLI: sources ────────────────────────────────────────────────────

def cmd_sources(_args):
    """Show all source integration items and their status."""
    sources = parse_sources(PLAN_FILE)
    state = StateManager()

    R = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"

    status_color = {
        "Not Integrated": DIM,
        "In Progress": YELLOW,
        "Integrated": GREEN,
        "Skipped": BLUE,
    }

    cur_target = None
    for src in sources:
        header = f"Spec #{src.target_spec}: {src.target_title}"
        if header != cur_target:
            cur_target = header
            print(f"\n  {BOLD}{header}{R}")
            print(f"  {'─' * 72}")

        c = status_color.get(src.status, R)
        inst = state.get_source(src.number)
        tag = ""
        if inst and inst.status == "running":
            elapsed = _elapsed_str(inst.started_at)
            tag = f" {YELLOW}[PID {inst.pid}, {elapsed}]{R}"
        elif inst and inst.status in ("finished", "stopped"):
            tag = f" {DIM}[{inst.status}]{R}"

        notes = f" {CYAN}{src.notes}{R}" if src.notes else ""
        fname = Path(src.file).name
        print(f"  S{src.number:>2}. {c}{src.status:<15}{R} {fname}{notes}{tag}")

    # Summary
    total = len(sources)
    counts: dict[str, int] = {}
    for s in sources:
        counts[s.status] = counts.get(s.status, 0) + 1

    print(f"\n  {BOLD}Summary:{R}", end="")
    for st in ("Integrated", "Skipped", "In Progress", "Not Integrated"):
        if counts.get(st, 0):
            c = status_color.get(st, R)
            print(f"  {c}{counts[st]} {st.lower()}{R}", end="")
    print(f"  |  {BOLD}{total} total sources{R}\n")


# ─── CLI: integrate ──────────────────────────────────────────────────

def cmd_integrate(args):
    """Launch Claude instance(s) for source integration."""
    sources = parse_sources(PLAN_FILE)
    specs = parse_plan(PLAN_FILE)
    state = StateManager()
    source_map = {s.number: s for s in sources}

    nums = args.nums

    if args.spec:
        # Integrate all not-integrated sources for a given spec
        nums = [
            s.number for s in sources
            if s.target_spec == args.spec and s.status == "Not Integrated"
        ]
        if not nums:
            print(f"  No unintegrated sources for spec #{args.spec}.")
            return

    if args.all:
        nums = [s.number for s in sources if s.status == "Not Integrated"]
        if not nums:
            print("  All sources already integrated or in progress.")
            return

    if not nums:
        print("  No sources specified. Use S-numbers, --spec N, or --all.")
        return

    if args.sequential:
        _run_sequential_integration(nums, source_map, specs, state, args.delay)
        return

    for num in nums:
        if num not in source_map:
            print(f"  [!] Source S{num} not found.")
            continue
        src = source_map[num]
        ok, msg = launch_integration(src, specs, state)
        sym = "+" if ok else "!"
        fname = Path(src.file).name
        print(f"  [{sym}] S{num} ({fname} → #{src.target_spec}): {msg}")


def _run_sequential_integration(
    nums: list[int],
    source_map: dict[int, Source],
    specs: list[Spec],
    state: StateManager,
    delay_minutes: int = 5,
):
    """Launch source integrations one at a time, waiting for each to finish."""
    valid = [n for n in nums if n in source_map]
    if not valid:
        print("  No valid source numbers to run.")
        return

    print(f"  Sequential integration: {len(valid)} source(s), {delay_minutes}m cooldown.\n")

    try:
        for i, num in enumerate(valid):
            src = source_map[num]
            label = f"[{i + 1}/{len(valid)}]"
            ok, msg = launch_integration(src, specs, state)
            if not ok:
                fname = Path(src.file).name
                print(f"  {label} [!] S{num} ({fname}): {msg}")
                continue
            fname = Path(src.file).name
            print(f"  {label} [+] S{num} — {fname} → #{src.target_spec}")
            print(f"      {msg}")

            final = _wait_for_source_completion(state, num)
            print(f"      Done: {final}")

            if i < len(valid) - 1:
                print(f"      Sleeping {delay_minutes}m before next source...")
                _sleep_countdown(delay_minutes)

    except KeyboardInterrupt:
        remaining = len(valid) - i - 1
        print(f"\n  Interrupted. {remaining} source(s) not started.")
        return

    print(f"\n  All {len(valid)} source integration(s) complete.")


def _wait_for_source_completion(state: StateManager, source_num: int) -> str:
    """Block until a source integration process exits."""
    inst = state.get_source(source_num)
    if not inst:
        return "unknown"
    while state._is_alive(inst.pid):
        elapsed = _elapsed_str(inst.started_at)
        activity = get_instance_activity(inst.log_file)
        act = activity["activity"]
        line = f"\r      [{elapsed}] {act[:60]}" if act else f"\r      [{elapsed}] waiting..."
        print(f"{line:<80}", end="", flush=True)
        time.sleep(5)
    print(f"\r{'':80}\r", end="")
    state._reap()
    inst = state.get_source(source_num)
    return inst.status if inst else "unknown"


# ─── CLI: integrate-prompt ───────────────────────────────────────────

def cmd_integrate_prompt(args):
    """Print the integration prompt for a source."""
    sources = parse_sources(PLAN_FILE)
    specs = parse_plan(PLAN_FILE)
    source_map = {s.number: s for s in sources}
    if args.num not in source_map:
        print(f"Source S{args.num} not found.")
        return
    print(build_integration_prompt(source_map[args.num], specs))


# ─── CLI: integrate-update ───────────────────────────────────────────

SOURCE_STATUS_ALIASES = {
    "not-integrated": "Not Integrated",
    "in-progress": "In Progress",
    "integrated": "Integrated",
    "skipped": "Skipped",
}


def cmd_source_update(args):
    """Manually set source integration status."""
    status = SOURCE_STATUS_ALIASES.get(args.status)
    if not status:
        print(f"Invalid status '{args.status}'.  Valid: {', '.join(SOURCE_STATUS_ALIASES)}")
        return
    if update_source_status(PLAN_FILE, args.num, status, args.notes or ""):
        print(f"  Source S{args.num} -> {status}")
    else:
        print(f"  [!] Source S{args.num} not found in plan.")


# ─── CLI: integrate-logs ─────────────────────────────────────────────

def cmd_integrate_logs(args):
    """View logs for a source integration."""
    log_file = LOGS_DIR / f"source-{args.num:03d}.log"
    if not log_file.exists():
        print(f"  No log file for source S{args.num}.")
        return
    try:
        subprocess.run(["less", "+G", "-R", str(log_file)], check=False)
    except KeyboardInterrupt:
        pass


# ─── CLI: integrate-stop ─────────────────────────────────────────────

def cmd_integrate_stop(args):
    """Stop running source integration instance(s)."""
    state = StateManager()

    if args.all:
        nums = [n for n, i in state.source_instances.items() if i.status == "running"]
    else:
        nums = args.nums or []

    if not nums:
        print("  No sources specified (use --all to stop all).")
        return

    for num in nums:
        inst = state.get_source(num)
        if not inst:
            print(f"  [!] No instance tracked for source S{num}.")
            continue
        if state.stop_source(num):
            print(f"  [x] Stopped source S{num} (PID {inst.pid}).")
            update_source_status(PLAN_FILE, num, "Not Integrated")
        else:
            print(f"  [!] Source S{num} was not running (status: {inst.status}).")


# ─── Helpers ─────────────────────────────────────────────────────────

def _elapsed_str(iso_str: str) -> str:
    """Human-readable elapsed time from an ISO timestamp."""
    try:
        dt = datetime.fromisoformat(iso_str)
        secs = (datetime.now() - dt).total_seconds()
        if secs < 60:
            return f"{int(secs)}s"
        if secs < 3600:
            return f"{int(secs / 60)}m"
        return f"{int(secs / 3600)}h{int((secs % 3600) / 60)}m"
    except Exception:
        return "?"


# ─── Dashboard (curses TUI) ─────────────────────────────────────────

def _dashboard(stdscr):
    curses.curs_set(0)
    curses.use_default_colors()
    curses.init_pair(1, curses.COLOR_GREEN, -1)
    curses.init_pair(2, curses.COLOR_YELLOW, -1)
    curses.init_pair(3, curses.COLOR_BLUE, -1)
    curses.init_pair(4, curses.COLOR_RED, -1)
    curses.init_pair(5, curses.COLOR_WHITE, -1)
    curses.init_pair(6, curses.COLOR_BLACK, curses.COLOR_WHITE)
    curses.init_pair(7, curses.COLOR_CYAN, -1)
    stdscr.timeout(2000)

    selected = 0
    scroll = 0
    msg = ""
    msg_t = 0.0

    # Map status -> (indicator, color_pair)
    STATUS_VIS = {
        "Not Started": ("○", 5, curses.A_DIM),
        "In Progress": ("●", 2, curses.A_BOLD),
        "In Review":   ("◆", 3, curses.A_BOLD),
        "Approved":    ("✓", 1, curses.A_BOLD),
    }
    PRIO_LABEL = {"P0": "Foundational", "P1": "Core Protocol", "P2": "Supporting", "P3": "Peripheral"}

    def flash(text: str):
        nonlocal msg, msg_t
        msg = text
        msg_t = time.time()

    while True:
        state = StateManager()  # _reap() first so plan file is updated
        specs = parse_plan(PLAN_FILE)
        h, w = stdscr.getmaxyx()
        stdscr.erase()

        # ── Header ──
        title = " Aztec Protocol Spec Manager "
        stdscr.addstr(0, 0, "─" * w, curses.color_pair(7))
        stdscr.addstr(0, max(0, (w - len(title)) // 2), title, curses.color_pair(7) | curses.A_BOLD)

        running = state.running_count()
        total = len(specs)
        approved = sum(1 for s in specs if s.status == "Approved")
        in_prog = sum(1 for s in specs if s.status == "In Progress")
        in_rev = sum(1 for s in specs if s.status == "In Review")
        summary = f" {approved}/{total} approved | {in_rev} reviewing | {in_prog} writing | {running}/{MAX_CONCURRENT} instances "
        stdscr.addstr(1, 1, summary[:w - 2], curses.A_DIM)

        keymap = " [s]tart  [x]stop  [l]ogs  [a]ll-P0  [S]tart-all  [c]lean  [r]efresh  [q]uit "
        stdscr.addstr(2, 1, keymap[:w - 2], curses.color_pair(7))
        stdscr.addstr(3, 0, "─" * w, curses.A_DIM)

        # ── Build display list ──
        items: list[tuple[bool, object]] = []  # (is_header, Spec | str)
        cur_p = None
        for spec in specs:
            if spec.priority != cur_p:
                cur_p = spec.priority
                items.append((True, f" {cur_p} — {PRIO_LABEL.get(cur_p, '')}"))
            items.append((False, spec))

        spec_indices = [i for i, (is_h, _) in enumerate(items) if not is_h]
        n_specs = len(spec_indices)
        selected = max(0, min(selected, n_specs - 1))

        # Adjust scroll so selected item is visible
        list_top = 4
        list_h = h - 6
        sel_display = spec_indices[selected] if spec_indices else 0
        if sel_display < scroll:
            scroll = sel_display
        if sel_display >= scroll + list_h:
            scroll = sel_display - list_h + 1

        # ── Render list ──
        spec_i = 0
        for display_i, (is_header, obj) in enumerate(items):
            row = list_top + display_i - scroll
            if row < list_top or row >= list_top + list_h:
                if not is_header:
                    spec_i += 1
                continue

            if is_header:
                try:
                    stdscr.addnstr(row, 0, str(obj), w - 1, curses.A_BOLD)
                except curses.error:
                    pass
            else:
                spec = obj
                is_sel = spec_i == selected
                ind, cp, attr = STATUS_VIS.get(spec.status, ("?", 5, 0))
                color = curses.color_pair(6) if is_sel else curses.color_pair(cp) | attr

                # Instance / activity info
                inst = state.get(spec.number)
                extra = ""
                if inst and inst.status == "running":
                    elapsed = _elapsed_str(inst.started_at)
                    activity = get_instance_activity(inst.log_file)
                    act_str = activity["activity"]
                    if act_str:
                        extra = f"  [{elapsed}] {act_str}"
                    else:
                        extra = f"  [{elapsed}]"
                elif inst and inst.status == "finished":
                    activity = get_instance_activity(inst.log_file)
                    cost = activity.get("cost", 0)
                    turns = activity.get("turns", 0)
                    extra = f"  [done, {turns}t, ${cost:.2f}]"
                elif inst and inst.status == "stopped":
                    extra = "  [stopped]"

                # Output file size
                out_path = PROJECT_ROOT / spec.file
                size_str = ""
                if out_path.exists():
                    kb = out_path.stat().st_size / 1024
                    size_str = f" ({kb:.0f}KB)"

                line = f"  {ind} {spec.number:>2}. {spec.title:<36} {spec.status:<12}{size_str}{extra}"
                try:
                    stdscr.addnstr(row, 0, line, w - 1, color)
                except curses.error:
                    pass

                spec_i += 1

        # ── Message bar ──
        if msg and time.time() - msg_t < 5:
            try:
                stdscr.addnstr(h - 2, 1, msg, w - 2, curses.color_pair(2) | curses.A_BOLD)
            except curses.error:
                pass

        stdscr.refresh()

        # ── Input ──
        try:
            key = stdscr.getch()
        except curses.error:
            continue

        if key == ord("q") or key == 27:  # q or Esc
            break
        elif key in (curses.KEY_UP, ord("k")):
            selected = max(0, selected - 1)
        elif key in (curses.KEY_DOWN, ord("j")):
            selected = min(n_specs - 1, selected + 1)
        elif key == ord("s"):
            if spec_indices:
                spec = items[spec_indices[selected]][1]
                ok, m = launch_claude(spec, state)
                flash(f"#{spec.number}: {m}")
        elif key == ord("x"):
            if spec_indices:
                spec = items[spec_indices[selected]][1]
                inst = state.get(spec.number)
                if inst and inst.status == "running":
                    state.stop(spec.number)
                    update_plan_status(PLAN_FILE, spec.number, "Not Started", "—")
                    flash(f"Stopped #{spec.number}")
                else:
                    flash(f"#{spec.number} not running")
        elif key == ord("l"):
            if spec_indices:
                spec = items[spec_indices[selected]][1]
                log_file = LOGS_DIR / f"spec-{spec.number:02d}.log"
                if log_file.exists():
                    curses.endwin()
                    subprocess.run(["less", "+G", "-R", str(log_file)], check=False)
                    stdscr = curses.initscr()
                    curses.noecho()
                    curses.cbreak()
                    stdscr.keypad(True)
                    curses.curs_set(0)
                    curses.start_color()
                    curses.use_default_colors()
                    for i, (fg, _bg) in enumerate(
                        [
                            (curses.COLOR_GREEN, -1),
                            (curses.COLOR_YELLOW, -1),
                            (curses.COLOR_BLUE, -1),
                            (curses.COLOR_RED, -1),
                            (curses.COLOR_WHITE, -1),
                            (curses.COLOR_BLACK, curses.COLOR_WHITE),
                            (curses.COLOR_CYAN, -1),
                        ],
                        start=1,
                    ):
                        curses.init_pair(i, fg, _bg)
                    stdscr.timeout(2000)
                else:
                    flash(f"No logs for #{spec.number}")
        elif key == ord("a"):
            started = 0
            for spec in specs:
                if spec.priority == "P0" and spec.status == "Not Started":
                    if state.running_count() >= MAX_CONCURRENT:
                        break
                    ok, _ = launch_claude(spec, state)
                    if ok:
                        started += 1
            flash(f"Started {started} P0 spec(s)")
        elif key == ord("c"):
            n = state.clean()
            flash(f"Cleaned {n} instance(s)")
        elif key == ord("r"):
            flash("Refreshed")
        elif key == ord("S"):
            # Shift+S: start ALL not-started specs (up to limit)
            started = 0
            for spec in specs:
                if spec.status == "Not Started":
                    if state.running_count() >= MAX_CONCURRENT:
                        break
                    ok, _ = launch_claude(spec, state)
                    if ok:
                        started += 1
            flash(f"Started {started} spec(s)")


def cmd_dashboard(_args):
    """Launch the interactive curses dashboard."""
    curses.wrapper(_dashboard)


# ─── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="spec-manager",
        description="Manage Claude Code instances for Aztec protocol spec writing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
        examples:
          %(prog)s status                 Show all specs
          %(prog)s start 1 2 3            Start specs 1, 2, 3
          %(prog)s start --p0             Start all P0 specs
          %(prog)s start --all -s         Run all remaining specs sequentially
          %(prog)s start 5 6 7 -s --delay 10  Sequential with 10m cooldown
          %(prog)s stop --all             Stop everything
          %(prog)s logs 5                 View logs for spec 5
          %(prog)s dashboard              Interactive TUI
          %(prog)s prompt 3               Preview the prompt for spec 3
          %(prog)s update 1 in-review     Mark spec 1 as in-review
          %(prog)s sources                Show source integration status
          %(prog)s integrate 1 2 3        Integrate sources S1, S2, S3
          %(prog)s integrate --spec 4     Integrate all sources for spec #4
          %(prog)s integrate --all -s     Integrate all sources sequentially
          %(prog)s integrate-stop --all   Stop all integration instances
          %(prog)s integrate-logs 5       View logs for source S5
          %(prog)s integrate-prompt 5     Preview integration prompt for S5
          %(prog)s source-update 1 integrated  Mark source S1 as integrated
        """),
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status", help="Show all specs and their status")

    p = sub.add_parser("start", help="Launch Claude instance(s)")
    p.add_argument("nums", type=int, nargs="*", default=[], help="Spec number(s)")
    p.add_argument("--p0", action="store_true", help="Start all P0 (foundational) specs")
    p.add_argument("--all", action="store_true", help="Start all not-started specs")
    p.add_argument("--sequential", "-s", action="store_true", help="Run specs one at a time, waiting for each to finish")
    p.add_argument("--delay", type=int, default=15, metavar="MIN", help="Minutes to wait between specs in sequential mode (default: 15)")

    p = sub.add_parser("stop", help="Stop running instance(s)")
    p.add_argument("nums", type=int, nargs="*", default=[], help="Spec number(s)")
    p.add_argument("--all", action="store_true", help="Stop all running instances")

    p = sub.add_parser("restart", help="Restart instance(s)")
    p.add_argument("nums", type=int, nargs="+", help="Spec number(s)")

    p = sub.add_parser("logs", help="View logs for a spec")
    p.add_argument("num", type=int, help="Spec number")

    sub.add_parser("dashboard", help="Interactive TUI dashboard")

    p = sub.add_parser("prompt", help="Print the prompt for a spec")
    p.add_argument("num", type=int, help="Spec number")

    p = sub.add_parser("update", help="Manually set spec status")
    p.add_argument("num", type=int, help="Spec number")
    p.add_argument("status", choices=list(STATUS_ALIASES), help="New status")
    p.add_argument("--assignee", default="", help="Assignee name")

    sub.add_parser("clean", help="Remove finished/stopped instances from tracking")

    # ── Source integration commands ──
    sub.add_parser("sources", help="Show source integration status")

    p = sub.add_parser("integrate", help="Launch source integration instance(s)")
    p.add_argument("nums", type=int, nargs="*", default=[], help="Source S-number(s)")
    p.add_argument("--spec", type=int, default=None, metavar="N", help="Integrate all sources for spec #N")
    p.add_argument("--all", action="store_true", help="Integrate all not-integrated sources")
    p.add_argument("--sequential", "-s", action="store_true", help="Run integrations one at a time")
    p.add_argument("--delay", type=int, default=5, metavar="MIN", help="Minutes between sequential runs (default: 5)")

    p = sub.add_parser("integrate-stop", help="Stop source integration instance(s)")
    p.add_argument("nums", type=int, nargs="*", default=[], help="Source S-number(s)")
    p.add_argument("--all", action="store_true", help="Stop all running integrations")

    p = sub.add_parser("integrate-logs", help="View logs for a source integration")
    p.add_argument("num", type=int, help="Source S-number")

    p = sub.add_parser("integrate-prompt", help="Print integration prompt for a source")
    p.add_argument("num", type=int, help="Source S-number")

    p = sub.add_parser("source-update", help="Manually set source integration status")
    p.add_argument("num", type=int, help="Source S-number")
    p.add_argument("status", choices=list(SOURCE_STATUS_ALIASES), help="New status")
    p.add_argument("--notes", default="", help="Notes to add")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    if not PLAN_FILE.exists():
        print(f"Error: Plan file not found: {PLAN_FILE}")
        sys.exit(1)

    dispatch = {
        "status": cmd_status,
        "start": cmd_start,
        "stop": cmd_stop,
        "restart": cmd_restart,
        "logs": cmd_logs,
        "dashboard": cmd_dashboard,
        "prompt": cmd_prompt,
        "update": cmd_update,
        "clean": cmd_clean,
        "sources": cmd_sources,
        "integrate": cmd_integrate,
        "integrate-stop": cmd_integrate_stop,
        "integrate-logs": cmd_integrate_logs,
        "integrate-prompt": cmd_integrate_prompt,
        "source-update": cmd_source_update,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
