# VM2 Audit Skills

Audit skills for the AVM/VM2 proving system, used with [Claude Code](https://claude.com/claude-code) to perform systematic security audits of the VM2 PIL constraint system.

Each skill is a markdown file (`SKILL.md`) containing audit instructions for a specific vulnerability class. The batch runner reads these files and passes them directly to Claude Code sessions — no installation or symlinking required.

**Warning:** These skills were authored entirely by Claude and have not been manually verified. Treat all findings as leads that require human review, not as confirmed vulnerabilities. Running these skills is _not_ a substitute for a comprehensive manual audit.

## What's included

| Tier | Focus |
|------|-------|
| T0 | Opcode cross-layer consistency (semantics, operands, wire format, gas, tags, etc.) |
| T1 | Constraint/relation soundness (ghost rows, selectors, booleans, range checks, etc.) |
| T2 | Constraint logic (dead columns, typos, error aggregation, initialization, etc.) |
| T3 | Witness/soundness (memory injection, premature termination, tag validation, etc.) |
| T4 | Prover/verification (discard handling, Fiat-Shamir, opcode dispatch, etc.) |

Use `scripts/run-vm2-audits.sh --list-skills` to see the full list with counts per tier.

## Running audits

**Cost warning:** Each skill spawns a full Claude Code session that reads large portions of the codebase. Running all skills will burn through Claude session limits quickly and is expensive. Start with a single tier or skill to calibrate, and use `--jobs` to control parallelism.

From `barretenberg/cpp`:

```bash
# List available skills
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --list-skills

# Run all audit tiers (expensive — each skill spawns a full Claude session)
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --output-dir ./audit-results

# Run specific tiers (comma-separated or ranges like 1-3)
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --tiers 1,2 --output-dir ./audit-results

# Run a single skill
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --skill vm2-audit-t1-missing-boolean --output-dir ./audit-results

# Use a specific model (default is sonnet)
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --model opus --output-dir ./audit-results

# Target a specific file or subdirectory (default: pil/vm2)
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --target pil/vm2/alu.pil --output-dir ./audit-results

# Control parallelism (default: 4)
.vm2-audit-claude-skills/scripts/run-vm2-audits.sh --jobs 5 --tiers 1 --output-dir ./audit-results

# Summarize results
.vm2-audit-claude-skills/scripts/summarize-audits.sh ./audit-results
```

See [scripts/README.md](scripts/README.md) for full usage, prerequisites (PAL MCP for multi-model validation), and advanced options.

## How it works

The batch runner (`run-vm2-audits.sh`) reads each skill's `SKILL.md` and inlines it into the prompt for a `claude -p` session. Each session runs with `--disable-slash-commands` so no other skills are loaded into the system prompt — only the one skill being run. This keeps sessions lean and avoids context window bloat.
