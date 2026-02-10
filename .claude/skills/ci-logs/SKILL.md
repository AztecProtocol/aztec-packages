---
name: ci-logs
description: Analyze CI logs from ci.aztec-labs.com. Use this instead of WebFetch for CI URLs.
user-invocable: true
arguments: <url-or-hash>
---

# CI Log Analysis

When you need to analyze logs from ci.aztec-labs.com, use the Task tool to spawn the analyze-logs agent.

## Usage

1. **Extract the hash** from the URL (e.g., `http://ci.aztec-labs.com/e93bcfdc738dc2e0` → `e93bcfdc738dc2e0`)

2. **Spawn the analyze-logs agent** using the Task tool:

```
Task(
  subagent_type: "analyze-logs",
  prompt: "Analyze CI log hash: <hash>. Focus: errors",
  description: "Analyze CI logs"
)
```

## Examples

**User asks:** "What failed in http://ci.aztec-labs.com/343c52b17688d2cd"

**You do:**
```
Task(
  subagent_type: "analyze-logs",
  prompt: "Analyze CI log hash: 343c52b17688d2cd. Focus: errors. Download with: yarn ci dlog 343c52b17688d2cd > /tmp/343c52b17688d2cd.log",
  description: "Analyze CI failure"
)
```

**For specific test analysis:**
```
Task(
  subagent_type: "analyze-logs",
  prompt: "Analyze CI log hash: 343c52b17688d2cd. Focus: test 'my test name'",
  description: "Analyze test failure"
)
```

## Do NOT

- Do NOT use WebFetch to access ci.aztec-labs.com (requires auth)
- Do NOT try to curl the URL directly
- Always use the analyze-logs agent which knows how to use `yarn ci dlog`
