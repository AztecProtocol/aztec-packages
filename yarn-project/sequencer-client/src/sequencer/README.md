# Sequencer Timing Model

This document covers how the sequencer schedules its work within a slot. See the [package README](../../README.md) for the high-level architecture; this one focuses on the timing math and the state-machine deadlines.

The model described here is for **proposer pipelining**, the only mode the production sequencer runs in (the proposer always builds for `slot + 1`). The deterministic single-sequencer `AutomineSequencer` used in some e2e tests publishes synchronously in-slot and does not use this timing model.

## Overview

Block production runs on three nested clocks:

- A **slot** is a fixed window (e.g. 72 s) during which one elected proposer is allowed to build.
- A slot contains several equal-length **sub-slots** (e.g. 8 s). Each sub-slot owns the budget for one L2 block and has a deadline fixed relative to the slot start.
- All blocks built within one slot make up one **checkpoint**, which is what eventually goes on L1.

Under pipelining, the proposer for slot `N` does its building inside slot `N - 1` ("build slot"). Slot `N` ("target slot") is only used to mine the L1 transaction. This shifts work like this:

| Phase                          | When           |
| ------------------------------ | -------------- |
| Initialization                 | slot `N - 1`   |
| Block building                 | slot `N - 1`   |
| Checkpoint proposal broadcast  | slot `N - 1`   |
| Last-block re-execution        | slot `N - 1`   |
| Attestation collection         | slot `N - 1`   |
| L1 submission                  | slot `N`       |

The wall-clock slot the sequencer is reasoning about ("build slot") and the slot the checkpoint commits to ("target slot") are always `N - 1` and `N` respectively.

## Sub-slots

Each sub-slot has a fixed start time and a fixed deadline, both relative to the slot start:

```
subSlotStart[k]    = initializationOffset + (k - 1) * blockDuration
subSlotDeadline[k] = initializationOffset + k * blockDuration
```

with `k = 1, 2, ..., maxNumberOfBlocks`. Deadlines do **not** shift based on when the previous block finished. If a block finishes early, the sequencer waits for the next sub-slot to begin (so validators see a regular cadence). If it finishes late, the next block has correspondingly less time.

`canStartNextBlock(secondsIntoSlot)` walks the sub-slot list and returns the first one with at least `minExecutionTime` left before its deadline. Sub-slots that no longer have enough headroom are skipped entirely.

### Number of sub-slots

The maximum number of buildable blocks per slot is:

```
timeReservedAtEnd      = checkpointAssembleTime
                       + 2 * p2pPropagationTime    // proposal out + attestations back
                       + blockDuration             // last-block re-execution

timeAvailableForBlocks = aztecSlotDuration
                       - checkpointInitializationTime
                       - timeReservedAtEnd

maxNumberOfBlocks      = floor(timeAvailableForBlocks / blockDuration)
```

The reservation at the end of the slot is sized so that, on the happy path, attestations are in hand by the time the target slot starts. The enforced `COLLECTING_ATTESTATIONS` and `PUBLISHING_CHECKPOINT` deadlines are softer (see the deadline table below) and let a late attestation spill into the target slot. L1 publishing is **not** included in `timeReservedAtEnd` — that is paid for by the target slot.

### Cooldown after the last sub-slot

All `maxNumberOfBlocks` sub-slots build a block. The cooldown lives in the `timeReservedAtEnd` window that follows the last sub-slot:

- 1 × `checkpointAssembleTime` to assemble and sign the checkpoint,
- 1 × `p2pPropagationTime` for the `CheckpointProposal` to reach the committee,
- 1 × `blockDuration` for the committee to re-execute the last block,
- 1 × `p2pPropagationTime` for attestations to come back.

These four windows total `checkpointAssembleTime + blockDuration + 2 * p2pPropagationTime`, exactly the `timeReservedAtEnd` formula above. The block built in the last sub-slot is *not* broadcast as a regular `BlockProposal`; the proposer holds it as `blockPendingBroadcast` so it travels bundled inside the `CheckpointProposal`.

## Timing constants

These constants come from `@aztec/epoch-cache` (see `epoch-cache/src/timetable.ts`). Some are fixed across the network, some are inputs from configuration.

| Constant                          | Source                                  | Typical value | Purpose                                              |
| --------------------------------- | --------------------------------------- | ------------- | ---------------------------------------------------- |
| `aztecSlotDuration`               | L1 rollup contract                      | 72 s          | Length of one Aztec slot.                            |
| `ethereumSlotDuration`            | L1 rollup contract                      | 12 s          | Length of one Ethereum slot.                         |
| `blockDuration`                   | `blockDurationMs` config                | 6–8 s         | Sub-slot length.                                     |
| `checkpointInitializationTime`    | constant (`CHECKPOINT_INITIALIZATION_TIME`) | 1 s       | Estimated sync + proposer check time.                |
| `checkpointAssembleTime`          | constant (`CHECKPOINT_ASSEMBLE_TIME`)   | 1 s           | Time to assemble and sign the checkpoint after the last block. |
| `p2pPropagationTime`              | `attestationPropagationTime` config     | 2 s           | One-way p2p estimate (proposals, attestations).      |
| `l1PublishingTime`                | `l1PublishingTime` config               | 12 s          | Time reserved for the L1 tx to land. Used by the target slot, not the build slot. |
| `minExecutionTime`                | constant (`MIN_EXECUTION_TIME`)         | 2 s           | Minimum headroom to start a block.                   |
| `initializationOffset`            | `=checkpointInitializationTime`         | 1 s           | Where sub-slot 1 starts.                             |

## Deadlines

`SequencerTimetable.getMaxAllowedTime(state)` returns the latest second-into-slot a given state is allowed to be entered. `assertTimeLeft()` throws `SequencerTooSlowError` if the slot has already advanced past that deadline. Sub-slot scheduling is measured against the build slot (`slotNow`); state assertions, however, are measured against whichever slot `setState` was called with — for the publishing path that is the target slot, which is why the publishing deadline is allowed to exceed `aztecSlotDuration`.

| State                       | Max allowed time (seconds into build slot)                                  |
| --------------------------- | --------------------------------------------------------------------------- |
| `PROPOSER_CHECK`            | `initializeDeadline = aztecSlotDuration - (checkpointInitializationTime + 2*minExecutionTime)` |
| `INITIALIZING_CHECKPOINT`   | same as `PROPOSER_CHECK`                                                    |
| `WAITING_FOR_TXS`           | `initializeDeadline + checkpointInitializationTime`                         |
| `CREATING_BLOCK`            | same as `WAITING_FOR_TXS`                                                   |
| `WAITING_UNTIL_NEXT_BLOCK`  | same as `WAITING_FOR_TXS`                                                   |
| `ASSEMBLING_CHECKPOINT`     | `aztecSlotDuration + pipeliningAttestationGracePeriod`                      |
| `COLLECTING_ATTESTATIONS`   | same as `ASSEMBLING_CHECKPOINT`                                             |
| `PUBLISHING_CHECKPOINT`     | `2 * aztecSlotDuration - ethereumSlotDuration` (extends into the target slot) |

In production-like timing, `pipeliningAttestationGracePeriod` is zero, so `ASSEMBLING_CHECKPOINT` and
`COLLECTING_ATTESTATIONS` must be *entered* before the build-slot boundary. Local networks with
`l1PublishingTime < ethereumSlotDuration` can use the target-slot attestation window as grace while preserving the
L1-geometry publishing cutoff. Once entered, attestation collection itself has its own
`checkpointAttestationDeadline = 2 * aztecSlotDuration - ethereumSlotDuration`, so a late attestation arriving after
the boundary is still accepted. The publishing deadline extends into the target slot because that is when the L1 tx is
actually submitted.

## Example: 72 s slot, 8 s sub-slots

With typical pipelining values:

```
checkpointInitializationTime = 1s
blockDuration               = 8s
checkpointAssembleTime      = 1s
p2pPropagationTime          = 2s
l1PublishingTime            = 12s

timeReservedAtEnd      = 1 + 2*2 + 8       = 13s
timeAvailableForBlocks = 72 - 1 - 13       = 58s
maxNumberOfBlocks      = floor(58 / 8)     = 7
```

Seven sub-slots, all of which build a block:

```
Sub-slot 1: starts 1s,  deadline 9s    (Block 1)
Sub-slot 2: starts 9s,  deadline 17s   (Block 2)
Sub-slot 3: starts 17s, deadline 25s   (Block 3)
Sub-slot 4: starts 25s, deadline 33s   (Block 4)
Sub-slot 5: starts 33s, deadline 41s   (Block 5)
Sub-slot 6: starts 41s, deadline 49s   (Block 6)
Sub-slot 7: starts 49s, deadline 57s   (Block 7 — held for the checkpoint proposal)

57s:  Block 7 done, ASSEMBLING_CHECKPOINT (1s)
58s:  CheckpointProposal broadcast
60s:  Committee receives proposal (+2s p2p)
60-68s: Committee re-executes Block 7
68s:  Committee sends attestations
70s:  Proposer has the quorum (+2s p2p)

70-72s: Slack
72s:  Build slot ends → L1 submission starts (target slot begins)
84s:  L1 tx mined inside the target slot (+12s)
```

## Parallel execution: proposer vs committee

While the proposer builds block `k+1`, the committee is re-executing block `k`. The pipeline keeps both sides busy except for the cooldown sub-slot.

```
Time | Proposer                     | Committee
-----|------------------------------|--------------------------------------
1s   | Start Block 1                | (idle)
9s   | Finish Block 1, broadcast    |
9s   | Start Block 2                |
11s  |                              | Receive Block 1 (9s + 2s)
     |                              | Re-execute Block 1
17s  | Finish Block 2, broadcast    |
17s  | Start Block 3                |
19s  |                              | Finish Block 1 (11s + 8s)
     |                              | Receive Block 2 (17s + 2s)
     |                              | Re-execute Block 2
...
49s  | Finish Block 6, broadcast    |
49s  | Start Block 7 (last)         |
51s  |                              | Receive Block 6 (49s + 2s)
     |                              | Re-execute Block 6
57s  | Finish Block 7 (held)        |
     | ASSEMBLING_CHECKPOINT (1s)   |
58s  | Broadcast CheckpointProposal |
59s  |                              | Finish Block 6 (51s + 8s)
60s  |                              | Receive Block 7 + Checkpoint (58s + 2s)
     |                              | Re-execute Block 7
68s  |                              | Send attestations (60s + 8s)
70s  | Receive attestations         |
70-72s| Slack                       |
72s  | L1 tx submitted              |
84s  | L1 tx mined                  |
```

**Observations**:

- Validators always lag the proposer by ~2 s (one p2p hop).
- For the last block there is no `k+1` to build alongside; once the proposer broadcasts the `CheckpointProposal`, it just waits while the committee re-executes.
- L1 publishing happens entirely inside the next slot and does not steal time from block building.

## Handling timing variations

### Fast initialization (0.5 s instead of 1 s)

Sub-slot 1's deadline is still 9 s, so Block 1 gets a 0.5 s bonus before hitting its deadline. No structural change.

### Slow initialization (2 s instead of 1 s)

Block 1 has 7 s of build time instead of 8 s. Still well above `minExecutionTime`, so the block still gets built. No sub-slots are skipped.

### Very slow initialization (8 s)

Sub-slot 1's deadline (9 s) is closer than `minExecutionTime` (2 s), so it is skipped entirely. The first attempted block runs in sub-slot 2 with the usual budget. The checkpoint will have one fewer block.

### Block takes longer than its budget

`CheckpointBuilder` enforces the deadline by stopping public-tx execution; in practice a block can only overrun by the time it takes to finalize the block (typically < 1 s). The next sub-slot starts as scheduled but with proportionally less headroom. If that headroom drops below `minExecutionTime`, the next sub-slot is skipped.

### Block finishes early

The sequencer transitions to `WAITING_UNTIL_NEXT_BLOCK` and sleeps until the next sub-slot start. This keeps the cadence regular and gives validators predictable arrival times for re-execution.

### Block proposal returns insufficient txs

The current sub-slot is dropped without committing anything. The loop retries on the next sub-slot. If `buildCheckpointIfEmpty` is true, the last sub-slot is forced through with whatever is available, including zero txs.

### Build slot ends before attestations arrive

`assertTimeLeft` will reject `PUBLISHING_CHECKPOINT` if the attestation deadline has passed; the slot is abandoned, and
`checkpoint-publish-failed` is emitted. The `PUBLISHING_CHECKPOINT` deadline allows spillover into the target slot
(`2 * aztecSlotDuration - ethereumSlotDuration`) precisely to absorb a small overrun.

### Pipelined parent fails on L1

Before submitting, the job calls `waitForValidParentCheckpointOnL1`. If the parent we built on top of did not land cleanly (wrong archive, missing attestations, etc.) the job discards its checkpoint, emits `pipelined-checkpoint-discarded`, and enqueues an invalidation for the parent so the next proposer doesn't get stuck on the same bad ancestor.

## Configuration constraints

`initializeDeadline` must be positive, so `aztecSlotDuration > checkpointInitializationTime + 2 * minExecutionTime`. With defaults that lower bound is 5 s, far below any realistic slot length.

For multi-block production to make sense, `maxNumberOfBlocks ≥ 2`:

```
aztecSlotDuration ≥ checkpointInitializationTime
                  + 2 * blockDuration                // two blocks
                  + checkpointAssembleTime
                  + 2 * p2pPropagationTime
                  + blockDuration                    // last-block re-execution window
```

Block duration should be ≥ `minExecutionTime` (otherwise no sub-slot ever has enough headroom). `p2pPropagationTime` should be measured against the deployment's actual p2p latency: it directly determines how much of each slot is spent on the cooldown.

`l1PublishingTime` should fit inside the Ethereum slot the target slot maps to. The default of 12 s lines up with one
Ethereum slot; fast local networks may reduce it to use the target-slot attestation window as assembly and attestation
grace.
