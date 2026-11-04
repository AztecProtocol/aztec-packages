---
name: analyze-logs
description: |
  Deep-read test logs and extract relevant information. Runs in separate context to avoid polluting the main conversation. Accepts local file paths (preferred) or hashes. Returns condensed summaries, not raw logs.
---

# CI Log Analysis Agent

Read the given log(s) and return a condensed summary; do not paste raw logs. You run in a separate context so that large logs stay out of the main conversation.

## Input

You will receive:
- **Log path**: Local file path (preferred, e.g., `/tmp/343c52b17688d2cd.log`) OR hash
- **Focus area**: One of:
  - `"errors"` - Find all errors/warnings
  - `"test <name>"` - Analyze specific test
  - `"timeout"` - Investigate timeout failure
  - `"comparison with <path>"` - Compare two logs
  - Custom question about the logs
- **Optional**: Second log path for comparison

## Output Format

Return a condensed summary:

```
## Summary
[2-3 sentence overview of what you found]

## Jest Report (from end of logs)
- **Failed tests**: test_name_1, test_name_2
- **Assertion**: `Expected X to equal Y`
- **Stack trace** (abbreviated):
  ```
  [Key lines from stack trace]
  ```

## Key Events Timeline

**IMPORTANT**: Include BOTH absolute timestamps (for referencing original logs) AND relative offsets from test start (for easier understanding and cross-run comparison). Include the **actor** column when logs come from multi-node tests.

| Time | Offset | Actor | Level | Module | Event |
|------|--------|-------|-------|--------|-------|
| 11:18:42 | +0.0s | | INFO | e2e | Running test my_test |
| 11:18:44 | +2.1s | validator-0 | INFO | sequencer | Building block |
| 11:18:47 | +5.3s | validator-0 | ERROR | sequencer | Failed to build block |
| 11:18:50 | +8.0s | node-0 | WARN | p2p | Connection timeout |

(Offset = seconds since "Running test" marker. Makes it easy to compare timing between failed and successful runs.)

## Relevant Log Snippets
### [Context 1: What this shows]
```
[5-10 relevant log lines]
```

### [Context 2: What this shows]
```
[5-10 relevant log lines]
```

## Observations
- [Key observation 1]
- [Key observation 2]

## Comparison (if applicable)
- **Divergence point**: [Where logs start differing]
- **Missing in failed run**: [Events present in success but not failure]
- **Timing differences**: [Operations that took longer]
```

## Log Types

Every ci3 test log starts with a header printed by `ci3/exec_test`: `Command:`, `Commit:`, `Env:`, `Date:`, `System:`, `Resources:` (CPU list, memory, timeout) and `History:` (dashboard link to earlier runs of the same command). Look for the failure pattern of the tool that ran:

| Tool | Failure pattern |
|------|-----------------|
| ci3 test runner (`run_test_cmd`) | `FAILED (<log link>): <command> (<N>s) (code: <exit code>)`; also `FLAKED` and `PASSED` |
| barretenberg gtest | `[  FAILED  ] Suite.Test` |
| forge (`l1-contracts`) | `[FAIL` at the start of a test line |
| `nargo test` | `[<package>] Testing <name> ... FAIL`, followed by the message |
| Jest (labs `yarn-project` e2e) | `FAIL src/...test.ts` in the Jest report at the end |

The sections from "Log Format" to "Comparative Analysis" describe labs `yarn-project` (Jest and e2e) logs. They do not apply to barretenberg, l1-contracts or noir-projects logs.

## Log Format

Aztec (labs `yarn-project`) logs follow this format:
```
HH:MM:SS [HH:MM:SS.mmm] LEVEL: module [actor] [instanceId] Message {optional json}
```

- **module**: Always present. The component emitting the log (colon-separated hierarchy).
- **actor**: Optional. Identifies *which process/node* is emitting the log in multi-node tests (e.g., `validator-0`, `node-1`, `prover-0`). Only set in e2e tests that spin up multiple nodes.
- **instanceId**: Optional. Identifies *which instance* of a component within a single process (e.g., `checkpoint-5`, `epoch-3`). Used when multiple instances of the same component exist concurrently (e.g., one epoch-proving-job per epoch).

Both `actor` and `instanceId` appear between the module name and the message in pretty-printed output.

Examples:
```
11:18:42 [11:18:42.518] WARN: node:blob-client:client No L1 consensus host urls configured
11:18:42 [11:18:42.562] INFO: world_state Created world state synchroniser with block history of 2
11:18:44 [11:18:44.100] INFO: sequencer validator-0 Building block 1
11:18:45 [11:18:45.200] INFO: checkpoint-builder validator-1 checkpoint-5 Building block 1
```

In the last two examples:
- `validator-0` / `validator-1` is the **actor** (which node)
- `checkpoint-5` is the **instanceId** (which checkpoint instance)

To isolate one node's log stream, filter by the actor name (for example, grep for `validator-0`). Within one actor, instance IDs separate concurrent instances of a component. For example, epoch-proving-jobs spawn one per epoch:
```
INFO: epoch-proving-job prover-0 epoch-3 Starting proof generation
INFO: epoch-proving-job prover-0 epoch-4 Starting proof generation
```
Here `prover-0` is the actor and `epoch-3`/`epoch-4` are instance IDs.

**Levels** (in priority order for investigation):
1. `ERROR` - Always investigate
2. `WARN` - Often important
3. `INFO` - General progress
4. `VERBOSE` - Detailed operations
5. `DEBUG` - Low-level details

**Module path**: Colon-separated hierarchy indicating source:
- `node:*` - Node components
- `sequencer:*` - Block building
- `p2p:*` - Peer networking
- `archiver:*` - Chain data indexing
- `world-state:*` - Merkle tree state
- `e2e:*` - Test code itself (high value!)
- `validator:*` - Consensus validation

## Test Execution Patterns

### Test Markers

**Critical**: `Running test TESTNAME` indicates test start.

When analyzing a specific test, **ONLY analyze logs between test markers** - logs from other tests are noise.

Use the `extract-test-logs.sh` script to extract just the relevant test's logs. It is in the labs submodule, so `labs/` must be checked out:

```bash
labs/yarn-project/.claude/scripts/extract-test-logs.sh /tmp/log.log "test name here"
```

The script:
- Finds the "Running test <name>" marker
- Extracts logs from that marker until the next test (or end of file)
- On success: outputs extracted logs to stdout
- On failure (test not found): prints error + lists available tests, exits with code 1
- On failure (file not found): prints error, exits with code 2

Example:
```bash
# Extract logs for a specific test
labs/yarn-project/.claude/scripts/extract-test-logs.sh /tmp/abc123.log "does not prune if proof lands" > /tmp/test-extract.log

# Then analyze the extracted logs
grep -i "error\|warn" /tmp/test-extract.log
```

### Test Phases

1. **Setup phase**: L1 contract deployment, node creation
2. **Execution phase**: The actual test code
3. **Teardown phase**: Cleanup, signalled by `stopping`, `cleanup`, `teardown` keywords

### Hooks

- `beforeAll` - Runs once before all tests; failure prevents all tests from running
- `beforeEach` - Runs before each test
- `afterEach` - Runs after each test; failure can cascade to subsequent tests
- `afterAll` - Runs once after all tests

Hook failures appear before/after test markers.

### Jest Report

**Always check the Jest report at the very end of logs first!**

It contains:
- Which tests passed/failed
- Failure assertion and stack trace
- Total runtime

Look for:
```
FAIL src/e2e_something.test.ts
  ● Test suite name › test name
    Expected: X
    Received: Y
```

## High-Value Log Sources

### Test Logs (`e2e:*`)

Logs from the test itself signal test actions:
```
INFO: e2e:e2e_test_name Deploying contract...
INFO: e2e:e2e_test_name Sending transaction...
INFO: e2e:e2e_test_name Waiting for block...
```

### Chain Monitor Logs

Pattern: `e2e:<test-name>` with chain state info:
```
INFO: e2e:e2e_epochs:epochs_l1_reorgs L1 block 23 mined at 11:15:14 with new checkpoint 1 for epoch 0 with proof up to checkpoint 0 for epoch 0 starting new epoch 0  {"currentTimestamp":1769166919,"l1Timestamp":1769166914,"l1BlockNumber":23,"l2SlotNumber":3,"l2Epoch":0,"checkpointNumber":1,"provenCheckpointNumber":0,"totalL2Messages":0,"committee":[]}
```

This tells you:
- L1/L2 block numbers
- Checkpoint and epoch status
- Proof progress
- Committee state

## Timeout Investigation

Many failures are timeouts: an action was executed, but the expected reaction didn't occur.

For timeouts:
1. **What action was being performed?** Look for the last `e2e:*` log before timeout
2. **What reaction was expected?** Usually waiting for: block, transaction, proof
3. **Why didn't it happen?** Search for:
   - Blocked operations
   - Missing events
   - Stuck processes
   - Error logs from relevant components
4. **Check prerequisites**: Was the system in the right state?

## Comparative Analysis

When comparing failed vs successful runs:

1. **Align by test markers**: Find `Running test X` in both logs
2. **Find divergence point**: Where do logs start differing?
3. **Look for missing entries**: Events in success but not failure
4. **Check timing**: Are operations slower in failed run?

Do not use `diff` as an analysis, since timestamps or random values will mean that runs are completely different. Instead, isolate the ordering and time offsets of important events, and compare those.

## Key Behavior

1. **Use the local file if provided**; never re-download. If you only have a hash or a `ci.aztec-labs.com` URL and `/tmp/<hash>.log` does not exist, download it from the repo root with `./ci.sh dlog <hash> > /tmp/<hash>.log 2>&1`. This needs a redis tunnel or `CI_PASSWORD`.
2. Find the failure first: the Jest report at the end for labs logs, or the tool's failure pattern from "Log Types".
3. For one test, grep for `Running test <name>` and extract only that test's logs.
4. For huge logs (>10k lines), grep for ERROR/WARN first, then expand context. Read `e2e:*` and chain-monitor logs to see test actions and system state.
5. For a timeout, trace which action was waiting and why it did not complete. When comparing, align by test markers and find the divergence point.
6. **Return a summary, not raw content**: extract only relevant snippets.
