# VM2 Audit Skills - Batch Runner

A tooling suite to run all VM2/AVM security audit skills in parallel and aggregate findings.

## Prerequisites

### Required

- **Claude Code CLI** (`claude`) - The main tool for running audit skills
  - Install: https://github.com/anthropics/claude-code
  - Must be authenticated and working

### Optional (for Multi-Model Validation)

- **PAL MCP Server** - Enables cross-validation with multiple AI models
  - Provides `mcp__pal__consensus` tool for multi-model consensus
  - Configure in Claude Code's MCP settings
  - **Requires API keys** (GEMINI_API_KEY, OPENAI_API_KEY, etc.) in the PAL MCP configuration
  - The CLIs (gemini, codex) are only needed for PAL's optional `clink` tool which spawns CLI subagents

The `--multi-model-summary` feature uses PAL MCP to have Gemini and GPT review Claude's findings, providing an additional validation layer.

## Overview

This tooling orchestrates 25+ specialized audit skills, each designed to detect specific vulnerability patterns in the VM2/AVM PIL constraint system. Results are collected and summarized into a prioritized report.

## Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │              run-all-audits.sh                       │
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
   │  /<skill-1>    │           │  /<skill-2>    │    ...    │  /<skill-N>    │
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
                                          │ 2. Sends .md files to Claude for analysis
                                          │ 3. Generates summary report
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
│   Combine Results ──► Claude Analysis ──► Generate SUMMARY.md + STATS.txt   │
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
                    │     claude -p "<prompt>"            │
                    │       --model sonnet                │
                    │       --allowedTools "Read,..."     │
                    │       --output-format text          │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │        Claude Code Session          │
                    │  ┌───────────────────────────────┐  │
                    │  │  Load SKILL.md instructions   │  │
                    │  │         (from .claude/skills/)│  │
                    │  └───────────────┬───────────────┘  │
                    │                  ▼                  │
                    │  ┌───────────────────────────────┐  │
                    │  │  Execute audit methodology:   │  │
                    │  │  1. Grep for patterns         │  │
                    │  │  2. Read relevant files       │  │
                    │  │  3. Analyze constraints       │  │
                    │  │  4. Check for vulnerabilities │  │
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
├── SUMMARY.md                          # Aggregated findings summary (Claude)
├── MULTI-MODEL-SUMMARY.md              # Cross-validation summary (optional, Gemini+GPT)
├── findings.json                       # Machine-readable combined findings
├── STATS.txt                           # Quick statistics
├── audit-run.log                       # Execution log
│
├── vm2-audit-missing-boolean.md        # Individual skill markdown reports
├── vm2-audit-missing-boolean.json      # Individual skill JSON (machine-readable)
├── vm2-audit-zero-check.md             #   ↓
├── vm2-audit-zero-check.json           #   ↓
├── vm2-audit-...                       #   ...
│
├── .vm2-audit-missing-boolean.status   # Status files (success/failed + time)
├── .vm2-audit-zero-check.status        #   ↓
├── .multi-model-validate.log           # Multi-model validation log (if enabled)
└── ...                                 #   ...
```

## Standardized Output Format

Each skill produces TWO output files:
- **{skill-name}.md** - Human-readable markdown report with summary table and findings
- **{skill-name}.json** - Machine-readable JSON for automated parsing/aggregation

The combined `findings.json` is created by merging individual JSON files: `jq -s '.' *.json`

## Finding ID Convention

Format: `{skill-name}-{filename}-{line}-{subtype}`

Example: `vm2-audit-missing-boolean-alu-123-SEL`

## Usage

### Basic Usage

```bash
# Run all audit skills with defaults (4 parallel jobs)
./run-all-audits.sh

# Run with 8 parallel jobs
./run-all-audits.sh -j 8

# Run specific skills only
./run-all-audits.sh -s vm2-audit-missing-boolean -s vm2-audit-zero-check

# Specify output directory
./run-all-audits.sh -o ./my-audit-results

# Use a different model
./run-all-audits.sh -m opus

# Target specific path
./run-all-audits.sh -t pil/vm2/alu.pil
```

### Re-run Summarizer Only

```bash
# Skip audit runs, just summarize existing results
./run-all-audits.sh --summarize-only

# Or run summarizer directly
./summarize-audits.sh -o ./audit-results
```

### Multi-Model Validation (Optional)

Cross-validate findings with Gemini and GPT via PAL MCP. Creates an additional
`MULTI-MODEL-SUMMARY.md` file (does not replace `SUMMARY.md`).

```bash
# Run full audit with multi-model validation
./run-all-audits.sh --multi-model-summary

# Run multi-model validation on existing results
./run-all-audits.sh --summarize-only --multi-model-summary

# Or run summarizer directly with multi-model
./summarize-audits.sh -o ./audit-results --multi-model-summary

# Via environment variable
EXTRA_MULTI_MODEL_SUMMARY=1 ./run-all-audits.sh
```

**Note:** Requires PAL MCP server to be configured. If not available, the
multi-model step will fail gracefully and the primary `SUMMARY.md` remains intact.

### Skip Summarization

```bash
# Run audits but don't summarize (for incremental work)
./run-all-audits.sh --no-summarize
```

## How It Works

### 1. Orchestrator (run-all-audits.sh)

The orchestrator manages parallel execution using bash job control:

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

### 2. Skill Execution

Each skill runs as an independent Claude Code session:

```bash
claude -p "Run the /${skill} audit on ${TARGET_PATH}..." \
    --model "$MODEL" \
    --allowedTools "Read,Glob,Grep,Bash,Write,Edit" \
    --output-format text \
    > "${skill}.md"
```

The skill's `SKILL.md` file provides:
- Vulnerability description
- Audit methodology
- Search patterns
- Test procedures
- Fix patterns

### 3. Summarizer (summarize-audits.sh)

The summarizer:
1. Merges all `*.json` files into `findings.json` (`jq -s '.' *.json`)
2. Combines all `*.md` results for Claude analysis
3. Sends to Claude with a structured prompt
4. Extracts findings by severity
5. Generates actionable recommendations

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_JOBS` | 4 | Max parallel Claude instances |
| `OUTPUT_DIR` | `./audit-results` | Output directory |
| `TARGET_PATH` | `pil/vm2` | Path to audit |
| `MODEL` | `sonnet` | Claude model to use |
| `EXTRA_MULTI_MODEL_SUMMARY` | `false` | Enable multi-model validation (same as `--multi-model-summary`) |

### Model Selection

- **sonnet** (default): Good balance of speed/quality
- **opus**: More thorough, slower, higher cost
- **haiku**: Fast but less thorough

## Cost Considerations

Running all 25 skills will invoke Claude multiple times. Approximate costs:
- **Sonnet**: ~$0.50-2.00 per full run
- **Opus**: ~$5-15 per full run

Use `-j 2` or lower for cost-conscious runs, or `-s` to run specific skills.

## Troubleshooting

### Skill Failed

Check the individual output file:
```bash
cat audit-results/vm2-audit-missing-boolean.md
```

### High Memory Usage

Reduce parallelism:
```bash
./run-all-audits.sh -j 2
```

### Summarizer Fails

The combined file may be too large. Run summarizer manually on a subset:
```bash
./summarize-audits.sh -o audit-results
```
