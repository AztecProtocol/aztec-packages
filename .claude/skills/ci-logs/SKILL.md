---
name: ci-logs
description: Analyze CI logs from ci.aztec-labs.com. Use this instead of WebFetch for CI URLs.
argument-hint: <url-or-hash>
---

# CI Log Analysis

To analyze a log from ci.aztec-labs.com, download it with `./ci.sh dlog` and let the `analyze-logs` subagent read it, so the log stays out of the main context.

## Usage

1. **Extract the hash** from the URL (e.g., `http://ci.aztec-labs.com/e93bcfdc738dc2e0` → `e93bcfdc738dc2e0`). A whole run's id is decimal (`1789731399863940`); the logs nested inside it are hex. Both work with `dlog`.
2. **Check `CI_PASSWORD` is set**, unless you have a redis tunnel. Without one, `CI_PASSWORD` is the only credential that reaches the logs, and the subagent cannot ask for it. If `[ -z "$CI_PASSWORD" ]`, ask the user for the value and pass it to the subagent.
3. **Spawn the `analyze-logs` subagent** with the hash and a focus area (e.g. "errors", "test \<name>", or a custom question). It downloads with `./ci.sh dlog <hash> > /tmp/<hash>.log 2>&1` from the repo root.

## Do NOT

- Do NOT use WebFetch to access ci.aztec-labs.com (requires auth). The `.claude/settings.json` PreToolUse hook (`.claude/scripts/check-ci-url.py`) blocks such fetches unless the URL carries `user:pass@` credentials, and sends you here.
- Do NOT guess or invent a `CI_PASSWORD` value. `dlog` exits with "No redis available and CI_PASSWORD not set for http fallback"; the only fix is to ask the user.
- Do NOT try to curl the URL directly. Use `./ci.sh dlog`.
