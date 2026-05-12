# Why `app, kernel, app, tail, hiding` is not a valid Chonk sequence

There are **two** independent reasons this sequence fails — only one of them is the "reset before tail" constraint.

## 1. The second `app` is not absorbed anywhere

The kernel chain is `init/inner → inner → … → tail`, where each kernel takes a `PrivateCallData` (an app) as input and verifies/folds it into the accumulator. In `app, kernel, app, tail`:

- The first kernel absorbs app1 (`runBatchedKernel` at `yarn-project/pxe/src/private_kernel/private_kernel_execution_prover.ts:454`).
- App2's `PrivateCircuitPublicInputs` (note hashes, nullifiers, read requests) are never propagated into any kernel.
- App2's folded proof would also dangle in the IVC accumulator with nothing to verify it.

The tail takes a `PrivateKernelData` (output of a prior kernel/reset, allowlisted by VK index in `noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/private_kernel_tail.nr:18-26`), not a `PrivateCircuitPublicInputs`. So there's no way to "feed" app2 into the tail.

## 2. Even `app, kernel, tail, hiding` (one app, no reset) fails

The reset-before-tail requirement is enforced in `noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/components/previous_kernel_for_tail_validator.nr`:

- **Siloing** (lines 123-125, via `validate_siloed_values.nr`): `note_hashes`, `nullifiers`, and `private_logs` must have `contract_address == 0`. Siloing happens *only* in the reset circuit.
- **Read requests must be empty** (lines 52-66): `note_hash_read_requests`, `nullifier_read_requests`, `scoped_key_validation_requests_and_separators` all need length 0. App circuits emit these; only the reset clears them.
- **Transient note-hash/nullifier pairs must be squashed** before tail emits the final accumulated arrays.
- **At least one nullifier exists** (line 89, the tx-request nullifier), and that nullifier must be siloed — so a reset is unavoidable even for the most trivial private-only tx.

The PXE prover encodes (2) explicitly at `yarn-project/pxe/src/private_kernel/private_kernel_execution_prover.ts:189-196`: the "final reset must be performed exactly once" because siloing of note hashes, nullifiers, and private logs is bundled into one reset invocation (the reset dimension config doesn't have standalone siloing dimensions).

## Why one reset (and only one)

Siloing replaces the unsiloed `contract_address` field with `0` on the array entries; running siloing twice would no-op the second time but the reset's output validator wires expect specific input shapes, so the dimensions config doesn't allow it. That's why the minimal valid sequence is always `…, reset, tail, hiding` — and `app, kernel, app, reset, tail, hiding` (with a `kernel` between the two apps) is the shortest sequence that includes two apps.
