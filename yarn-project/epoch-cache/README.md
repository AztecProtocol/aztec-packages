# Epoch Cache

Caches validator committee information per epoch to reduce L1 RPC traffic. Provides
the current committee, proposer selection, and escape hatch status for any given slot
or epoch, used by the sequencer, validator client, and other node components that need
to know who can propose or attest in a given slot.

## Committee Computation

Each epoch has a **committee**: a subset of all registered validators selected to
participate in consensus for that epoch. The committee is determined by three inputs:

1. **The validator set** -- the full list of registered attesters, snapshotted at a
   past point in time.
2. **A RANDAO seed** -- pseudo-random value derived from Ethereum's `block.prevrandao`,
   also sampled from the past.
3. **A sampling algorithm** -- a Fisher-Yates-style shuffle that picks
   `targetCommitteeSize` indices from the validator set without replacement.

Once computed, the committee is fixed for the entire epoch. The L1 rollup contract
stores a keccak256 commitment of the committee addresses to prevent substitution.

### Sampling Algorithm

The sampling draws `targetCommitteeSize` indices from a pool of `validatorSetSize`
using a sample-without-replacement approach:

```
for i in 0..committeeSize:
    sampledIndex = keccak256(seed, i) % (poolSize - i)
    committee[i] = pool[sampledIndex]
    swap pool[sampledIndex] with pool[last]
    shrink pool by 1
```

Each iteration hashes the seed with the iteration index to pick a random position,
then swaps the picked element to the end and shrinks the pool, ensuring no validator
is selected twice.

## LAG Values

Two lag parameters prevent manipulation of committee composition:

### `lagInEpochsForValidatorSet`

When computing the committee for epoch N, the validator set is read from a snapshot
taken `lagInEpochsForValidatorSet` epochs in the past. The sampling timestamp is:

```
validatorSetTimestamp = epochStart(N) - (lagInEpochsForValidatorSet * epochDuration * slotDuration)
```

This prevents an attacker from registering new validators just before an epoch to
influence who gets selected. The validator set is locked well in advance.

### `lagInEpochsForRandao`

The RANDAO seed used for committee selection is sampled from
`lagInEpochsForRandao` epochs in the past:

```
randaoTimestamp = epochStart(N) - (lagInEpochsForRandao * epochDuration * slotDuration)
```

This prevents L1 validators from previewing the randomness and coordinating to
become proposers.

### Why Two Separate Lags?

The constraint `lagInEpochsForValidatorSet >= lagInEpochsForRandao` is enforced.
If both lags were equal, an attacker who learns the RANDAO seed could still
register validators in time to be included in the sampled set. By freezing the
validator set further back than the RANDAO seed, the attacker knows the randomness
but can no longer change the input population it selects from.

## RANDAO Seed

The RANDAO seed provides per-epoch randomness for committee selection and proposer
assignment. It works as follows:

1. **Checkpointing**: Each epoch, `block.prevrandao` (Ethereum's beacon chain
   randomness) is stored in a checkpointed mapping keyed by epoch timestamp.
   Multiple calls in the same epoch are idempotent.

2. **Seed derivation**: The actual seed used for sampling is:
   ```
   seed = keccak256(abi.encode(epochNumber, storedRandao))
   ```
   where `storedRandao` is the value checkpointed at or before the RANDAO sampling
   timestamp (determined by `lagInEpochsForRandao`). Mixing in the epoch number
   ensures distinct seeds even if the same RANDAO value is reused.

3. **Bootstrap**: The first two epochs use a bootstrapped RANDAO value stored at
   initialization, since there is no prior history to sample from.

## Proposer Selection

Within a committee, a single **proposer** is designated for each slot. The proposer
is responsible for assembling transactions into a block and publishing it.

The proposer index within the committee is:

```
proposerIndex = keccak256(abi.encode(epoch, slot, seed)) % committeeSize
```

This is deterministic: anyone with the epoch number, slot number, and seed can
independently compute who the proposer is. Each slot gets a different proposer
because the slot number is mixed into the hash.

### Proposer Pipelining

The proposer always builds for the *next* slot rather than the current one
(`PROPOSER_PIPELINING_SLOT_OFFSET = 1`). This gives the proposer a full slot of
lead time to assemble and propagate the block. The "target slot" methods on the
epoch cache apply this offset automatically.

### Empty Committees

If the committee is empty (i.e., `targetCommitteeSize` is 0), anyone can propose.
The proposer methods return `undefined` in this case rather than throwing. If the
committee should exist but doesn't (insufficient validators registered), a
`NoCommitteeError` is thrown.

## Escape Hatch

The escape hatch is a censorship-resistance mechanism. It opens periodically
(every `FREQUENCY` epochs, for `ACTIVE_DURATION` epochs) and allows a single
designated proposer to submit blocks without committee attestations.

### Candidate System

The escape hatch has its own candidate pool, separate from the main validator set:

- Candidates join by posting a bond (`BOND_SIZE`).
- A designated proposer is selected per hatch window using a similar
  RANDAO-based random selection from the candidate set.
- If the designated proposer fails to propose and prove during their window,
  they are penalized (`FAILED_HATCH_PUNISHMENT`).
- Candidates exit through a two-step process (`initiateExit` then
  `leaveCandidateSet`) with a withdrawal tax.

### Integration with Epoch Cache

The epoch cache queries `isHatchOpen(epoch)` on the escape hatch contract and
caches the result alongside the committee info for each epoch. This flag is
exposed via `isEscapeHatchOpen(epoch)` and `isEscapeHatchOpenAtSlot(slot)`,
used by the sequencer to decide whether to require committee attestations.

## TTL-based Caching with Finalization Tracking

Each cache entry stores L1 provenance metadata alongside the committee data:
the L1 block number, hash, and timestamp at query time, plus a **finalized** flag.

### Finalization Check

When fetching committee data, the epoch cache queries both the latest and finalized
L1 blocks in parallel. It computes the **sampling timestamp** for the epoch:

```
samplingTs = epochStart(N) - lagInEpochsForRandao * epochDuration * slotDuration
```

Using `lagInEpochsForRandao` as the binding constraint (it is always
<= `lagInEpochsForValidatorSet`). If `samplingTs <= l1FinalizedTimestamp`, the
entry is marked as **finalized**.

### Cache Behaviour

- **Finalized entries** are cached permanently (within LRU limits). An L1 reorg
  cannot change data that has been finalized, so there is no risk of stale data.
- **Non-finalized entries** are cached with a TTL of one Ethereum slot duration
  (typically 12 seconds). After this TTL, the next request triggers a re-fetch
  from L1. On re-fetch, if the data is now finalized, the entry gets promoted
  to permanent.
- **Unstable epochs** (sampling timestamp beyond the latest L1 block) cause an
  error, since the L1 contract itself would revert.

This approach preserves **safety** (stale data from L1 reorgs gets refreshed
within one Ethereum slot) while maintaining **liveness** (the cache never refuses
to serve data that L1 accepts, even if L1 finalization stalls).

### Concurrency

The cache map stores both resolved entries and in-flight promises. When a fetch
starts, the promise is placed directly in the cache. Concurrent callers for the
same epoch detect the promise and await it, ensuring only one L1 query per epoch
at a time. On failure, the promise is replaced with the previous stale entry (if
any) so the next caller retries cleanly.

## Caching Strategy

The epoch cache stores committee info (committee members, seed, escape hatch
status) per epoch in an LRU-style map with a configurable size (default 12
epochs). Cache entries are only created for epochs with non-empty committees;
empty results are not cached to allow retries.

The cache also maintains a separate set of all registered validators, refreshed
on a configurable interval (`validatorRefreshIntervalSeconds`, default 60s),
used to check validator registration status independently of committee membership.

## Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `cacheSize` | 12 | Max number of epoch committee entries to keep |
| `validatorRefreshIntervalSeconds` | 60 | How often to refresh the full validator list |
| `lagInEpochsForValidatorSet` | (from L1) | How far back to snapshot the validator set |
| `lagInEpochsForRandao` | (from L1) | How far back to sample the RANDAO seed |
| `targetCommitteeSize` | (from L1) | Number of validators to select per epoch |
