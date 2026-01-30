# Gossipsub Peer Scoring

This module configures gossipsub peer scoring parameters for the Aztec P2P network. Peer scoring helps maintain network health by rewarding well-behaving peers and penalizing misbehaving ones.

## Overview

Gossipsub v1.1 introduces peer scoring to defend against various attacks and improve message propagation. Each peer accumulates a score based on their behavior, and peers with low scores may be pruned from the mesh or even disconnected.

For the full specification, see: https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md#peer-scoring

## Scoring Parameters

The peer score is computed as a weighted sum of topic-specific and application-specific scores:

```
Score = TopicScore + AppSpecificScore + IPColocationPenalty + BehaviorPenalty
```

### Topic-Specific Parameters (P1-P4)

Each topic has its own scoring parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| **P1: timeInMesh** | Positive | Rewards peers for time spent in the mesh |
| **P2: firstMessageDeliveries** | Positive | Rewards peers who deliver messages first |
| **P3: meshMessageDeliveries** | Negative | Penalizes peers who under-deliver messages |
| **P3b: meshFailurePenalty** | Negative | Sticky penalty applied when pruned from mesh |
| **P4: invalidMessageDeliveries** | Negative | Penalizes peers who deliver invalid messages |

### Our Configuration

We configure P3 (meshMessageDeliveries), P3b (meshFailurePenalty), and P4 (invalidMessageDeliveries) with parameters calculated dynamically from network configuration.

## Exponential Decay

All counters in gossipsub use exponential decay. Each score decay interval (default: 1s), counters are multiplied by a decay factor:

```
counter = counter * decay
```

The score decay interval is independent of the gossipsub heartbeat interval; it is controlled by `peerScoreParams.decayInterval`.

### Multi-Slot Decay Windows

For low-frequency topics (like 1 message per 72-second slot), naive decay would cause counters to drop to near-zero before the next message arrives. Instead, we use **multi-slot decay windows**:

| Frequency | Decay Window |
|-----------|--------------|
| <= 1 msg/slot | 5 slots |
| 2-10 msg/slot | 3 slots |
| > 10 msg/slot | 2 slots |

### Decay Factor Calculation

To decay to 1% of the original value over the decay window:

```typescript
decayIntervalsPerSlot = slotDurationMs / decayIntervalMs
decayIntervalsInWindow = decayIntervalsPerSlot * decayWindowSlots
decay = 0.01 ^ (1 / decayIntervalsInWindow)
```

**Example** (72s slot, 1000ms decay interval, 5-slot decay window):
```
decayIntervalsPerSlot = 72000 / 1000 = 72
decayIntervalsInWindow = 72 * 5 = 360
decay = 0.01^(1/360) ≈ 0.987
```

## Convergence and Thresholds

### Convergence (Steady-State Value)

If messages arrive at a constant rate, the decaying counter converges to:

```typescript
messagesPerDecayInterval = expectedPerSlot * (decayIntervalMs / slotDurationMs)
convergence = messagesPerDecayInterval / (1 - decay)
```

### Threshold Calculation

The P3 threshold determines when penalties apply. We use a conservative threshold at 30% of convergence to avoid penalizing honest peers experiencing normal variance:

```typescript
threshold = convergence * 0.3
```

## meshMessageDeliveriesWindow

This parameter determines how long after validating a message other peers can still receive credit for delivering it.

**How it works:**
1. Peer A delivers a message first
2. We validate the message
3. Timer starts for `meshMessageDeliveriesWindow` duration (5 seconds)
4. Any mesh peer delivering within this window gets credit

**Why 5 seconds?**
- Allows most mesh peers to receive credit for the same message
- Accounts for network propagation delays
- Reduces false penalties from timing variance

## meshMessageDeliveriesActivation

This is the grace period before P3 penalties can be applied to a peer. During this time, the message delivery counter accumulates without any penalty.

**Why activation matches decay window:**

We set activation time equal to the decay window (2-5 slots depending on topic frequency) because:

1. **Counter convergence**: The threshold is set at 30% of the *converged* counter value. If activation is shorter than the decay window, the counter hasn't approached convergence yet, and honest peers could be penalized unfairly.

2. **Join timing variance**: Peers may join at any point during a slot. With activation equal to the decay window, even peers joining at an unlucky time will have accumulated enough messages before penalties start.

3. **Ethereum precedent**: Ethereum's Lodestar implementation uses very long activation times (1-2 epochs ≈ 16-32 slots) for similar reasons.

| Topic | Decay Window | Activation Time |
|-------|--------------|-----------------|
| checkpoint_proposal | 5 slots (360s) | 5 slots (360s) |
| block_proposal | 3 slots (216s) | 3 slots (216s) |
| checkpoint_attestation | 2 slots (144s) | 2 slots (144s) |

## Per-Topic Configuration

### Topic Types and Expected Rates

| Topic | Expected/Slot | Decay Window | Notes |
|-------|--------------|--------------|-------|
| `tx` | Unpredictable | N/A | P3/P3b disabled |
| `block_proposal` | N-1 | 3 slots | N = blocks per slot (MBPS mode) |
| `checkpoint_proposal` | 1 | 5 slots | One per slot |
| `checkpoint_attestation` | C (~48) | 2 slots | C = committee size |

### Transactions (tx)

Transactions are submitted unpredictably by users, so we cannot set meaningful delivery thresholds. P3 and P3b are **disabled** for this topic.

### Block Proposals (block_proposal)

In Multi-Block-Per-Slot (MBPS) mode, N-1 block proposals are gossiped per slot (the last block is bundled with the checkpoint). In single-block mode, this is 0.

### Checkpoint Proposals (checkpoint_proposal)

Exactly one checkpoint proposal per slot, containing the final block and proof commitments.

### Checkpoint Attestations (checkpoint_attestation)

Each committee member sends one attestation per slot. With a target committee size of 48, we expect ~48 attestations per slot.

### Topic Weights

All topics use equal weight (1). Block proposals contain transaction hashes, so transactions must propagate for block proposals to validate - making all message types equally important for network health.

## Configuration Dependencies

The scoring parameters depend on:

| Parameter | Source | Default |
|-----------|--------|---------|
| `slotDuration` | L1RollupConstants | 72s |
| `targetCommitteeSize` | L1RollupConstants | 48 |
| `decayInterval` | PeerScoreParams.decayInterval | 1000ms |
| `blockDurationMs` | P2PConfig.blockDurationMs | undefined (single block) |

Note: the gossipsub heartbeat interval (`P2PConfig.gossipsubInterval`) is configured separately and does not control score decay.

## Invalid Message Handling (P4)

P4 penalizes peers who deliver invalid messages. All topics have this enabled with:
- Weight: -20
- Decay: Over 4 slots

Invalid messages include malformed data, invalid signatures, or messages failing validation.

## Tuning Guidelines

### Signs of Too-Strict Scoring

- Honest peers frequently pruned from mesh
- High peer churn
- Slow message propagation despite good network

**Solution:** Increase thresholds, use longer decay windows

### Signs of Too-Lenient Scoring

- Slow or stalled message propagation
- Bad peers remaining in mesh too long
- Network vulnerable to eclipse attacks

**Solution:** Decrease thresholds, use shorter decay windows

### Monitoring

Key metrics to monitor:
- Peer scores distribution
- P3 penalty frequency per topic
- Invalid message rate per peer
- Mesh membership stability

## Code Structure

- `scoring.ts` - Global peer score thresholds
- `topic_score_params.ts` - Per-topic parameter calculation
- `index.ts` - Module exports

## Global Score Thresholds

Gossipsub uses global thresholds to determine peer behavior based on total score:

| Threshold | Value | Effect |
|-----------|-------|--------|
| gossipThreshold | -500 | Below this, peer doesn't receive gossip |
| publishThreshold | -1000 | Below this, peer's messages aren't relayed |
| graylistThreshold | -2000 | Below this, all RPCs from peer are ignored |

### Alignment with Application-Level Scoring

The thresholds are designed to align with Aztec's application-level peer scoring:

```
Total Gossipsub Score = TopicScore + (AppScore × AppSpecificWeight)
```

With `appSpecificWeight = 10`:

| App Score State | App Score | Gossipsub Contribution | Threshold Triggered |
|-----------------|-----------|------------------------|---------------------|
| Healthy | 0 to -49 | 0 to -490 | None |
| Disconnect | -50 | -500 | gossipThreshold |
| Ban | -100 | -1000 | publishThreshold |

This means:
- When a peer reaches **Disconnect** state, they also stop receiving gossip
- When a peer reaches **Ban** state, their messages are not relayed
- **Graylist** requires ban-level score PLUS significant topic penalties (attacks)

### Topic Score Contribution

Topic scores provide **burst response** to attacks, while app score provides **stable baseline**:

- P3 (under-delivery): Max -1 per topic (~-3 total)
- P4 (invalid messages): -20 per invalid message, can spike to -2000+ during attacks

Example attack scenario:
- App score: -100 (banned) → -1000 gossipsub
- P4 burst (10 invalid messages): -2000 per topic
- **Total: -3000+** → Triggers graylistThreshold

The P4 penalty decays to 1% over 4 slots (~5 minutes), allowing recovery if the attack stops.

## Non-Contributing Peers

### How P3 Handles Under-Delivery

The P3 (meshMessageDeliveries) penalty applies when a peer's message delivery counter falls below the threshold. The penalty formula is:

```
deficit = max(0, threshold - counter)
penalty = deficit² × weight
```

Where `weight = -1 / (threshold × threshold)`. This clever design **caps the maximum P3 penalty at -1 per topic**, regardless of how far below threshold the peer is:

```
If counter = 0 (delivers nothing):
  deficit = threshold
  penalty = threshold² × (-1/threshold²) = -1
```

### Why Non-Contributors Aren't Disconnected

With P3 capped at -1 per topic, a peer delivering zero messages accumulates at most:
- **~-3 to -4 total** from P3 across all topics

With our thresholds:
- gossipThreshold = -500
- publishThreshold = -1000
- graylistThreshold = -2000

**A score of -4 is far above -500**, so non-contributing peers won't trigger gossipThreshold from topic scores alone.

### What Actually Happens to Non-Contributors

1. **Mesh pruning (automatic)**: Gossipsub prunes peers with score < 0 from the mesh. Non-contributors with score ~-4 are removed from the mesh and won't be selected for message propagation.

2. **Excluded from grafting**: Peers with negative scores are excluded from opportunistic grafting, so they won't rejoin the mesh easily.

3. **Still receive gossip**: Since -4 > -500, they continue receiving IHAVE/gossip messages (but not being in the mesh means slower propagation).

4. **Not disconnected**: They remain connected unless they commit protocol violations that trigger application-level penalties.

### Design Philosophy

The system distinguishes between:

| Peer Type | Score Range | Effect |
|-----------|-------------|--------|
| **Productive** | ≥ 0 | Full mesh participation |
| **Unproductive** | -1 to -499 | Pruned from mesh, still receives gossip |
| **Misbehaving** | -500 to -999 | Stops receiving gossip (app: Disconnect) |
| **Malicious** | -1000 to -1999 | Cannot publish (app: Banned) |
| **Attacking** | ≤ -2000 | Graylisted, all RPCs ignored |

This is similar to Ethereum's approach: non-contributing peers are removed from the mesh (preventing them from slowing propagation) but not disconnected, as they might be starting up or experiencing temporary connectivity issues.

### When Non-Contributors ARE Penalized

Non-contributors will trigger thresholds if they also:
1. **Send invalid messages**: P4 penalty of -20 per invalid message accumulates quickly
2. **Fail protocol validation**: Application penalties for deserialization errors, manipulation attempts
3. **Violate rate limits**: Repeated violations accumulate application penalties

## Application-Level Penalties

Beyond gossipsub's topic scoring, Aztec has application-level penalties for protocol violations:

### Penalty Severities

| Severity | Points | Errors to Disconnect | Errors to Ban |
|----------|--------|----------------------|---------------|
| **HighToleranceError** | 2 | 25 | 50 |
| **MidToleranceError** | 10 | 5 | 10 |
| **LowToleranceError** | 50 | 1 | 2 |

### What Triggers Each Severity

**HighToleranceError (2 points)** - Transient issues:
- Rate limit exceeded
- Failed responses (FAILURE/UNKNOWN status)
- Recent double spend attempts (within penalty window)

**MidToleranceError (10 points)** - Protocol violations:
- Block/checkpoint exceeds per-slot cap
- Response hash mismatches
- Duplicate transactions in response
- Unrequested transactions in response

**LowToleranceError (50 points)** - Serious violations:
- Message deserialization errors
- Invalid message manipulation attempts
- Block number/order mismatches
- Invalid transactions
- Badly formed requests
- Confirmed double spends

### Score Decay

Application scores decay by 10% per minute (`decayFactor = 0.9`):
- Score -100 → -90 after 1 minute
- Score -100 → -35 after 10 minutes
- Score -100 → -12 after 20 minutes

This allows honest peers to recover from temporary issues.

## Score Calculation Examples

### Example 1: Honest Peer

```
App score: 0
Topic P3: 0 (delivering messages)
Topic P4: 0 (no invalid messages)
─────────────────────────────────
Total: 0 → Full participation ✓
```

### Example 2: Peer with Rate Limit Issues

```
App score: -20 (10 HighToleranceErrors)
  → Gossipsub contribution: -200
Topic P3: -1 (slightly under-delivering)
Topic P4: 0
─────────────────────────────────
Total: -201 → Still receives gossip ✓
```

### Example 3: Validation Failure

```
App score: -50 (1 LowToleranceError for invalid message)
  → Gossipsub contribution: -500
Topic P3: 0
Topic P4: -20 (the invalid message)
─────────────────────────────────
Total: -520 → Stops receiving gossip (gossipThreshold = -500)
              → Application disconnects peer
```

### Example 4: Banned Peer

```
App score: -100 (2 LowToleranceErrors)
  → Gossipsub contribution: -1000
Topic P3: -2
Topic P4: -40 (2 invalid messages)
─────────────────────────────────
Total: -1042 → Cannot publish (publishThreshold = -1000)
               → Application bans peer
```

### Example 5: Active Attack (Burst of Invalid Messages)

```
App score: -100 (banned)
  → Gossipsub contribution: -1000
Topic P3: -3
Topic P4: -2000 (10 invalid messages: 10² × -20)
─────────────────────────────────
Total: -3003 → Graylisted (graylistThreshold = -2000)
               → All RPCs ignored
```

### Example 6: Recovery After Attack

```
Initial state: Total score -3003

After 4 slots (~5 min):
  P4 decays to 1%: -2000 → -20
  App score unchanged: -1000
  Total: -1023 → Still banned, but no longer graylisted

After 10 min:
  App score decays: -100 → -35 → -350 contribution
  P4 further decayed: ~-5
  Total: -358 → Above gossipThreshold, starting to recover
```

## References

- [Gossipsub v1.1 Specification](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md)
- [Lighthouse Scoring Implementation](https://github.com/sigp/lighthouse/blob/stable/beacon_node/lighthouse_network/src/peer_manager/score.rs)
- [Lodestar Scoring Implementation](https://github.com/ChainSafe/lodestar/tree/unstable/packages/beacon-node/src/network/gossip)
