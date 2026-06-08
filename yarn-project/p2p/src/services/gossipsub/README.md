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

We configure all parameters (P1-P4) with values calculated dynamically from network configuration:

| Parameter | Max Score | Configuration |
|-----------|-----------|---------------|
| P1: timeInMesh | +8 per topic | Slot-based, caps at 1 hour |
| P2: firstMessageDeliveries | +25 per topic | Convergence-based, fast decay |
| P3: meshMessageDeliveries | -34 per topic | Must exceed P1+P2 for pruning |
| P3b: meshFailurePenalty | -34 per topic | Sticky penalty after pruning |
| P4: invalidMessageDeliveries | -20 per message | Attack detection |

**Important:** P1 and P2 are only enabled on topics with P3 enabled. By default, P3 is enabled for checkpoint_proposal and checkpoint_attestation (2 topics). Block proposal scoring is controlled by `expectedBlockProposalsPerSlot` (current default: `0`, including when env var is unset, so disabled) - see [Block Proposals](#block-proposals-block_proposal) for details. The tx topic has all scoring disabled except P4, to prevent free positive score accumulation that would offset penalties from other topics.

## Exponential Decay

All counters in gossipsub use exponential decay. Each heartbeat (default: 700ms), counters are multiplied by a decay factor:

```
counter = counter * decay
```

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
heartbeatsPerSlot = slotDurationMs / heartbeatIntervalMs
heartbeatsInWindow = heartbeatsPerSlot * decayWindowSlots
decay = 0.01 ^ (1 / heartbeatsInWindow)
```

**Example** (72s slot, 700ms heartbeat, 5-slot decay window):
```
heartbeatsPerSlot = 72000 / 700 ≈ 103
heartbeatsInWindow = 103 * 5 = 515
decay = 0.01^(1/515) ≈ 0.991
```

## Convergence and Thresholds

### Convergence (Steady-State Value)

If messages arrive at a constant rate, the decaying counter converges to:

```typescript
messagesPerHeartbeat = expectedPerSlot * (heartbeatMs / slotDurationMs)
convergence = messagesPerHeartbeat / (1 - decay)
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

The [gossipsub v1.1 spec](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md) recommends this window be "small (in the order of milliseconds)" to prevent peers from gaming P3 scores by simply replaying messages back. A peer can echo a message within ~100ms, so a large window allows score inflation.

However, real-world implementations use significantly larger values due to practical constraints:
- **Prysm** (Go): 2 seconds - the go-libp2p default for low-latency Go runtime
- **Lodestar** (TypeScript): 12 seconds - accounts for JavaScript I/O lag
- **Ethereum spec proposal**: 400ms was proposed but rejected as "too tight"

We use **5 seconds** as a balanced middle ground because:
1. **Runtime considerations**: Our implementation is TypeScript (like Lodestar), not Go (like Prysm). JavaScript has higher I/O latency due to single-threaded event loop and garbage collection pauses.
2. **Network variance**: Even on healthy networks, message propagation can vary due to:
   - Concurrent validation of multiple messages
   - CPU-intensive proof verification
   - Network congestion during high transaction volume
   - Geographic distribution of validators
3. **Conservative but not excessive**: 5s is 2.5× the Go default (allowing for JS overhead) but still well below Lodestar's 12s, maintaining reasonable protection against replay attacks.
4. **Attack mitigation**: A 5s window still prevents score gaming - peers would need to consistently echo messages within 5s to maintain positive P3 scores, which requires them to stay connected and somewhat functional.

## meshMessageDeliveriesActivation

This is the grace period before P3 penalties can be applied to a peer. During this time, the message delivery counter accumulates without any penalty.

**Why activation is 5× the decay window:**

We set activation time to **5× the decay window** (10-25 slots depending on topic frequency) because:

1. **Timer starts at mesh join, not first message**: The activation countdown begins when a peer joins the mesh, not when they receive their first message. During network bootstrap, peers may join before any messages are flowing.

2. **Bootstrap grace period**: When the network is starting up, message flow may be delayed. Peers need time for the network to stabilize and messages to start propagating.

3. **Counter convergence**: The threshold is set at 30% of the *converged* counter value. If activation is too short, the counter hasn't approached convergence yet, and honest peers could be penalized unfairly.

4. **Join timing variance**: Peers may join at any point during a slot. With longer activation time, even peers joining at an unlucky time will have accumulated enough messages before penalties start.

5. **Ethereum precedent**: Ethereum's Lodestar implementation uses very long activation times (1-2 epochs ≈ 16-32 slots) for similar reasons.

| Topic | Decay Window | Activation Time (5×) |
|-------|--------------|----------------------|
| checkpoint_proposal | 5 slots (360s) | 25 slots (1800s / 30min) |
| block_proposal | 3 slots (216s) | 15 slots (1080s / 18min) |
| checkpoint_attestation | 2 slots (144s) | 10 slots (720s / 12min) |

## P1: Time in Mesh (Positive Score)

P1 rewards peers for time spent in the mesh. We use Lodestar-style slot-based normalization:

```typescript
timeInMeshQuantum = slotDurationMs          // Score increases by ~1 per slot
timeInMeshCap = 3600 / slotDurationSeconds  // Cap at 1 hour (50 slots for 72s slots)
timeInMeshWeight = MAX_P1_SCORE / cap       // Normalized so max P1 = 8
```

**Key properties:**
- Score increases gradually: ~1 per slot of mesh membership
- Caps at 1 hour: prevents runaway positive scores
- Resets on mesh leave: no credit carried after pruning

**Example (72s slots):**
- After 10 minutes in mesh: P1 ≈ 1.3
- After 30 minutes in mesh: P1 ≈ 4
- After 1 hour in mesh: P1 = 8 (max)

## P2: First Message Deliveries (Positive Score)

P2 rewards peers who deliver messages first to us. We use convergence-based normalization:

```typescript
firstMessageDeliveriesDecay = computeDecay(2 slots)  // Fast decay
firstMessageDeliveriesCap = convergence(1 msg/heartbeat)
firstMessageDeliveriesWeight = MAX_P2_SCORE / cap    // Normalized so max P2 = 25
```

**Key properties:**
- Fast decay (2 slots): rewards recent behavior, not historical
- Caps at convergence: prevents score inflation from bursts
- Resets quickly after mesh leave: decays to near-zero over ~2 slots (e.g., ~144s with 72s slots)

## P3 Weight Formula

The P3 weight is calculated to ensure the max penalty equals `MAX_P3_PENALTY_PER_TOPIC` (-34):

```typescript
// Weight formula: max_penalty / threshold²
meshMessageDeliveriesWeight = MAX_P3_PENALTY_PER_TOPIC / (threshold * threshold)

// When peer delivers nothing (deficit = threshold):
// penalty = deficit² × weight = threshold² × (-34 / threshold²) = -34
```

This ensures P3 max penalty (-34) exceeds P1 + P2 max (+33), causing mesh pruning.

## Per-Topic Configuration

### Topic Types and Expected Rates

| Topic | Expected/Slot | Decay Window | Notes |
|-------|--------------|--------------|-------|
| `tx` | Unpredictable | N/A | P3/P3b disabled |
| `block_proposal` | N-1 | 3 slots | N = blocks per slot (MBPS mode) |
| `checkpoint_proposal` | 1 | 5 slots | One per slot |
| `checkpoint_attestation` | C (~48) | 2 slots | C = committee size |

### Transactions (tx)

Transactions are submitted unpredictably by users, so we cannot set meaningful delivery thresholds. **All scoring (P1, P2, P3, P3b) is disabled** for this topic except P4 (invalid message detection).

**Rationale:** If P1/P2 were enabled without P3, the tx topic would contribute free positive scores that could offset penalties from other topics, preventing proper mesh pruning of non-contributing peers.

### Block Proposals (block_proposal)

Block proposal scoring is controlled by the `expectedBlockProposalsPerSlot` config (`SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT` env var):

| Config Value | Behavior |
|-------------|----------|
| `0` (current default) | Block proposal P3 scoring is **disabled** |
| Positive number | Uses the provided value as expected proposals per slot |
| `undefined` | Falls back to `blocksPerSlot - 1` (MBPS mode: N-1, single block: 0) |

**Current behavior note:** In the current implementation, if `SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT` is not set, config mapping applies `0` by default (scoring disabled). The `undefined` fallback above is currently reachable only if the value is explicitly provided as `undefined` in code.

**Future intent:** Once throughput is stable, we may change env parsing/defaults so an unset env var resolves to `undefined` again (re-enabling automatic fallback to `blocksPerSlot - 1`).

**Why disabled by default?** In MBPS mode, gossipsub expects N-1 block proposals per slot. When transaction throughput is low (as expected at launch), fewer blocks are actually built, causing peers to be incorrectly penalized for under-delivering block proposals. The default of 0 disables this scoring. Set to a positive value when throughput increases and block production is consistent.

In MBPS mode (when enabled), N-1 block proposals are gossiped per slot (the last block is bundled with the checkpoint). In single-block mode, this is 0.

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
| `heartbeatInterval` | P2PConfig.gossipsubInterval | 700ms |
| `blockDurationMs` | P2PConfig.blockDurationMs | undefined (single block) |
| `expectedBlockProposalsPerSlot` | P2PConfig.expectedBlockProposalsPerSlot | 0 (disabled; current unset-env behavior) |

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

With `appSpecificWeight = 10` (topic score assumed ~0):

| App Score State | App Score | Gossipsub Contribution | Threshold Triggered |
|-----------------|-----------|------------------------|---------------------|
| Healthy | 0 to -49 | 0 to -490 | None |
| Disconnect | -50 | -500 | gossipThreshold |
| Ban | -100 | -1000 | publishThreshold |

This means (best-effort alignment):
- When a peer reaches **Disconnect** state, they generally stop receiving gossip
- When a peer reaches **Ban** state, their messages are generally not relayed
- **Graylist** requires ban-level score PLUS significant topic penalties (attacks)

**Important:** Positive topic scores (P1/P2) can temporarily offset app penalties, so alignment is not strict.
Conversely, if topic scores are low, a peer slightly above the disconnect threshold may still dip below `gossipThreshold`. This is acceptable and tends to recover quickly as topic scores accumulate.

### Topic Score Contribution

Topic scores provide **burst response** to attacks, while app score provides **stable baseline**:

- P1 (time in mesh): Max +8 per topic (+16 default, +24 with block proposal scoring enabled)
- P2 (first deliveries): Max +25 per topic (+50 default, +75 with block proposal scoring, but decays fast)
- P3 (under-delivery): Max -34 per topic (-68 default with 2 topics, -102 with block proposal scoring enabled)
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

Where `weight = MAX_P3_PENALTY_PER_TOPIC / (threshold × threshold)`. This design ensures:

```
If counter = 0 (delivers nothing):
  deficit = threshold
  penalty = threshold² × (-34/threshold²) = -34 per topic
```

### Score Balance for Mesh Pruning

For a peer to be pruned from the mesh, their **topic score** must be negative. We balance P1/P2/P3 so that non-contributors get pruned:

| Scenario | P1 | P2 | P3 | Topic Score | Result |
|----------|----|----|-----|-------------|--------|
| Healthy peer (delivering) | +8 | +25 | 0 | +33 | In mesh |
| New peer (just joined) | +1 | +5 | 0 | +6 | In mesh |
| Non-contributor (1 hour in mesh) | +8 | 0 | -34 | **-26** | **Pruned** |
| Non-contributor (new) | +1 | 0 | -34 | **-33** | **Pruned** |

The key insight: **P3 max (-34) exceeds P1 + P2 max (+33)**, so even a peer that has been in the mesh for 1 hour will still be pruned if they stop delivering messages.

### What Happens After Pruning

When a peer is pruned from the mesh:

1. **P1 resets to 0**: The timeInMesh counter is cleared
2. **P2 decays to 0**: Fast decay (2-slot window) makes it negligible over minutes
3. **P3b captures the penalty**: The P3 deficit at prune time becomes P3b, which decays slowly

After pruning, the peer's score consists mainly of P3b:
- **Total P3b: -68** (default, 2 topics) or **-102** (with block proposal scoring enabled, 3 topics)
- **Recovery time**: P3b decays to ~1% over one decay window (2-5 slots = 2-6 minutes)
- **Grafting eligibility**: Peer can be grafted when score ≥ 0, but asymptotic decay means recovery is slow

### Why Non-Contributors Aren't Disconnected

With P3b capped at -68 (default, 2 topics) or -102 (with block proposal scoring, 3 topics) after pruning:

| Threshold | Value | P3b Score | Triggered? |
|-----------|-------|-----------|------------|
| gossipThreshold | -500 | -68 (default) / -102 (block scoring on) | No |
| publishThreshold | -1000 | -68 (default) / -102 (block scoring on) | No |
| graylistThreshold | -2000 | -68 (default) / -102 (block scoring on) | No |

**A score of -68 or -102 is well above -500**, so non-contributing peers:
- Are pruned from mesh (good - stops them slowing propagation)
- Still receive gossip (can recover by reconnecting/restarting)
- Are NOT disconnected unless they also have application-level penalties

### Design Philosophy

The system distinguishes between:

| Peer Type | Score Range | Effect |
|-----------|-------------|--------|
| **Productive** | ≥ 0 | Full mesh participation |
| **Unproductive** | -1 to -499 | Pruned from mesh, still receives gossip |
| **Misbehaving** | -500 to -999 | Stops receiving gossip (app: Disconnect) |
| **Malicious** | -1000 to -1999 | Cannot publish (app: Banned) |
| **Attacking** | ≤ -2000 | Graylisted, all RPCs ignored |

Note: These ranges are approximate; positive topic scores can shift a peer upward temporarily.

This is similar to Ethereum's approach: non-contributing peers are removed from the mesh (preventing them from slowing propagation) but not disconnected, as they might be starting up or experiencing temporary connectivity issues.

### When Non-Contributors ARE Penalized

Non-contributors will trigger thresholds if they also:
1. **Send invalid messages**: P4 penalty of -20 per invalid message accumulates quickly
2. **Fail protocol validation**: Application penalties for deserialization errors, manipulation attempts
3. **Violate rate limits**: Repeated per-peer limit hits accumulate application penalties

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

This allows honest peers to recover from temporary issues — but only up to the ban threshold. Once a peer
crosses into the **Banned** state, decay no longer applies until the ban expires (see Ban Duration below).

### Ban Duration

Once a peer's score drops below the ban threshold (`MIN_SCORE_BEFORE_BAN = -100`) the ban is held for a configurable
duration:

- The score the peer held when banned is recorded in memory alongside an expiry timestamp.
- While the ban is active, `getScore` returns the **ban score** regardless of decay, so the peer stays in the
  `Banned` state for the full window and cannot decay its way out early.
- When the ban expires it is removed and the live (decayed) score takes over again, letting the peer recover.

The ban duration is controlled by `P2P_PEER_BAN_DURATION_SECONDS` (config field `peerBanDurationSeconds`), defaulting
to 24 hours. Bans are held in memory only (cleared on restart). This is independent of the gossipsub topic-score
decay (P4, P3b), which continues to decay as described above; only the application-level ban score is pinned.

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
Topic P4: -200 (10 invalid messages: 10 × -20)
─────────────────────────────────
Total: -1203 → Cannot publish (publishThreshold = -1000)

If the attacker sends 100 invalid messages quickly:

Topic P4: -2000 (100 invalid messages: 100 × -20)
─────────────────────────────────
Total: -3003 → Graylisted (graylistThreshold = -2000)
               → All RPCs ignored
```

### Example 6: Recovery After Attack

```
Initial state: Total score -3003

After 4 slots (~5 min):
  P4 decays to 1%: -2000 → -20
  App score pinned at ban floor: -1000
  Total: -1023 → Still banned, but no longer graylisted

For the rest of the ban window (default 24h):
  Topic scores (P4, P3b) keep decaying toward 0
  App score stays pinned at the ban floor: -1000 contribution
  Total: ~-1000 → Remains banned (cannot publish)

After the ban expires:
  The ban is lifted; the live app score (now decayed toward 0) takes over
  Total: recovers, peer can participate again
```

Unlike topic scores, the application ban score does **not** decay-recover during the ban window — that is the
point of the ban duration (see above). A banned peer is held for the full `P2P_PEER_BAN_DURATION_SECONDS`.

## Network Outage Analysis

What happens when a peer experiences a network outage and stops delivering messages?

### During the Outage

While the peer is disconnected:

1. **P3 penalty accumulates**: The message delivery counter decays toward 0, causing increasing P3 penalty
2. **Max P3 penalty reached**: Once counter drops below threshold, penalty hits -34 per topic (-68 default, -102 with block proposal scoring)
3. **Mesh pruning**: Topic score goes negative → peer is pruned from mesh
4. **P3b captures penalty**: The P3 deficit at prune time becomes P3b (sticky penalty)

### Outage Timeline

| Time | Event | Score Impact |
|------|-------|--------------|
| 0s | Outage begins | P3 = 0 |
| ~1 decay window (2-5 slots) | Counter decays below threshold | P3 starts decreasing |
| ~1-2 decay windows | Counter approaches 0 | P3 ≈ -34 per topic |
| ~1-2 decay windows | Peer pruned from mesh | P3b ≈ -34 per topic |
| Thereafter | P3b decays slowly | Recovery begins |

Note: If the peer just joined the mesh, P3 penalties only start after
`meshMessageDeliveriesActivation` (10-25 slots depending on topic frequency).

### Key Insight: No Application Penalties

During a network outage, the peer:
- **Does NOT send invalid messages** → No P4 penalty
- **Does NOT violate protocols** → No application-level penalty
- **Only accumulates topic-level penalties** → Max -68 (default) or -102 (with block proposal scoring)

This is the crucial difference from malicious behavior:

| Scenario | App Score | Topic Score | Total | Threshold Hit |
|----------|-----------|-------------|-------|---------------|
| Network outage | 0 | -68 (default) / -102 (block scoring on) | -68 / -102 | None |
| Validation failure | -50 | -20 | -520 | gossipThreshold |
| Malicious peer | -100 | -2000+ | -2100+ | graylistThreshold |

### Recovery After Outage

When the peer reconnects:

1. **Peer re-joins mesh**: Can request graft (topic score must be > 0 for acceptance)
2. **P3b decays**: To ~1% over decay window (2-5 slots depending on topic)
3. **P1 restarts from 0**: timeInMesh counter begins accumulating
4. **P2 restarts from 0**: firstMessageDeliveries counter begins accumulating

**Recovery timeline:**
- Immediate: Peer can attempt to re-graft
- ~3-5 minutes: P3b decays to near-zero
- ~10+ minutes: P1 builds up again (if staying in mesh)

### Why This Design Works

The system correctly distinguishes between:

| Behavior | Treatment |
|----------|-----------|
| **Network issues** | Pruned from mesh (stops slowing propagation), can recover quickly |
| **Protocol violations** | Disconnected (gossipThreshold), must wait for app score decay |
| **Malicious activity** | Banned/graylisted, requires both app and topic score decay |

A peer experiencing network problems will:
- Be temporarily removed from mesh propagation (good for network health)
- NOT be disconnected or banned (they haven't misbehaved)
- Recover automatically when connectivity returns
- Retain their connections for recovery

This matches Ethereum's approach: **honest peers with temporary issues are inconvenienced but not punished**.

### Rate Limiting During Outages

Note: Simply not sending messages does NOT trigger rate limit penalties. Rate limits apply to:
- **Per-peer rate limit exceeded** → HighToleranceError (2 points)
- **Other protocol violations** → MidToleranceError or LowToleranceError depending on severity

A peer that sends nothing receives no rate limit penalties. The only penalty for not delivering messages is P3, which is explicitly designed to be recoverable.

## References

- [Gossipsub v1.1 Specification](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md)
- [Lighthouse Scoring Implementation](https://github.com/sigp/lighthouse/blob/stable/beacon_node/lighthouse_network/src/peer_manager/score.rs)
- [Lodestar Scoring Implementation](https://github.com/ChainSafe/lodestar/tree/unstable/packages/beacon-node/src/network/gossip)
