# Sequencer Timing Model

## Overview

The Aztec sequencer operates in fixed-duration **slots** (typically 72 seconds). During each slot, a designated proposer builds one or more **blocks** containing transactions, then collects a single round of attestations for the entire **checkpoint** from validators, and finally publishes the resulting checkpoint to L1 Ethereum.

This document explains how time is allocated within a slot to ensure all work completes on schedule.

## Key Concepts

### Slot vs Block vs Checkpoint

- **Slot**: A fixed time window (e.g., 72 seconds) during which a proposer can build blocks
- **Block**: A single batch of transactions, executed and validated
- **Checkpoint**: The collection of all blocks built in a slot, attested by validators and published to L1

In a typical configuration, a 72-second slot contains 6 blocks, each built in 12-second intervals.

### The Two Execution Models

**Single Block Per Slot**: The sequencer builds one large block that uses the entire slot's time budget.

**Multiple Blocks Per Slot**: The sequencer builds blocks at regular intervals (e.g., every 12 seconds). This allows for:
- More frequent state updates during the slot
- Earlier transaction inclusion
- Progressive validation by attestors

This document focuses on the multi-block model, though the single-block case is a simplified version.

## Timing Components

Understanding slot timing requires knowing these time constants:

| Component | Typical Value | Purpose |
|-----------|---------------|---------|
| **Slot Duration** | 72s | Total time available for the entire checkpoint |
| **Block Duration** | 12s | Target time between block starts |
| **Propagation Time** | 2s | Time for messages to travel across the P2P network (one-way) |
| **Block Validation Time** | 1s | Time to finalize checkpoint and prepare proposal message |
| **L1 Publishing Time** | 12s | Time reserved for L1 transaction to land in an Ethereum block |

These values are configurable but must satisfy certain constraints (explained below).

## The Sequencer's Work

When elected as proposer for a slot, the sequencer performs these tasks in order:

### 1. Initialization Phase (Pre-Building)

Before building any blocks, the sequencer must:
- Verify it's the designated proposer
- Check all subsystems are synced
- Initialize checkpoint state
- Prepare global variables

This phase has a deadline (`initializeDeadline`) calculated to ensure enough time remains for all subsequent work. This deadline is the bare minimum to build at least one block.

### 2. Block Building Loop

The sequencer builds blocks at **regular intervals** based on the configured block duration.

#### Blocks 1 through N-1 (non-last blocks)

Each block follows this pattern:
1. Wait for minimum number of transactions (or timeout)
2. Execute transactions (respecting the block deadline)
3. Sign and finalize the block
4. Broadcast block proposal to validators
5. Sleep until next block's scheduled start time

**Block Deadlines**: Each block has a deadline calculated as:
```
deadline = checkpoint_start_time + (block_index + 1) * block_duration
```

Where `checkpoint_start_time` is when initialization completes (NOT the slot start time, since initialization takes time).

This formula ensures **no drift**: if a block finishes late due to heavy execution, the next block simply has less time but still starts on schedule.

#### Last block in the checkpoint

The final block in a slot requires special timing because:
- Validators must finish re-executing the **previous block** before they can start on the last block
- Validators must re-execute the last block before sending attestations
- Attestations must propagate back to the proposer
- The checkpoint must be published to L1

**Critical Constraint**: Validators execute blocks **sequentially**. They cannot start re-executing block N until they've finished re-executing block N-1.

**Last Block Time Budget**:
```
remaining_time = slot_duration - current_time
D = duration of previous block (typically 12s)
M = last block build duration

M <= remaining_time - D - 17s

where 17s = 2 * propagation_time + validation_time + l1_publishing_time
          = 2 * 2s + 1s + 12s
```

This accounts for:
- D seconds for validators to finish re-executing the previous block
- M seconds for validators to re-execute the last block
- 4s for round-trip propagation (2s each way)
- 1s for checkpoint finalization
- 12s for L1 publishing

**Minimum Threshold**: If `M < 3 seconds`, there's insufficient time to build a meaningful last block, so the sequencer stops with the previous block.

**Detecting the Last Block**: When deciding whether to build block N, the sequencer checks:
1. Can we build block N as a regular block (12s) **and** still fit block N+1?
   - Assume block N takes 12s, check if N+1 would fit using formula above
   - If yes: block N is NOT the last block
2. Can we build block N as the last block?
   - Calculate M using actual previous block duration
   - If M >= 3s: block N IS the last block
3. Otherwise: cannot build block N (checkpoint ends with previous block)

### 3. Attestation Collection

After broadcasting the final block and checkpoint proposal:
1. Validators receive the proposal (2s propagation)
2. Validators re-execute all blocks to verify correctness (`M` seconds)
3. Validators sign attestations and broadcast them (2s propagation back)
4. Sequencer collects attestations until reaching quorum threshold (2/3 + 1)

### 4. L1 Publication

Once attestations are collected:
1. Proposer signs over the attestations
2. Proposer submits L1 transaction with checkpoint + attestations
3. Transaction must land in an Ethereum block within the remaining slot time

## Parallel Execution Model

A key aspect of the multi-block design is **parallel execution** between sequencer and validators.

### Timeline Example (12-second blocks)

```
Time | Sequencer               | Validators
-----|-------------------------|---------------------------
0s   | Start building Block 1  | (idle)
12s  | Finish Block 1          | (idle)
     | Broadcast Block 1       |
     | Start building Block 2  |
14s  |                         | Receive Block 1
     |                         | Start re-executing Block 1
24s  | Finish Block 2          | Finish re-executing Block 1
     | Broadcast Block 2       |
     | Start building Block 3  |
26s  |                         | Receive Block 2
     |                         | Start re-executing Block 2
36s  | Finish Block 3          | Finish re-executing Block 2
     | Broadcast Block 3       |
     | Start building Block 4  |
...
```

Notice:
- Validators lag by ~2 seconds (propagation delay)
- While sequencer builds Block N+1, validators re-execute Block N
- This parallelism allows validators to stay "caught up" with the sequencer

### Last Block Synchronization

For the final block, the sequencer must **wait** for validators to complete re-execution. Critically, validators must finish re-executing the **previous block** before they can start on the last block.

**Example**: Slot with 72s duration, Block 4 (penultimate) took 12s, Block 5 (last) takes 3s

```
Time | Sequencer                    | Validators
-----|------------------------------|--------------------------------
40s  | Finish Block 4 (D=12s)       | (re-executing Block 3)
     | Broadcast Block 4            |
     | Start building Block 5 (M=3s)|
42s  | Building Block 5             | Receive Block 4 (40s + 2s prop)
     |                              | Start re-executing Block 4
43s  | Finish Block 5               | Re-executing Block 4...
     | Finalize checkpoint (1s)     |
44s  | Broadcast Checkpoint+Block 5 |
46s  | Waiting for attestations     | Receive Checkpoint + Block 5
     |                              | **Still re-executing Block 4**
54s  | Waiting...                   | Finish re-exec Block 4 (42s+12s)
     |                              | **Now start** re-exec Block 5
57s  | Waiting...                   | Finish re-exec Block 5 (54s+3s)
     |                              | Sign & broadcast attestations
59s  | Receive attestations (57s+2s)|
     | Sign attestations            |
     | Submit to L1                 |
71s  | L1 tx lands (59s + 12s)      |
72s  | Slot ends                    |
```

**Key Insight**: Attestations arrive at `T + D + M + 4s` where:
- T = when sequencer finished building previous block
- D = duration of previous block (how long validators need to re-execute it)
- M = duration of last block
- 4s = round-trip propagation (2s each way)

The sequencer must account for D (previous block duration) even though it's already been built, because validators are still processing it.

## Handling Timing Variations

### Late Block Completion

If a block takes longer than expected (heavy execution, waiting for txs):

```
Expected: Block 2 starts at 12s, deadline at 24s
Reality:  Block 2 starts at 12s, finishes building at 24s, but overhead ends at 25s (1s late)
Result:   Block 3 starts at 24s (on schedule), has 11s to execute instead of 12s
```

The overhead (signing, broadcasting, syncing) eats into the next block's execution time, since it's expected to be under 1s.

### Insufficient Transactions

If not enough transactions are available at block start time:
1. Sequencer waits (up to a limit) for more transactions
2. If deadline approaches, sequencer may:
   - Build a smaller block if enough transactions arrive
   - Skip the block and move to next interval
   - Build an empty block this is the last block

### Early Completion

If a block finishes early (light execution):
```
Expected: Block 2 starts at 12s, deadline at 24s
Reality:  Block 2 finishes at 20s
Result:   Sleep until 24s, then start Block 3 on schedule
```

This prevents "rushing ahead" and maintains consistent block intervals.

## State Machine

The sequencer transitions through these states during a slot:

| State | Time Budget | Purpose |
|-------|-------------|---------|
| **SYNCHRONIZING** | No limit | Wait for all subsystems to sync |
| **PROPOSER_CHECK** | Must complete by `initializeDeadline` | Verify we're the proposer |
| **INITIALIZING_CHECKPOINT** | Must complete by `initializeDeadline` | Set up checkpoint state |
| **WAITING_FOR_TXS** | Until block deadline - 1s | Wait for enough transactions |
| **CREATING_BLOCK** | Until block deadline | Execute transactions and build block |
| **WAITING_UNTIL_NEXT_BLOCK** | Until next block start | Sleep between blocks |
| **FINALIZING_CHECKPOINT** | 1s | Assemble final checkpoint |
| **COLLECTING_ATTESTATIONS** | Until L1 publish deadline | Wait for validator signatures |
| **PUBLISHING_CHECKPOINT** | Until slot end | Submit to L1 |

Each state transition checks that sufficient time remains. If time runs out, a `SequencerTooSlowError` is thrown.

## Example: 72-Second Slot with 12-Second Blocks

Let's walk through a complete slot:

```
T=0s    Slot begins for slot N
T=0-5s  SYNCHRONIZING, PROPOSER_CHECK, INITIALIZING_CHECKPOINT
        (assume this takes 5s, so checkpoint_start_time = 5s)

T=5s    WAITING_FOR_TXS for Block 1
T=5s    CREATING_BLOCK 1 (deadline: 5 + 12 = 17s)
T=16s   Block 1 complete (took 11s)
T=16-17s Overhead: sign, sync, broadcast
T=17s   WAITING_UNTIL_NEXT_BLOCK

T=17s   WAITING_FOR_TXS for Block 2 (started late due to initialization)
T=17s   CREATING_BLOCK 2 (deadline: 5 + 24 = 29s)
T=28s   Block 2 complete
T=28-29s Overhead
T=29s   WAITING_UNTIL_NEXT_BLOCK

T=29s   CREATING_BLOCK 3 (deadline: 41s)
T=40s   Block 3 complete
T=40-41s Overhead
T=41s   WAITING_UNTIL_NEXT_BLOCK

T=41s   CREATING_BLOCK 4 (deadline: 53s)
T=52s   Block 4 complete
T=52-53s Overhead
T=53s   Check if time for another block:
        - remaining = 72 - 53 = 19s
        - M = (19 - 17) / 2 = 1s
        - M < 3s minimum, so Block 4 is the LAST block

T=53s   FINALIZING_CHECKPOINT
T=54s   Checkpoint proposal broadcast
T=56s   Validators receive proposal, start re-executing Block 4
T=62s   Validators finish (6s re-execution time = time Block 4 took to build)
T=62s   COLLECTING_ATTESTATIONS
T=64s   Attestations arrive (2s propagation)
T=65s   Quorum reached

T=65s   PUBLISHING_CHECKPOINT
T=65s   Submit L1 transaction
T=72s   L1 transaction lands in Ethereum block
        (had 7s buffer, since we only needed 12s and allocated more)
```

## Configuration Guidelines

When configuring timing parameters, ensure these constraints are satisfied:

### Minimum Slot Duration

For N blocks per slot:
```
slot_duration >= initialize_deadline + N * block_duration +
                 last_block_duration + validator_reexec_time +
                 2 * propagation_time + validation_time + l1_publishing_time
```

Where:
- `last_block_duration >= 3s` (minimum)
- `validator_reexec_time = last_block_duration` (equal to build time)

### Block Duration Constraints

```
block_duration >= 3s (practical minimum for meaningful execution)
block_duration <= slot_duration / 2 (allow time for at least one block + overhead)
```

### L1 Publishing Time

Must account for Ethereum slot duration (12s) and propagation time. The bare minimum is 8s, since Ethereum allows for txs to be included in a block up until 4s into the slot. However, since we have increased propagation time due to blobs, we should allocate at least the full 12s, or more if we expect high blob congestion on L1.

Recommended: `l1_publishing_time >= ethereum_slot_duration`

### Propagation Time

Should be measured empirically on the actual P2P network, accounting for network latency between geographically distributed validators, and considering that propagation happens over a gossip network including all nodes, as opposed to direct sequencer-to-validator communication.

Typical values: 1-3 seconds
