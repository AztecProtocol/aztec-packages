---
name: ci-log-reader
description: Investigate CI failures by following log links from ci.aztec-labs.com. Given a GitHub Actions URL, PR number, or direct CI log URL, fetch logs and recursively follow nested log links to trace the root cause of build or test failures.
---

# CI Log Reader

## When to Use
Use this skill when investigating CI failures. It helps trace through the hierarchy of CI logs to find the actual error message.

## CI System Overview

The Aztec CI system stores logs at `ci.aztec-labs.com`. Log entries contain URLs in the format:
- `http://ci.aztec-labs.com/<hash>` - Links to nested logs

When a CI step runs, it spawns sub-tasks with their own log URLs. Follow these links recursively to find the actual error.

## How to Fetch Logs
From repo root
```
./ci.sh dlog <hash>
```

## Investigation Steps

1. **Get the initial log** from the GitHub Actions URL or direct CI link
2. **Parse for nested links** - look for `http://ci.aztec-labs.com/<hash>` patterns
3. **Identify failures** - lines with `FAIL`, `ERROR`, or non-zero exit codes
4. **Follow the failing link** - fetch the nested log for failed steps
5. **Repeat** until you find the actual error (compiler errors, test failures, stack traces)

## Log Patterns

```
Executing: <command> (http://ci.aztec-labs.com/<hash>)  # Command output at this hash
... done (Xs)                                            # Success
... FAIL (Xs)                                           # Failure - follow this link!
```

## Output Format

Provide:
1. **Log trail**: Chain of CI URLs followed with brief descriptions
2. **Root cause**: The actual error message found
3. **Suggested fix**: If the error is clear, suggest what might fix it
