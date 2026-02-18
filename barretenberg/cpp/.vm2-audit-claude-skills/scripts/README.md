# VM2 Audit Skills - Batch Runner

A tooling suite to run all VM2/AVM security audit skills in parallel and aggregate findings.

## Prerequisites

### Required

- **Claude Code CLI** (`claude`) - The main tool for running audit skills
  - Install: https://github.com/anthropics/claude-code
  - Must be authenticated and working

### Optional

- **PAL MCP Server** - Enables cross-validation with multiple AI models
  - Provides `mcp__pal__consensus` tool for multi-model consensus
  - Configure in Claude Code's MCP settings
  - **Requires API keys** (GEMINI_API_KEY, OPENAI_API_KEY, etc.) in the PAL MCP configuration
  - The CLIs (gemini, codex) are only needed for PAL's optional `clink` tool which spawns CLI subagents

The `--multi-model-summary` feature uses PAL MCP to have Gemini and GPT review Claude's findings, providing an additional validation layer.

## Overview

This tooling orchestrates specialized audit skills organized into 5 tiers (0-4), each designed to detect specific vulnerability patterns in the VM2/AVM PIL constraint system. Skills are discovered dynamically from the `skills/` directory. Results are collected and summarized into a prioritized report with exploitability-based triage.

## Skill Tiers

| Tier | Label | Description |
|------|-------|-------------|
| 0 | Opcode Cross-Layer Consistency | Opcode-level semantic checks (addressing modes, control flow, gas, tags, wire format, etc.) |
| 1 | Critical (Must Have) | Must-run skills that find the most severe bugs (boolean constraints, ghost rows, range checks, etc.) |
| 2 | High Value (Should Have) | High-value skills for thorough audits (typos, dead columns, error aggregation, etc.) |
| 3 | Moderate Value (Good to Have) | Comprehensive coverage (memory injection, tag validation, witness boundedness, etc.) |
| 4 | Sanity Checks (Optional) | Sanity-check skills, usually return clean results (zero-check, Fiat-Shamir, side-effect gating, etc.) |

Use `--list-skills` to see all skills organized by tier.

## Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │              run-vm2-audits.sh                       │
                    │           (Orchestrator Script)                      │
                    └─────────────────────┬───────────────────────────────┘
                                          │
                                          │ Spawns parallel jobs
                                          │ (configurable: -j N)
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
            ▼                             ▼                             ▼
   ┌────────────────┐           ┌────────────────┐           ┌────────────────┐
   │  claude -p     │           │  claude -p     │           │  claude -p     │
   │  <skill-1>     │           │  <skill-2>     │    ...    │  <skill-N>     │
   └───────┬────────┘           └───────┬────────┘           └───────┬────────┘
           │                            │                            │
           │ Writes                     │ Writes                     │ Writes
           ▼                            ▼                            ▼
   ┌────────────────┐           ┌────────────────┐           ┌────────────────┐
   │ skill-1.md     │           │ skill-2.md     │           │ skill-N.md     │
   │ skill-1.json   │           │ skill-2.json   │           │ skill-N.json   │
   └────────────────┘           └────────────────┘           └────────────────┘
            │                            │                            │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
                                          │ All jobs complete
                                          ▼
                    ┌─────────────────────────────────────────────────────┐
                    │             summarize-audits.sh                      │
                    │           (Aggregation Script)                       │
                    └─────────────────────┬───────────────────────────────┘
                                          │
                                          │ 1. Merges all .json files → findings.json
                                          │    (structured, with totals & exploitability)
                                          │ 2. Generates STATS.txt
                                          │ 3. Sends findings to Claude for analysis
                                          │ 4. Generates SUMMARY.md
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────────────┐
                    │                 Output Files                         │
                    │  ┌──────────────────────────────────────────────┐   │
                    │  │ SUMMARY.md    - Executive summary + findings │   │
                    │  │ findings.json - Merged machine-readable data │   │
                    │  │ STATS.txt     - Quick statistics             │   │
                    │  │ *.md + *.json - Individual skill outputs     │   │
                    │  └──────────────────────────────────────────────┘   │
                    └───────────────────────┬─────────────────────────────┘
                                            │
                                            │ (optional: --multi-model-summary)
                                            ▼
                    ┌─────────────────────────────────────────────────────┐
                    │         Multi-Model Validation (PAL MCP)            │
                    │  ┌──────────────────────────────────────────────┐   │
                    │  │ Gemini + GPT review findings via consensus   │   │
                    │  │ MULTI-MODEL-SUMMARY.md - Cross-validation    │   │
                    │  └──────────────────────────────────────────────┘   │
                    └─────────────────────────────────────────────────────┘
```

## Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              EXECUTION TIMELINE                               │
└──────────────────────────────────────────────────────────────────────────────┘

Time ──────────────────────────────────────────────────────────────────────────►

Phase 1: Parallel Audit Execution (with job limit)
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Job Slot 1: │████ skill-1 ████│████ skill-5 ████│████ skill-9 ████│ ...   │
│   Job Slot 2: │████ skill-2 ████│████ skill-6 ████│████ skill-10 ███│ ...   │
│   Job Slot 3: │████ skill-3 ████████│███ skill-7 ███│███ skill-11 ███│ ...  │
│   Job Slot 4: │████ skill-4 █████████│████ skill-8 █████│ skill-12 ██│ ...  │
│                                                                              │
│   └── Jobs start immediately ──┘  └── New jobs start as slots free up ──┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Phase 2: Wait for Completion
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   All parallel jobs   ──►   Barrier Wait   ──►   All complete                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Phase 3: Summarization
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Merge JSON ──► Compute Stats ──► Claude Analysis ──► SUMMARY.md + STATS   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Phase 4: Multi-Model Validation (optional, --multi-model-summary)
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   findings.json ──► PAL MCP Consensus ──► Gemini + GPT review each finding  │
│                 ──► Generate MULTI-MODEL-SUMMARY.md (does not replace above) │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Skill Invocation Detail

Each audit skill is invoked as a non-interactive Claude Code session:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Single Skill Execution                       │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │     claude -p "<SKILL.md + task>"   │
                    │       --model sonnet                │
                    │       --allowedTools "Read,..."     │
                    │       --output-format text          │
                    │       --disable-slash-commands      │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │        Claude Code Session          │
                    │  ┌───────────────────────────────┐  │
                    │  │  SKILL.md inlined in prompt   │  │
                    │  │  (no other skills loaded)     │  │
                    │  └───────────────┬───────────────┘  │
                    │                  ▼                  │
                    │  ┌───────────────────────────────┐  │
                    │  │  Execute audit methodology:   │  │
                    │  │  1. Enumerate ALL .pil files  │  │
                    │  │  2. Grep to prioritize files  │  │
                    │  │  3. Read & analyze matches    │  │
                    │  │  4. Sweep remaining files     │  │
                    │  │  5. Check for vulnerabilities │  │
                    │  └───────────────┬───────────────┘  │
                    │                  ▼                  │
                    │  ┌───────────────────────────────┐  │
                    │  │  Generate findings report     │  │
                    │  │  + Write JSON file            │  │
                    │  └───────────────────────────────┘  │
                    └──────────────────┬──────────────────┘
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
          ┌─────────────────────────┐  ┌─────────────────────────┐
          │   skill-name.md         │  │   skill-name.json       │
          │  - Findings by severity │  │  - Machine-readable     │
          │  - File locations       │  │  - Structured findings  │
          │  - Recommendations      │  │  - For aggregation      │
          └─────────────────────────┘  └─────────────────────────┘
```

## Output Directory Structure

```
audit-results/
├── SUMMARY.md                              # Aggregated findings summary (Claude)
├── MULTI-MODEL-SUMMARY.md                  # Cross-validation summary (optional, Gemini+GPT)
├── findings.json                           # Structured combined findings with totals
├── STATS.txt                               # Quick statistics (severity + exploitability)
├── audit-run.log                           # Execution log
│
├── vm2-audit-t1-missing-boolean.md         # Individual skill markdown reports
├── vm2-audit-t1-missing-boolean.json       # Individual skill JSON (machine-readable)
├── vm2-audit-t4-zero-check.md              #   ↓
├── vm2-audit-t4-zero-check.json            #   ↓
├── vm2-audit-...                           #   ...
│
├── .vm2-audit-t1-missing-boolean.status    # Status files (success/failed + duration)
├── .vm2-audit-t4-zero-check.status         #   ↓
├── .monitor_running                        # Transient: progress monitor flag
├── .multi-model-validate.log               # Multi-model validation log (if enabled)
└── ...
```

## Standardized Output Format

Each skill produces TWO output files:
- **{skill-name}.md** - Human-readable markdown report with summary table and findings
- **{skill-name}.json** - Machine-readable JSON for automated parsing/aggregation

The combined `findings.json` is a structured document containing:
- All individual skill JSON blocks under a `skills` array
- Aggregated `totals` with breakdowns by severity and exploitability
- Actionability summary (actionable vs likely false positives)

## Finding ID Convention

Format: `{skill-name}-{filename}-{line}-{subtype}`

Example: `vm2-audit-t1-missing-boolean-alu-123-SEL`

## Usage

### Basic Usage

```bash
# Run all audit skills with defaults (4 parallel jobs, all tiers)
./run-vm2-audits.sh

# Run with 8 parallel jobs
./run-vm2-audits.sh -j 8

# Run specific tier(s) only
./run-vm2-audits.sh -T 1                    # Tier 1 only (fastest, critical bugs)
./run-vm2-audits.sh -T 1,2                  # Tiers 1 and 2 (recommended)
./run-vm2-audits.sh -T 1-3                  # Tiers 1 through 3
./run-vm2-audits.sh -T 0                    # Tier 0 only (opcode checks)

# Run specific skills only
./run-vm2-audits.sh -s vm2-audit-t1-missing-boolean -s vm2-audit-t4-zero-check

# Specify output directory
./run-vm2-audits.sh -o ./my-audit-results

# Use a different model
./run-vm2-audits.sh -m opus

# Target specific path
./run-vm2-audits.sh -t pil/vm2/alu.pil

# List all available skills by tier
./run-vm2-audits.sh --list-skills
```

### Re-run Summarizer Only

```bash
# Skip audit runs, just summarize existing results
./run-vm2-audits.sh --summarize-only

# Or run summarizer directly
./summarize-audits.sh -o ./audit-results

# Summarizer with explicit model
./summarize-audits.sh -o ./audit-results -m opus

# JSON extraction only (no Claude summarization)
./summarize-audits.sh -o ./audit-results --json-only
```

### Multi-Model Validation (Optional)

Cross-validate findings with Gemini and GPT via PAL MCP. Creates an additional
`MULTI-MODEL-SUMMARY.md` file (does not replace `SUMMARY.md`).

```bash
# Run full audit with multi-model validation
./run-vm2-audits.sh --multi-model-summary

# Run multi-model validation on existing results
./run-vm2-audits.sh --summarize-only --multi-model-summary

# Or run summarizer directly with multi-model
./summarize-audits.sh -o ./audit-results --multi-model-summary

# Via environment variable
EXTRA_MULTI_MODEL_SUMMARY=1 ./run-vm2-audits.sh
```

**Note:** Requires PAL MCP server to be configured. If not available, the
multi-model step will fail gracefully and the primary `SUMMARY.md` remains intact.

### Skip Summarization

```bash
# Run audits but don't summarize (for incremental work)
./run-vm2-audits.sh --no-summarize
```

## How It Works

### 1. Orchestrator (run-vm2-audits.sh)

The orchestrator discovers skills dynamically from the `skills/` directory by scanning for `vm2-audit-*/` directories. Skills are organized by tier based on the `vm2-audit-tN-` naming convention, and executed in parallel using bash job control:

```bash
# Simplified job control logic
for skill in "${SKILLS[@]}"; do
    run_skill "$skill" &       # Start in background
    pids+=($!)                 # Track PID
    ((job_count++))

    if [[ $job_count -ge $MAX_JOBS ]]; then
        wait -n                # Wait for ANY job to finish
        ((job_count--))
    fi
done

wait "${pids[@]}"              # Wait for all remaining
```

A background progress monitor reports status every 30 seconds, and completions are announced as they happen.

### 2. Skill Execution

Each skill's `SKILL.md` is read and inlined directly into the prompt. The session runs with `--disable-slash-commands` so no other skills are loaded into the system prompt.

A **file coverage preamble** is prepended to every skill prompt, instructing the Claude session to enumerate ALL `.pil` files under the target path before following the skill's grep patterns. This ensures full file coverage even when a skill's grep patterns are narrow — the patterns serve as prioritization hints, not scope boundaries.

```bash
echo "<preamble + SKILL.md contents + task>" | claude -p \
    --model "$MODEL" \
    --allowedTools "Read,Glob,Grep,Bash,Write,Edit" \
    --output-format text \
    --disable-slash-commands \
    > "${skill}.md"
```

Each `SKILL.md` provides:
- Vulnerability description
- Audit methodology
- Search patterns (used as starting points, not exhaustive scope)
- Test procedures
- Fix patterns

### 3. Summarizer (summarize-audits.sh)

The summarizer:
1. Collects all `*.json` files and builds a structured `findings.json` with:
   - Individual skill results in a `skills` array
   - Aggregated totals by severity (critical/high/medium/low/informational)
   - Aggregated totals by exploitability (high/medium/low/very_low/none)
   - Actionability summary (actionable vs likely false positives)
2. Generates `STATS.txt` with severity, exploitability, and file size breakdowns
3. Sends findings JSON to Claude with a structured summarization prompt
4. If JSON exceeds 100KB, automatically condenses it (truncates descriptions, drops verbose fields)
5. Generates `SUMMARY.md` with executive summary, actionable findings, and recommendations

## Configuration

### Command-Line Flags (run-vm2-audits.sh)

| Flag | Description |
|------|-------------|
| `-T, --tier TIERS` | Run specific tier(s): `1`, `1,2`, `1-3`, `0-4` (default: all) |
| `-j, --jobs N` | Maximum parallel jobs (default: 4) |
| `-o, --output DIR` | Output directory (default: `./audit-results`) |
| `-s, --skill SKILL` | Run only specific skill(s) (repeatable) |
| `-t, --target PATH` | Target path/file to audit (default: `pil/vm2`) |
| `-m, --model MODEL` | Model to use (default: `sonnet`) |
| `--summarize-only` | Only run summarizer on existing results |
| `--no-summarize` | Skip the summarizer step |
| `--multi-model-summary` | Run extra multi-model validation (Gemini/GPT via PAL MCP) |
| `--list-skills` | List available skills by tier and exit |

### Command-Line Flags (summarize-audits.sh)

| Flag | Description |
|------|-------------|
| `-o, --output DIR` | Output directory containing audit results (default: `./audit-results`) |
| `-m, --model MODEL` | Model to use for summarization (default: `sonnet`) |
| `--json-only` | Only extract JSON findings, skip Claude summarization |
| `--multi-model-summary` | Run extra multi-model validation (Gemini/GPT via PAL MCP) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_JOBS` | `4` | Max parallel Claude instances |
| `OUTPUT_DIR` | `./audit-results` | Output directory |
| `TARGET_PATH` | `pil/vm2` | Path to audit |
| `MODEL` | `sonnet` | Model to use |
| `EXTRA_MULTI_MODEL_SUMMARY` | `false` | Enable multi-model validation (`true` or `1`) |

### Model Selection

- **sonnet** (default): Good balance of speed/quality
- **opus**: More thorough, slower, higher cost
- **haiku**: Fast but less thorough

## Troubleshooting

### Skill Failed

Check the individual output file and status:
```bash
cat audit-results/vm2-audit-t1-missing-boolean.md
cat audit-results/.vm2-audit-t1-missing-boolean.status
```

### High Memory Usage

Reduce parallelism:
```bash
./run-vm2-audits.sh -j 2
```

### Summarizer Fails

The combined findings may be too large. The summarizer auto-condenses JSON over 100KB, but you can also:
```bash
# Extract just JSON, skip Claude summarization
./summarize-audits.sh -o audit-results --json-only
```
