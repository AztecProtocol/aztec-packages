# Goblin Flush: Unbounded Circuit Accumulation in Chonk

## Problem

Chonk's accumulation capacity is bounded by the ECCVM circuit size (`2^CONST_ECCVM_LOG_N = 2^15 = 32,768` rows). Each folding step generates ~62 short scalar multiplications that are deferred to the ECCVM via Goblin's op queue. Currently, the maximum is ~17 app circuits before the ECCVM overflows.

## Goal

Enable theoretically unbounded accumulation by periodically "flushing" the Goblin op queue mid-accumulation. Each flush proves the accumulated EC ops so far and resets the queue, keeping the ECCVM size bounded regardless of how many circuits are accumulated.

## Design

### Flush Operation

A Goblin flush consists of:
1. **Merge proof** — proves op queue consistency for accumulated ops
2. **ECCVM proof** — proves the EC operations on Grumpkin
3. **Translator proof** — bridges the result back from Grumpkin to BN254

After a flush, the op queue is reset and accumulation continues on a fresh queue. Each flush also produces an IPA opening claim that must be accumulated (see IPA Claim Accumulation below).

### IPA Claim Accumulation

Each flush produces an IPA opening claim (Grumpkin curve) from its ECCVM proof. These claims must be accumulated so the final proof output is constant-size regardless of the number of flushes.

**Running accumulator through the kernel chain.** Every kernel (not just flush kernels) carries a running IPA claim accumulator in its public inputs (`KernelIO` / `HidingKernelIO`). The accumulator is ~8 field elements (a commitment point + opening pair).

- **Init kernel**: Sets a trivial/default accumulator in output.
- **Inner kernels**: Pass-through — copy the accumulator from the previous kernel's public inputs to their own. No accumulation gates, but not free — the pass-through adds copy constraints in the permutation argument.
- **Flush kernels**: Fold the flush's IPA claim into the running accumulator (~54K gates for the accumulation circuit).
- **Tail kernel**: Pass-through.
- **Hiding kernel**: Pass-through — outputs the accumulated claim in `HidingKernelIO`.
- **`prove()`**: The final ECCVM IPA claim only exists after `prove()` runs the ECCVM prover, when no kernels remain. So `prove()` builds a dedicated IPA accumulation circuit that folds the final claim into the kernel-chain accumulator. This circuit's Oink is a separate sub-proof; its sumcheck/PCS are batched into the joint proof (see Proof Structure).

For zero-flush flows, the trivial accumulator passes through the entire kernel chain untouched. The accumulation circuit in `prove()` folds the single final IPA claim into the trivial accumulator, producing a result equivalent to today's single IPA claim.

### Flush Kernel

A flush kernel is a new fixed-size kernel circuit that:
- Recursively verifies the flush proof (merge + ECCVM + Translator)
- Folds the flush's IPA claim into the running accumulator (~54K gates)
- Passes through the HyperNova accumulator (it participates in the folding chain)
- Has constant, known ECCVM row cost

### Circuit Sequence With Flush

Without flush:
```
App₀ → Kernel₀ → App₁ → Kernel₁ → ... → Tail → Hiding
```

With flush (triggered before App₂):
```
App₀ → Kernel₀ → App₁ → Kernel₁ → [Flush + FlushKernel] → App₂ → Kernel₂ → ... → Tail → Hiding
```

The flush mechanism is opaque to the caller — `accumulate()` handles flush decisions and flush kernel insertion internally. The caller only observes a rejection if an app exceeds ECCVM capacity.

### App Size Constraint

Apps whose EC ops alone (plus one kernel) exceed ECCVM capacity are **rejected** — they can never fit, flush or not. This is enforced after building the circuit by checking the per-subtable ECCVM row contribution.

## Temporary Op Queue: Build-Then-Transplant

### Problem

Currently, the `MegaCircuitBuilder` receives the shared IVC op queue at construction time. EC ops land on the shared queue immediately during circuit construction, which happens *outside* of `accumulate()`. By the time chonk sees the circuit, the ops are already on the shared queue — too late to flush cleanly.

### Solution

Build each app circuit with a **temporary, isolated op queue**. After construction, `accumulate()` inspects the temp queue's ECCVM row cost and decides whether to flush before transplanting the ops onto the shared queue.

This works because the circuit builder's `blocks.ecc_op` block stores EC op data as local witness variable indices — it has no direct references into the op queue. The op queue and the circuit's gate data are independent representations of the same operations.

### Flow

```
1. Create a temporary op queue
2. Build the app circuit using the temp queue (all EC ops land there)
3. Pass circuit to accumulate()
4. accumulate() computes:
     app_rows   = temp_queue.get_num_rows()
     total_rows = shared_queue.get_num_rows() + app_rows + KERNEL_ECCVM_ROWS
5. if app_rows + KERNEL_ECCVM_ROWS > ECCVM_CAPACITY:
     → REJECT (app too big, will never fit)
6. if total_rows > ECCVM_CAPACITY:
     → flush shared queue (merge + ECCVM + Translator)
     → insert flush kernel
7. Transplant temp queue's subtable onto shared queue
8. Accumulate normally
```

Step 6 is guaranteed to succeed after flush: the shared queue is fresh with full capacity, and step 5 confirmed the app fits.

### Transplant Operation

Moving the temp subtable onto the shared queue requires:
- Moving the ECCVM ops subtable entries (deque, cheap)
- Moving the Ultra ops subtable entries (deque, cheap)
- Updating the shared queue's native accumulator to reflect the transplanted ops
- Updating the shared queue's `EccvmRowTracker` with the transplanted ops' contribution

Op queue subtables are small (hundreds of ops per circuit), so this is negligible cost.

### Why Not Rollback?

The rollback approach (build on shared queue, detect overflow, undo ops, flush, rebuild) requires:
- Snapshot/restore machinery on the op queue
- Rebuilding the circuit from scratch after flush (wasted work)
- The caller to cooperate in the rebuild (leaks flush details)

The temporary queue approach avoids all of this. The circuit is built once, and the transplant is a cheap move.

## Hard Bound Safety Net

If N circuits (e.g., 17) have been accumulated without a flush, force one regardless of ECCVM utilization. This provides a guaranteed upper bound and avoids relying solely on overflow detection.

## Chonk API Changes

### `accumulate()`

The flush logic wraps the existing accumulation. The caller builds and passes a circuit as before — flush insertion is internal.

```
accumulate(circuit, vk):
    app_rows = circuit.temp_op_queue->get_num_rows()

    // App too big — reject
    if app_rows + KERNEL_ECCVM_ROWS > ECCVM_CAPACITY:
        REJECT

    // Overflow — flush then transplant
    if shared_queue.get_num_rows() + app_rows + KERNEL_ECCVM_ROWS > ECCVM_CAPACITY:
        flush_goblin()
        insert_flush_kernel()

    // Hard bound
    if num_circuits_since_last_flush >= HARD_FLUSH_BOUND:
        flush_goblin()
        insert_flush_kernel()

    // Move app's ops onto shared queue
    shared_queue.transplant(circuit.temp_op_queue)

    // ... existing proving logic ...
```

### Circuit Construction (caller side)

```cpp
// Before (current): circuit built with shared IVC op queue
auto op_queue = ivc.get_goblin().op_queue;
MegaCircuitBuilder circuit{ op_queue };

// After: circuit built with temporary op queue
auto temp_queue = std::make_shared<ECCOpQueue>();
MegaCircuitBuilder circuit{ temp_queue };
// ... build circuit ...
ivc.accumulate(circuit, vk);  // accumulate() handles transplant internally
```

### New state in Chonk

```cpp
class Chonk {
    // Counter for hard bound
    size_t num_circuits_since_last_flush = 0;

    // Native copy of the running IPA accumulator (mirrors what's in KernelIO).
    // Updated after each flush kernel. Used in prove() as input to the
    // IPA accumulation circuit.
    OpeningClaim<curve::Grumpkin> ipa_accumulator; // trivial default initially

    // Flush method
    void flush_goblin();
```

### New op queue method

```cpp
class ECCOpQueue {
public:
    // Move a temp queue's subtable onto this queue
    void transplant(std::shared_ptr<ECCOpQueue> temp_queue);
};
```

## Proof Structure

The proof remains **constant size** (6 sub-proofs):
1. **MegaZK Oink proof** (hiding kernel pre-sumcheck)
2. **Merge proof** (final op queue subtable)
3. **ECCVM proof** (final EC operations on Grumpkin)
4. **IPA proof** (opening proof for ECCVM's polynomial commitment)
5. **IPA accumulation Oink proof** (pre-sumcheck for the accumulation circuit)
6. **Joint proof** (batched sumcheck + batched PCS for MegaZK, Translator, and IPA accumulation)

`prove()` sequence:
```
1. MegaZK Oink              (hiding kernel, shared transcript)
2. Merge proof               (final subtable, APPEND mode)
3. ECCVM proof               → produces IPA opening claim
4. IPA proof                 → proves the ECCVM opening claim (separate transcript)
5. IPA accumulation Oink     → folds final IPA claim into kernel-chain accumulator
6. Joint proof               → Translator Oink + batched sumcheck + batched PCS
                                (batches 3 circuits: MegaZK, Translator, IPA accumulation)
```

## Impact on Non-Flush Flows

Even flows that never trigger a flush are affected by the following structural changes:

### Changes vs today's flow
- **Temp op queue API**: All callers must build app circuits with a temporary op queue instead of the shared IVC op queue. `accumulate()` handles transplant internally.
- **KernelIO / HidingKernelIO**: Gain IPA accumulator fields. All kernel VKs change.
- **`complete_kernel_circuit_logic()`**: Every kernel passes through the accumulator (copy constraints only).
- **`prove()`**: New IPA accumulation circuit + Oink sub-proof. Joint proof batches 3 circuits instead of 2.
- **Verifier**: Batches three circuit reductions (MegaZK, Translator, IPA accumulation) instead of two.
- **Constants**: `HIDING_KERNEL_PUBLIC_INPUTS_SIZE`, `CHONK_PROOF_LENGTH`, Noir constants, TypeScript constants all update.

### Constant with or without flushes
The proof structure, verifier logic, and kernel VKs are identical regardless of whether flushes occurred. The only difference is internal to the accumulation: flush kernels fold IPA claims into the running accumulator, while non-flush kernels pass it through. The consumer (verifier, rollup) cannot distinguish a zero-flush proof from an N-flush proof.

## Resolved Design Decisions

1. **IPA accumulation location**: Running accumulator propagated through the kernel chain. Flush kernels pay ~54K gates; all other kernels just pass through. Final fold happens in a dedicated accumulation circuit in `prove()`, batched into the joint proof.
2. **Temp op queue is universal**: All flows use temporary op queues — one code path, no branching on flush mode.
3. **Tail/hiding interaction**: Unaffected by flush — ZK masking doesn't depend on queue history. Hiding kernel passes the accumulator through; it does not perform accumulation.
4. **Kernel op queue**: Kernels use the shared op queue (fixed ECCVM cost). Temp queues are only needed for apps.

## Open Questions

1. **Flush kernel circuit design**: Full recursive verifiers for merge + ECCVM + Translator, plus IPA accumulation gadget. What is total gate count / ECCVM row cost?
2. **IPA claim accumulation protocol**: Is this the same `IPA::accumulate()` already used at the rollup level? If so, the accumulated claim type is `OpeningClaim<Grumpkin>` — same as a raw claim — and rollup changes are minimal.
3. **Op queue reset semantics**: After a flush, how exactly is the merged portion cleared? Does the subtable deque structure support this cleanly?
4. **Hard bound value**: Should be derived from ECCVM capacity and known per-circuit costs rather than hardcoded.
5. **Testing strategy**: How to test flush triggering, transplant correctness, and proof validity across flushes?
