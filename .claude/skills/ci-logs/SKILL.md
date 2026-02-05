---
name: ci-logs
description: Analyze CI logs from ci.aztec-labs.com. Use this instead of WebFetch for CI URLs. (project)
user-invocable: true
arguments: <url-or-hash>
---

# CI Log Analysis

When you need to analyze logs from ci.aztec-labs.com, download and analyze the logs directly.

## Usage

1. **Extract the hash** from the URL (e.g., `http://ci.aztec-labs.com/e93bcfdc738dc2e0` → `e93bcfdc738dc2e0`)

2. **Download the logs** using `yarn ci dlog` (must be run from inside yarn-project folder):

```bash
cd yarn-project && yarn ci dlog <hash> > /tmp/<hash>.log
```

3. **Read and analyze** the log file to identify failures

## Examples

**User asks:** "What failed in http://ci.aztec-labs.com/343c52b17688d2cd"

**You do:**
```bash
cd yarn-project && yarn ci dlog 343c52b17688d2cd > /tmp/343c52b17688d2cd.log
```
Then read `/tmp/343c52b17688d2cd.log` and look for errors, test failures, and stack traces.

## Do NOT

- Do NOT use WebFetch to access ci.aztec-labs.com (requires auth)
- Do NOT try to curl the URL directly
- Always use `yarn ci dlog` from inside the yarn-project folder to download logs
