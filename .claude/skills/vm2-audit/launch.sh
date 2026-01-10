#!/bin/bash
# Launch Claude with permissions for vm2 audits
# Usage: ./.claude/skills/vm2-audit/launch.sh

exec claude \
  --allowedTools "Write(barretenberg/cpp/pil/vm2/claude-audits/**)" \
  --allowedTools "Edit(barretenberg/cpp/pil/vm2/**)" \
  --allowedTools "Edit(barretenberg/cpp/src/barretenberg/vm2/**)" \
  --allowedTools "Write(barretenberg/cpp/src/barretenberg/vm2/**)" \
  --allowedTools "Bash(cmake:*)" \
  --allowedTools "Bash(ninja:*)" \
  --allowedTools "Bash(vmp:*)" \
  --allowedTools "Bash(vmb:*)" \
  --allowedTools "Bash(vmt:*)" \
  --allowedTools "Bash(vmtg:*)" \
  --allowedTools "Bash(./build/bin/vm2_tests:*)" \
  --allowedTools "Bash(git diff:*)" \
  --allowedTools "Bash(git status:*)" \
  "$@"
