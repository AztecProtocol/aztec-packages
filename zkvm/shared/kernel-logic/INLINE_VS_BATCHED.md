# Inline vs Batched Kernel Processing

## Current design (batched)

```
Phase A: Execute all private functions depth-first
  → Collect all side effects into flat arrays
Phase B: Kernel processes the arrays
  1. Squash transient note_hash↔nullifier pairs
  2. Verify read requests via Merkle witnesses
  3. Silo note hashes and nullifiers by contract address
  4. Split by revertibility
  5. Uniquify note hashes (nonce + silo)
  6. Meter gas
  7. Assemble KernelPublicInputs
```

## Alternative design (inline, matching VM2)

```
Single phase: Execute functions, process side effects at emission time
  emit_note_hash(value):
    → siloed = poseidon2(contract_address, value)          [1 hash]
    → unique = poseidon2(nonce, siloed)                     [1 hash]
    → append to output note_hashes array
    → meter DA gas immediately
  
  emit_nullifier(value):
    → siloed = poseidon2(contract_address, value)          [1 hash]
    → append to output nullifiers array
    → meter DA gas immediately
  
  read_note_hash(value):
    → verify Merkle witness against tree root              [42 hashes]
    → (no output — reads don't appear in public inputs)
  
  call_private_function(target, selector, args):
    → push new execution context (contract_address changes)
    → on return, pop context
```

## Analysis: what changes

### Operations that CAN move inline

| Operation | Current | Inline | Cycle impact |
|-----------|---------|--------|-------------|
| **Siloing** | Batch after collection | At emit_note_hash/nullifier time | Same # of hashes, just reordered |
| **Read verification** | Batch after collection | At read_request time | Same # of hashes, just reordered |
| **Gas metering** | Batch after collection | Per-operation increment | Slightly cheaper (no array scan) |
| **Revertibility tracking** | Split arrays by counter | Track phase inline | Cheaper (no split pass) |

### Operations that are HARD to move inline

| Operation | Why it's hard inline |
|-----------|---------------------|
| **Transient squash** | Need to see ALL note_hashes and nullifiers before matching pairs. A nullifier for note_hash N might be emitted many calls later. Inline requires either: (a) deferred squashing anyway, or (b) the "emit_nullifier_for_note_hash" pattern which explicitly links them. |
| **Uniquification** | Needs `first_nullifier` (the protocol nullifier) which might not be known until the end. Also needs a sequential `note_index` counter. |

### Key insight: squashing

With the current batched design, transient squashing identifies note_hash↔nullifier
pairs that cancel each other (a note created and destroyed in the same tx). This
requires seeing all side effects before processing.

With inline processing, squashing could work differently:
- When `emit_nullifier_for_note_hash(nullifier, note_hash)` is called, the note_hash
  is already in the output array. We could REMOVE it immediately (and skip adding
  the nullifier to the output). No hints needed.
- This requires the "linked" nullifier pattern (which we already use), NOT the
  "independent nullifier that happens to reference a note_hash" pattern.

### Key insight: uniquification

Note hash uniquification: `unique = H(nonce, siloed)` where `nonce = H(first_nullifier, index)`.
- `first_nullifier` is the protocol nullifier (hash of the tx request), known at tx start.
- `index` is the sequential position of this note hash in the tx's output.

With inline processing, both are available at emit time:
- `first_nullifier` is computed once at the start.
- `index` is an incrementing counter.

So uniquification CAN move inline.

## Efficiency comparison

### Batched (current)
```
Total work:
  Execute functions:       side effects written to arrays
  collect_side_effects:    O(N) walk of call tree
  squash:                  O(N) scan + O(K) verification
  verify_reads:            O(R × 42) Poseidon2 compress
  silo:                    O(N) Poseidon2 hashes
  split:                   O(N) scan
  uniquify:                O(M) Poseidon2 hashes
  gas:                     O(N) arithmetic

Extra overhead: array allocations, multiple passes over same data, hint
structures (TransientSquashPair, ReadRequestAction), intermediate storage.
```

### Inline
```
Total work:
  Execute functions, and for each side effect:
    emit_note_hash:  silo + uniquify                    [2 hashes]
    emit_nullifier:  silo                                [1 hash]
    emit_nullifier_for_note_hash: silo + remove matched  [1 hash, 1 lookup]
    read_request:    verify Merkle witness                [42 hashes]
    gas:             increment counter                    [1 add]

No extra overhead: no intermediate arrays, no second pass, no hints for
squashing (linked nullifiers handle it), no split pass (track phase inline).
```

### Cycle impact estimate

The Poseidon2 hash count is IDENTICAL — same number of silos, same number
of Merkle verifications, same uniquification. The savings are in:
- Eliminating collect/flatten pass: ~5-10K cycles
- Eliminating squash hint verification: ~5-10K cycles  
- Eliminating split pass: ~2-5K cycles
- Eliminating intermediate Vec allocations: ~5-20K cycles

Total savings estimate: **20-50K cycles** (minor compared to 4-30M total).
The inline approach is cleaner architecturally but the cycle savings are
negligible. The dominant cost (Poseidon2 hashes) is unchanged.

## Recommendation

**Move to inline processing.** Not for cycle savings (which are minimal) but for:

1. **Simpler architecture**: no kernel phase, no hint structures, no second pass.
2. **Matches VM2**: proven architecture in BB's public execution VM.
3. **Enables immediate error detection**: out-of-gas, invalid reads fail fast.
4. **Natural for interpreter**: when the WASM interpreter executes opcodes,
   inline processing means each opcode's side effect is handled at that point.
   No need to collect arrays and process them later.
5. **Eliminates squash hints**: linked nullifiers (`emit_nullifier_for_note_hash`)
   handle squashing at emit time. No need for host-computed hint pairs.

The implementation change: merge the kernel logic INTO the `PrivateContext`
methods. `emit_note_hash` calls `silo()` and `uniquify()` immediately.
`push_note_hash_read_request` calls `verify_merkle_witness()` immediately.
The context accumulates the final siloed/uniquified outputs directly.

## Impact on existing code

- `kernel-logic/` crate: the individual functions (silo, squash, merkle, gas)
  stay as-is. The top-level `verify_and_assemble` and `collect_side_effects`
  become unnecessary.
- `aztec-sdk/context.rs`: `PrivateContext` gains access to `Precompiles` and
  calls silo/uniquify/verify inline.
- `test-contracts/runner.rs`: simplifies to just "run the workload" — no
  separate kernel step.
- `data-types/bundle.rs`: `KernelHints` simplifies (no squash pairs, no
  read request actions).

## Benchmark results (2026-04-11)

A/B comparison on Jolt with real BN254 Poseidon2 and 42-deep Merkle reads:

| Workload | Batched cycles | Inline cycles | Batched prove | Inline prove |
|----------|---------------|--------------|--------------|-------------|
| minimal | 2.1M | 2.1M* | 9.4s | 12.5s* |
| token_transfer | 33.6M | 33.6M | 67.6s | 67.5s |
| private_swap | 33.6M | 33.6M† | 67.8s | 67.8s† |

*Minimal: inline has slightly more overhead, hits next power-of-2 trace size.
†Private_swap: initial measurement showed 2x regression because the inline
runner was building Merkle trees INSIDE the guest. After fixing (witnesses
are host-provided hints, guest only hashes leaf-to-root), cycles are equal.

**Conclusion**: inline processing is cycle-neutral when implemented correctly.
The architectural simplicity benefits are free.
