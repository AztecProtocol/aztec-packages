# Sequencer Timing Model

The Aztec sequencer divides each slot into **fixed-duration sub-slots**. Each sub-slot has a pre-defined start and end time based on an initialization offset (how much time we expect syncing the previous slot will take), a finalization time (how much time we need for closing a checkpoint and publishing it to L1), and the configured block duration.

**Example: 72-second slot with 8-second sub-slots**

```
0s:  Slot starts
0-2s: Sync + proposer check (fixed 2s offset)

Sub-slot 1:  2s-10s  → Build Block 1, deadline at 10s
Sub-slot 2:  10s-18s → Build Block 2, deadline at 18s
Sub-slot 3:  18s-26s → Build Block 3, deadline at 26s
Sub-slot 4:  26s-34s → Build Block 4, deadline at 34s
Sub-slot 5:  34s-42s → Build Block 5 (last block), deadline at 42s
Sub-slot 6:  42s-50s → Reserved for validators to re-execute Block 5

42s:  Broadcast checkpoint with Block 5
44s:  Validators receive proposal (2s propagation)
44-52s: Validators re-execute Block 5 (8s)
52s:  Validators send attestations
54s:  Proposer receives attestations (2s propagation)
54-55s: Finalize checkpoint (1s)
55-67s: Publish to L1 (12s)
72s:  Slot ends
```

Deadlines are fixed relative to slot start, not relative to when work actually completes. If you finish initialization at 1s instead of 2s, you get bonus time for Block 1. If you finish at 3s, you have less time. If you finish at 9s, you skip the first sub-slot altogether and start building for the second one.

---

## Overview

The Aztec sequencer operates in fixed-duration **slots** (typically 72 seconds). During each slot, a designated proposer builds multiple **blocks** containing transactions over multiple **sub-slots**, then collects a single round of attestations for the entire **checkpoint** from validators, and finally publishes the resulting checkpoint to L1 Ethereum.

## Key Concepts

### Slot vs Block vs Checkpoint vs Sub-Slot

- **Slot**: A fixed time window (e.g., 72 seconds) during which a proposer can build blocks
- **Block**: A single batch of transactions, executed and validated
- **Checkpoint**: The collection of all blocks built in a slot, attested by validators and published to L1
- **Sub-slot**: A fixed-duration time window within a slot (e.g., 8 seconds) during which a block should be built

In a typical configuration, a 72-second slot contains:
- 1 initialization period (2 seconds)
- 5 block-building sub-slots (8 seconds each = 40 seconds)
- 1 last validator re-execution sub-slot (8 seconds)
- 1 attestation and publishing period (17 seconds)

### The Fixed Sub-Slot Model

Building multiple blocks per slot uses **fixed sub-slots** with predictable deadlines:

1. **Equal-duration sub-slots**: All sub-slots have the same duration (`BLOCK_DURATION`)
2. **Fixed deadlines**: Block N deadline = `initializationOffset + N * BLOCK_DURATION`
3. **Last sub-slot reserved**: The final sub-slot is reserved for validators to re-execute the last block (no block is built during this sub-slot)
4. **Skip if too late**: If we can't start a block with at least `MIN_EXECUTION_TIME` remaining before its deadline, we immediately start building in the next sub-slot

## Timing Components

Understanding slot timing requires knowing these time constants:

| Component | Example Value | Purpose |
|-----------|---------------|---------|
| **Slot Duration** | 72s | Total time available for the entire checkpoint |
| **Block Duration** | 8s | Duration of each sub-slot (time budget for building one block) |
| **Initialization Offset** | 2s | Fixed estimate for sync + proposer check |
| **Propagation Time** | 2s | Time for messages to travel across the P2P network (one-way) |
| **Finalization Time** | 1s | Time to finalize checkpoint and prepare proposal message |
| **L1 Publishing Time** | 12s | Time reserved for L1 transaction to land in an Ethereum block |
| **Min Execution Time** | 3s | Minimum time needed to meaningfully build a block |

These values are configurable but must satisfy certain constraints (explained below). Example values may differ from the ones in the source code.

## Calculating Sub-Slots and Blocks

Given a slot configuration, we calculate how many blocks fit using this formula:

```
timeReservedAtEnd = blockDuration                              (last sub-slot for reexecution)
                  + propagationTime                            (validators receive proposal)
                  + propagationTime                            (attestations come back)
                  + finalizationTime                           (checkpoint finalization)
                  + l1PublishingTime                           (L1 transaction)

timeAvailableForBlocks = slotDuration - initializationOffset - timeReservedAtEnd

numberOfBlocks = floor(timeAvailableForBlocks / blockDuration)
```

**Example with typical values:**
```
timeReservedAtEnd = 8s + 2s + 2s + 1s + 12s = 25s
timeAvailableForBlocks = 72s - 2s - 25s = 45s
numberOfBlocks = floor(45s / 8s) = 5 blocks
```

This means:
- Sub-slots 1-5: Build blocks 1-5
- Sub-slot 6: Reserved for validator re-execution of block 5
- After sub-slot 6: Attestation collection, finalization, and L1 publishing

## The Sequencer's Work

When elected as proposer for a slot, the sequencer performs these tasks:

### 1. Initialization Phase

Before building any blocks, the sequencer must:
- Verify it's the designated proposer
- Check all subsystems are synced
- Initialize checkpoint state
- Prepare global variables

Note that the initialization phase has a **fixed time budget** (`initializationOffset`, typically 2s). This is an *estimate*, not a deadline. The sequencer will take as long as it needs for initialization, but the sub-slot deadlines remain fixed regardless.

### 2. Block Building Loop

The sequencer builds blocks in **fixed sub-slots** based on the configured block duration.

#### Sub-slot deadline calculation

Each sub-slot has a fixed start time and deadline:

```
subSlotStart[N] = initializationOffset + (N - 1) * blockDuration
subSlotDeadline[N] = initializationOffset + N * blockDuration
```

Where N is the sub-slot number (1-indexed).

**Example with 2s offset and 8s block duration:**
```
Sub-slot 1: starts at 2s,  deadline at 10s
Sub-slot 2: starts at 10s, deadline at 18s
Sub-slot 3: starts at 18s, deadline at 26s
Sub-slot 4: starts at 26s, deadline at 34s
Sub-slot 5: starts at 34s, deadline at 42s
```

#### Building a block

For each sub-slot, the sequencer:

1. **Checks if we can start**: If current time is past `deadline - MIN_EXECUTION_TIME`, skip this sub-slot, and start building the block as if it were on the next sub-slot
2. **Waits for transactions** (if needed): Wait up to the deadline for minimum number of transactions
3. **Builds block**: Execute transactions until the deadline of the sub-slot
4. **Signs and broadcasts**: Finalize block and broadcast proposal to validators

**Key point:** The deadline is **fixed** based on the sub-slot number, not based on when the previous block finished.

Note that if a block finishes early, then the sequencer waits until the next sub-slot starts to maintain the regular interval. This prevents "rushing ahead" and keeps the timing predictable. Conversely, if the block finishes later than expected, this "eats into" the time budget for the next block.

#### Waiting for minimum transactions

Before building a block, the sequencer must ensure there are enough transactions in the mempool. This waiting phase has its own timing constraints:

**Configuration:**
- `minTxsPerBlock`: Minimum number of transactions required (configurable, e.g., 1-4)
- Polling interval: 500ms (checks mempool every half-second)
- Deadline: `blockDeadline - 1000ms` (must start building at least 1 second before the block deadline)

**Behavior:**
1. Check current pending transaction count
2. If count >= `minTxsPerBlock`, proceed to build immediately
3. If count < `minTxsPerBlock`, poll every 500ms until either:
   - Enough transactions arrive (proceed to build)
   - Deadline is reached (skip building this block)

**Special cases:**
- **Last block with empty checkpoint allowed**: If `buildCheckpointIfEmpty` is true and this is the last block, skip waiting and force build with 0+ transactions
- **Non-enforced timetable**: If enforcement is disabled, exit immediately if not enough transactions (don't wait)

**Example:**
```
Sub-slot 3 deadline: 26s
Transaction wait deadline: 25s (26s - 1s)
Current time: 20s

20.0s: Check mempool → 2 txs (need 4)
20.5s: Check mempool → 2 txs (need 4)
21.0s: Check mempool → 4 txs (need 4) ✓ Start building!
21-26s: Build block with those 4+ transactions
```

If the deadline (25s) is reached with only 2 transactions, the block is skipped and the sequencer moves to the next sub-slot.

### 3. Last Block and Validator Re-execution

The **last block** is built during the **penultimate sub-slot**. The final sub-slot is reserved for validators to re-execute the last block.

**Why the last sub-slot is reserved:**

Validators execute blocks **sequentially**. While the proposer builds Block N+1, validators are re-executing Block N (with a ~2s delay due to propagation). However, for the **last block**, there's no "Block N+1" to build while validators re-execute. We must wait for them to finish so they can attest.

**Timeline for the last block:**

```
T:      Last block finishes building, checkpoint proposal broadcast
        Last sub-slot begins (duration: blockDuration)
T+2s:   Validators receive proposal (propagation delay)
T+2s to T+2s+blockDuration: Validators re-execute last block
T+2s+blockDuration: Validators finish re-execution, send attestations
T+4s+blockDuration: Proposer receives attestations (propagation delay)
```

**Example with 8s block duration:**
```
42s:    Block 5 finishes, checkpoint broadcast, sub-slot 6 starts
44s:    Validators receive checkpoint (42s + 2s)
44-52s: Validators re-execute Block 5 (8s)
52s:    Validators send attestations
54s:    Proposer receives attestations (52s + 2s)
```

Note that validators finish at `52s`, which is `2s` after the last sub-slot ends at `50s`. This is expected and accounted for in the `timeReservedAtEnd` calculation.

### 4. Attestation Collection and L1 Publishing

After the last block is built and validators have re-executed it:

1. **Collect attestations**: Wait for validators to send their signatures (arrive at T+4s+blockDuration)
2. **Finalize checkpoint**: Sign over attestations, assemble final checkpoint (1s)
3. **Publish to L1**: Submit transaction to Ethereum (needs 12s to land)

**Time reserved:** `2*propagationTime + finalizationTime + l1PublishingTime = 2s + 2s + 1s + 12s = 17s`

This 17s comes after the last sub-slot, ensuring we have enough time to complete the checkpoint. If the sequencer receives the necessary attestations before the reserved time, the L1 tx is submitted earlier.

## Handling Timing Variations

How does the sequencer timetable handle deviations from the expected times.

### Fast Initialization

**Scenario:** Initialization completes at 1s instead of 2s

```
0-1s:   SYNCHRONIZING, PROPOSER_CHECK (1s actual, vs 2s estimate)
1s:     Ready to build Block 1
1-10s:  Build Block 1 (9s available vs 8s budgeted)
10s:    Block 1 deadline
10-18s: Build Block 2
...
```

**Result:** Block 1 gets a bonus 1s of execution time. The extra time allows for more transactions or more complex execution.

### Slow Initialization

**Scenario:** Initialization completes at 3s instead of 2s

This may happen if the sequencer has a slow L1 RPC endpoint and syncing the previous checkpoint from L1 takes longer than expected.

```
0-3s:   SYNCHRONIZING, PROPOSER_CHECK (3s actual, vs 2s estimate)
3s:     Ready to build Block 1
3-10s:  Build Block 1 (7s available vs 8s budgeted)
10s:    Block 1 deadline
10-18s: Build Block 2
...
```

**Result:** Block 1 has 1s less time (7s instead of 8s). Still enough time to build a block, just with fewer transactions or simpler execution.

### Very Slow Initialization

**Scenario:** Initialization completes at 9s instead of 2s

While extremely unlikely, we still account for this scenario. We'd expect it to be related to faults to syncing blob data.

```
0-9s:   SYNCHRONIZING, PROPOSER_CHECK (9s actual, vs 2s estimate)
9s:     Ready to build Block 1
        Check: Can we start Block 1 in sub-slot 1?
        - Sub-slot 1 deadline: 10s
        - Current time: 9s
        - Time available: 1s
        - MIN_EXECUTION_TIME: 3s
        - 1s < 3s, so CANNOT use sub-slot 1

        Use sub-slot 2 instead:
9s:     Start building Block 1 using sub-slot 2
9-18s:  Build Block 1 (9s available vs 8s budgeted)
18s:    Block 1 deadline (sub-slot 2)
18-26s: Build Block 2 using sub-slot 3
...
```

**Result:** Sub-slot 1 is skipped entirely. We build 4 blocks instead of 5 (using sub-slots 2-5). Block 1 gets a bonus 1s of time.

### Block Takes Longer Than Expected

**Scenario:** Block 2 takes 9s instead of 8s

This scenario should not happen since the sequencer forcefully stops the block builder at the given deadline, but we still consider it.

```
10s:    Start building Block 2
19s:    Block 2 finishes (1s late, deadline was 18s)
19s:    Broadcast Block 2
        Check: Can we start Block 3?
        - Block 3 deadline: 26s
        - Current time: 19s
        - Time available: 7s
        - MIN_EXECUTION_TIME: 3s
        - 7s >= 3s, so CAN start Block 3

19-26s: Build Block 3 (7s available vs 8s budgeted)
26s:    Block 3 deadline
```

**Result:** Block 3 has less time (7s instead of 8s), but we still build it. The delay propagates but doesn't cascade uncontrollably.

**Extreme case:** If Block 2 finishes at 24s (6s late):
```
24s:    Block 2 finishes (6s late)
        Check: Can we start Block 3 in sub-slot 3?
        - Sub-slot 3 deadline: 26s
        - Current time: 24s
        - Time available: 2s
        - MIN_EXECUTION_TIME: 3s
        - 2s < 3s, so CANNOT use sub-slot 3

        Use sub-slot 4 instead:
24-34s: Build Block 3 using sub-slot 4 (10s available vs 8s budgeted)
```

**Result:** Sub-slot 3 is skipped, we build Block 3 using sub-slot 4 instead with bonus time.

### Block Finishes Early

**Scenario:** Block 2 finishes at 15s instead of 18s

This can happen if the sequencer hits a block limit (number of txs, gas, size, etc) or runs out of available txs before the sub-slot deadline:

```
10-15s: Build Block 2 (5s used vs 8s budgeted)
15s:    Block 2 finished
15s:    Broadcast Block 2
        Check: Should we start Block 3 now or wait?
        - Next sub-slot starts at 18s
        - Wait until 18s to maintain regular intervals

15-18s: WAITING_UNTIL_NEXT_BLOCK
18s:    Start building Block 3
18-26s: Build Block 3
```

**Result:** We wait until the next sub-slot starts. This prevents "rushing ahead" and maintains consistent block intervals, which is better for validators who are re-executing blocks in parallel.

## Parallel execution between Proposers and Validators

A key aspect of this design is **parallel execution** between proposer and validators.

### Timeline Example (8-second sub-slots)

```
Time | Proposer                    | Validators
-----|----------------------------|---------------------------
2s   | Start building Block 1     | (idle)
10s  | Finish Block 1, broadcast  | (idle)
10s  | Start building Block 2     |
12s  |                            | Receive Block 1 (10s + 2s)
     |                            | Start re-executing Block 1
18s  | Finish Block 2, broadcast  |
20s  |                            | Finish re-executing Block 1 (12s + 8s)
     |                            | Receive Block 2 (18s + 2s)
     |                            | Start re-executing Block 2
18s  | Start building Block 3     |
26s  | Finish Block 3, broadcast  |
28s  |                            | Finish re-executing Block 2 (20s + 8s)
     |                            | Receive Block 3 (26s + 2s)
     |                            | Start re-executing Block 3
...
42s  | Finish Block 5, broadcast  |
     | checkpoint proposal        |
44s  |                            | Finish re-executing Block 4 (36s + 8s)
     |                            | Receive Block 5 + checkpoint (42s + 2s)
     |                            | Start re-executing Block 5
42-54s| COLLECTING_ATTESTATIONS   |
52s  |                            | Finish re-executing Block 5 (44s + 8s)
     |                            | Send attestations
54s  | Receive attestations       | (done)
54-55s| ASSEMBLING_CHECKPOINT     |
55s  | PUBLISHING_CHECKPOINT      |
```

**Key observations:**
- Validators lag by ~2s (propagation delay)
- While proposer builds Block N+1, validators re-execute Block N (parallel work)
- For the last block, proposer waits while validators re-execute
- The last sub-slot provides the time budget for this waiting period

## Configuration Guidelines

When configuring timing parameters, ensure these constraints are satisfied:

### Minimum Slot Duration

For a valid configuration:
```
slotDuration >= initializationOffset
              + blockDuration * 2                          (at least 2 blocks)
              + blockDuration                              (last sub-slot)
              + 2 * propagationTime                        (round-trip)
              + finalizationTime                           (checkpoint finalization)
              + l1PublishingTime                           (L1 publishing)
```

Simplified:
```
slotDuration >= initializationOffset + 3*blockDuration + 2*propagationTime + finalizationTime + l1PublishingTime
```

**Example:**
```
slotDuration >= 2s + 3*8s + 2*2s + 1s + 12s = 2s + 24s + 4s + 1s + 12s = 43s
```

For a 72s slot, this leaves `72s - 43s = 29s` of slack, allowing for about 3-4 additional blocks (29s / 8s ≈ 3.6).

### Block Duration Constraints

Block duration should be greater than the min execution time, and ideally a divisor of the time available for building.

```
blockDuration >= MIN_EXECUTION_TIME (3s practical minimum for meaningful execution)
```

### Initialization Offset

The initialization offset should be set based on empirical measurements of how long initialization typically takes, with typical values being 1-3 seconds.

**Key point:** This is an *estimate*, not a hard deadline. The sequencer will take as long as needed for initialization. If it takes longer than the offset, the first block just has less time. If it takes less, the first block has bonus time.

### Propagation Time

Should be measured empirically on the actual P2P network, accounting for:
- Network latency between geographically distributed validators
- Gossip network propagation (not direct communication)
- Block/checkpoint size (larger messages take longer)

Typical values: 1-3 seconds

### L1 Publishing Time

Must account for Ethereum slot duration (12s) and blob propagation time:
- Bare minimum: 8s (Ethereum allows txs up to 4s into the slot)
- Recommended minimum: 12s (full Ethereum slot)
- With high blob congestion: 24s (two slots)

## State Machine

The sequencer transitions through these states during a slot:

| State | Time Budget | Purpose |
|-------|-------------|---------|
| **SYNCHRONIZING** | No limit | Wait for all subsystems to sync |
| **PROPOSER_CHECK** | Part of init offset | Verify we're the proposer |
| **INITIALIZING_CHECKPOINT** | Part of init offset | Set up checkpoint state |
| **WAITING_FOR_TXS** | Until block deadline | Wait for enough transactions |
| **CREATING_BLOCK** | Until block deadline | Execute transactions and build block |
| **WAITING_UNTIL_NEXT_BLOCK** | Until next sub-slot start | Sleep between blocks to maintain intervals |
| **ASSEMBLING_CHECKPOINT** | assembleTime (1s) | Assemble final checkpoint |
| **COLLECTING_ATTESTATIONS** | Until L1 publish deadline | Wait for validator signatures |
| **PUBLISHING_CHECKPOINT** | Until slot end | Submit to L1 |

## Complete Example: 72-Second Slot with 8-Second Sub-Slots

Let's walk through a complete slot with the happy path:

```
T=0s    Slot begins for slot N

T=0-2s  SYNCHRONIZING, PROPOSER_CHECK, INITIALIZING_CHECKPOINT
        Actual time: 1.8s (slightly faster than 2s estimate)

T=2s    Sub-slot 1 deadline calculation: 2s + 1*8s = 10s
T=1.8s  Ready to build, start Block 1 immediately
        Available time: 10s - 1.8s = 8.2s (bonus 0.2s!)
T=1.8-9.5s  CREATING_BLOCK 1
T=9.5s  Block 1 complete, broadcast
T=9.5-10s  Wait for next sub-slot

T=10s   Sub-slot 2 starts, deadline: 2s + 2*8s = 18s
T=10-17.5s  CREATING_BLOCK 2
T=17.5s Block 2 complete, broadcast
T=17.5-18s Wait for next sub-slot

T=18s   Sub-slot 3 starts, deadline: 2s + 3*8s = 26s
T=18-25s  CREATING_BLOCK 3
T=25s   Block 3 complete, broadcast
T=25-26s Wait for next sub-slot

T=26s   Sub-slot 4 starts, deadline: 2s + 4*8s = 34s
T=26-33.5s  CREATING_BLOCK 4
T=33.5s Block 4 complete, broadcast
T=33.5-34s Wait for next sub-slot

T=34s   Sub-slot 5 starts, deadline: 2s + 5*8s = 42s
T=34-41s  CREATING_BLOCK 5 (last block)
T=41s   Block 5 complete

T=41s   ASSEMBLING_CHECKPOINT (1s)
T=42s   Checkpoint proposal broadcast
        Sub-slot 6 starts (last sub-slot, reserved for validator reexec)

T=44s   Validators receive checkpoint (42s + 2s propagation)
        Validators start re-executing Block 5

T=52s   Validators finish re-executing Block 5 (44s + 8s)
        Validators send attestations

T=54s   COLLECTING_ATTESTATIONS
        Proposer receives attestations (52s + 2s propagation)

T=55s   PUBLISHING_CHECKPOINT
        Sign over attestations, submit L1 transaction

T=67s   L1 transaction lands in Ethereum block (12s)

T=72s   Slot ends (5s buffer remaining)
```

**Summary:**
- Built 5 blocks (sub-slots 1-5)
- Last sub-slot (6) reserved for validator re-execution
- Total time: 72s
- Buffer: 5s (72s - 67s)
