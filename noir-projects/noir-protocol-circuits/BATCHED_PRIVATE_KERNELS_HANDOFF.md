# Batched Private Kernels Handoff

## Current Branch

Branch: `lde/n1-apps`

Base observed locally: `merge-train/barretenberg` at `f2fd2bfbcc`

Commits on top of the base:

- `f172996cf5 additional test`
- `ab8c0cfdc9 PoC N=3 test suite`
- `cf50be9ea1 init_3 prototype`
- `46529d485a inner_3`
- `fd2b57bed1 share logic`
- `4771dd8ee2 tests showing equivalence of *_3 kernels with old equivalents`
- `ed18d04d03 more failure tests`
- `c4e40a9c35 inner_6 PoC - no surprises`

The shared next-call execution cleanup, `_3` equivalence tests, extra `_3` negative tests, and explicit `inner_6`
compile/profile spike are all committed on the branch. This handoff doc is currently untracked.

## How We Got Here

The initial design direction was to make the first app call in the init kernel mirror the later app calls more closely:
construct an output unconstrained, then validate that constructed output with constrained logic. The goal was to reduce
the conceptual difference between init slot 0 and subsequent inner-call slots.

That path was tried and then discarded. It increased gate counts and did not materially simplify the implementation.
The asymmetry in init is real: slot 0 establishes transaction-wide state, handles protocol nullifier injection, and
sets init-only fields. Treating it as just another app-slot transition obscured more than it helped.

After dropping that path, the work moved to direct fixed-width prototypes:

1. Build tests around init-kernel behavior with multiple apps.
2. Extend the tests from two apps to three apps.
3. Add a concrete `private_kernel_init_3` prototype.
4. Add a concrete `private_kernel_inner_3` prototype.
5. Notice that the post-slot-0 transition logic is identical for `init_3` slots 1 and 2 and all `inner_3` slots.
6. Extract that common transition into a shared helper.

## What The Branch Adds

### Test Coverage

`f172996cf5` adds an inner output-composition test:

- `expiration_timestamp_pick_contract_update_horizon`

This pins the rule that expiration timestamp reduction includes the contract update horizon derived from the anchor
block timestamp plus `DEFAULT_UPDATE_DELAY - 1`.

`ab8c0cfdc9` adds `private_kernel_batch_spike` tests. These exercise fixed three-call behavior without changing PXE
scheduling:

- `batch_3_accumulates_side_effects_across_slots`
- `batch_3_linear_chain_consumes_all_calls`
- `batch_3_linear_chain_matches_sequential_kernels`
- `batch_3_depth_first_child_keeps_sibling_on_stack`
- `batch_3_depth_first_with_sibling_matches_sequential_kernels`
- `batch_3_second_call_must_match_first_call_stack_fails`
- `batch_3_third_call_must_match_second_call_stack_fails`
- `batch_3_fee_payer_conflict_fails`
- `batch_3_public_teardown_conflict_fails`
- `batch_3_min_revertible_side_effect_counter_conflict_fails`
- `batch_3_static_call_requires_static_nested_private_call_fails`
- `batch_3_static_call_restrictions_apply_to_next_slot_fails`
- `inner_3_accumulates_side_effects_after_previous_kernel`
- `inner_3_with_previous_side_effects_matches_sequential_kernels`
- `inner_3_linear_chain_consumes_all_calls`
- `inner_3_linear_chain_matches_sequential_kernels`

The tests cover the main properties that first make batching interesting: accumulated side effects across slots,
slot-to-slot private-call-stack chaining, depth-first ordering with a sibling left on the stack, and an intra-batch
set-once aggregate conflicts.

The negative tests now pin the main cross-slot constraints for the fixed `N = 3` prototype:

- slot 1 must consume the request produced or exposed by slot 0;
- slot 2 must consume the request produced or exposed by slot 1;
- fee payer cannot be set twice in one batch;
- public teardown request cannot be set twice in one batch;
- non-zero `min_revertible_side_effect_counter` cannot be set twice in one batch;
- static calls can only create static nested private calls;
- static-call side-effect restrictions apply to a later slot reached through a static request.

The relation-equivalence tests compare full `PrivateKernelCircuitPublicInputs` field-by-field:

- `init_3(private_call_0, private_call_1, private_call_2)` equals existing `init(private_call_0)` followed by two
  existing `inner` executions;
- `inner_3(previous_kernel, private_call_0, private_call_1, private_call_2)` equals three existing `inner` executions;
- coverage includes a linear chain, a depth-first shape with a sibling left on the stack, and an inner case with
  previous accumulated side effects.

Validation performed:

- `/mnt/user-data/luke/aztec-packages/noir/noir-repo/target/release/nargo test --package private_kernel_lib --silence-warnings --skip-brillig-constraints-check`
- result: 833 tests passed.

### Init 3 Prototype

`cf50be9ea1` adds:

- `crates/private-kernel-init-3/Nargo.toml`
- `crates/private-kernel-init-3/src/main.nr`
- `private_kernel_init_3.nr`
- workspace wiring in `Nargo.template.toml`

The `private-kernel-init-3` entrypoint accepts:

- init scalars: `tx_request`, `vk_tree_root`, `protocol_contracts`, `is_private_only`,
  `first_nullifier_hint`, and `revertible_counter_hint`;
- three `PrivateCallDataWithoutPublicInputs` values;
- three app public input databus columns: `call_data(1)`, `call_data(2)`, and `call_data(3)`.

The library implementation runs the existing one-app init kernel for `private_call_0`, then applies two inner-call
transitions for `private_call_1` and `private_call_2`.

### Inner 3 Prototype

`46529d485a` adds:

- `crates/private-kernel-inner-3/Nargo.toml`
- `crates/private-kernel-inner-3/src/main.nr`
- `private_kernel_inner_3.nr`
- workspace wiring in `Nargo.template.toml`

The `private-kernel-inner-3` entrypoint accepts:

- one previous kernel, with public inputs on `call_data(0)`;
- three `PrivateCallDataWithoutPublicInputs` values;
- three app public input databus columns: `call_data(1)`, `call_data(2)`, and `call_data(3)`.

The library implementation verifies the previous kernel, validates its VK against the allowed previous-circuit set, then
applies three inner-call transitions in sequence.

### Inner 6 Compile/Profile Spike

An explicit `private_kernel_inner_6` spike has been added without introducing a Noir-level array loop:

- `crates/private-kernel-inner-6/Nargo.toml`
- `crates/private-kernel-inner-6/src/main.nr`
- `private_kernel_inner_6.nr`
- workspace wiring in `Nargo.template.toml`

The implementation follows the same explicit pattern as `inner_3`: verify the external previous kernel once, validate
its VK, then call `execute_next_private_call` six times.

Validation performed:

- `/mnt/user-data/luke/aztec-packages/noir/noir-repo/target/release/nargo compile --package private_kernel_inner_6 --force --silence-warnings --skip-brillig-constraints-check`
- `/mnt/user-data/luke/aztec-packages/noir/noir-repo/target/release/noir-profiler opcodes --artifact-path target/private_kernel_inner_6.json --output /tmp/private-kernel-inner-6-opcodes`
- `/mnt/user-data/luke/aztec-packages/noir/noir-repo/target/release/nargo test --package private_kernel_lib --silence-warnings --skip-brillig-constraints-check`

Results:

- `target/private_kernel_inner_6.json`: about 2.4 MiB, bytecode length `1413780`
- `private_kernel_inner_6`: `main` has `89566` ACIR opcodes
- `private_kernel_lib`: 833 tests passed

The `inner_6` ACIR count matches the linear projection from `inner_1` and `inner_3`:

- `inner_1`: `18256` main ACIR opcodes
- `inner_3`: `46780` main ACIR opcodes
- projected `inner_6`: `18256 + 5 * ((46780 - 18256) / 2) = 89566`
- measured `inner_6`: `89566`

This confirms that the current explicit repeated-transition design scales linearly per additional app slot at the ACIR
level.

### Shared Transition Helper

`fd2b57bed1` adds `private_kernel_batch.nr` and wires it as `pub(crate)` from `private-kernel-lib`.

The helper:

1. validates the next app as an inner call against the previous kernel public inputs;
2. unconstrained-composes the next output by cloning the previous output, popping the top private call request, and
   appending the current private call effects;
3. optionally validates the composed output with `PrivateKernelCircuitOutputValidator::validate_as_inner_call`.

Both `private_kernel_init_3` and `private_kernel_inner_3` now call this helper for every post-init app transition.

### Entrypoint Compile / ACIR Integration Proof

The actual `_3` circuit packages compile through their `main.nr` entrypoints with databus public inputs, not just
through library tests:

- `/mnt/user-data/luke/aztec-packages/noir/noir-repo/target/release/nargo compile --package private_kernel_init_3 --force --silence-warnings --skip-brillig-constraints-check`
- `/mnt/user-data/luke/aztec-packages/noir/noir-repo/target/release/nargo compile --package private_kernel_inner_3 --force --silence-warnings --skip-brillig-constraints-check`

Artifacts:

- `target/private_kernel_init_3.json`: about 1.4 MiB, bytecode length `574152`
- `target/private_kernel_inner_3.json`: about 1.6 MiB, bytecode length `756008`

`noir-profiler opcodes` can inspect both artifacts:

- `private_kernel_init_3`: `main` has `37381` ACIR opcodes
- `private_kernel_inner_3`: `main` has `46780` ACIR opcodes

BB gate counts are not currently available for these Chonk artifacts. `bb gates --scheme chonk` fails on the current
artifacts, so ACIR opcode counts are the useful local inspection tool until the required barretenberg support exists.

### Related BB Work: PR #22640

PR `#22640` (`29a4f46c95 Multi app scaffolding`) is relevant but not sufficient by itself. It starts generalizing
barretenberg's Chonk databus shape from one secondary app calldata column to indexed app calldata slots:

- introduces `NUM_APP_PER_KERNEL`;
- renames the databus layout to kernel calldata, app calldata, and return data;
- changes kernel public inputs to carry an array of app return-data commitments;
- allows ACIR `call_data(id)` with app ids in `[1, NUM_APP_PER_KERNEL]`;
- threads an app return-data index through Chonk recursive verification.

The current PR still has `NUM_APP_PER_KERNEL = 1` and explicitly asserts that multiple app calldata witness columns are
not wired yet. So it does not make `private_kernel_inner_3` or `private_kernel_inner_6` work under Chonk today. It does
identify the next BB integration seam: raise `NUM_APP_PER_KERNEL` and finish wiring multiple app calldata witness
commitments through Mega/Chonk, then retry `bb gates --scheme chonk` on the `_3` and `_6` artifacts.

## Current Interpretation

The branch is a fixed-width circuit prototype, not a final batching implementation.

It now includes a committed `N = 3` relation proof suite and an explicit `inner_6` compile/profile spike. It
intentionally does not yet include:

- dynamic `num_apps`;
- inactive-slot padding;
- reset-aware batch selection;
- PXE scheduling changes;
- TypeScript input classes or witness conversion for the new circuits;
- artifact naming or VK integration decisions;
- the full fixed-width `N = 1..6` family beyond the committed `init_3`, `inner_3`, and `inner_6` artifacts.

The useful result so far is narrower and clearer: after the init-only first slot, the app transition logic is the same
for init-derived and inner-derived batches. That shared logic can be factored without pretending that init slot 0 is
symmetrical with later slots.

## Reset-Aware Scheduling Notes

The current PXE loop already uses lookahead before processing a non-first app. It builds a reset input builder from the
latest kernel output and the still-unpopped execution stack. If the top pending app would overflow one of the
resettable dimensions, PXE runs one or more reset kernels first, then processes that app with an inner kernel.

From Chonk's accumulated circuit-chain perspective, a mid-flow reset still always comes after a kernel has processed
some prior app:

- `app_{i-1}`
- `inner_{i-1}(previous_kernel, app_{i-1})`
- `reset(inner_{i-1})`
- `app_i`
- `inner_i(reset, app_i)`

So the reset is "before app_i's inner" only from the PXE planner's perspective. It is not inserted between `app_i` and
the kernel that consumes `app_i`; Chonk should see each app circuit immediately before the kernel that recursively
verifies/consumes it.

For fixed-width kernels, the intended rule is:

- choose the largest contiguous prefix up to width 6 that can be processed without needing a reset before any app in
  that prefix;
- emit the corresponding `init_N` or `inner_N`;
- if the next app would overflow, emit one or more reset kernels after the batch;
- continue with the next app after reset.

Equivalently, a batch may end before a reset, but it must not cross a reset boundary.

The extra artifact names and VKs for widths 1 through 6 are plumbing, not a conceptual blocker. The real scheduling
risk is lookahead correctness. The existing `PrivateKernelResetPrivateInputsBuilder.needsReset()` can already answer
"would this next app require a reset?" without oracle work, but it only accepts one `nextIteration` from the current
top of the execution stack. A width planner needs to repeatedly ask that question against a hypothetical accumulated
kernel state while tentatively appending apps to the candidate batch.

There is not currently a production TypeScript equivalent of Noir's `PrivateKernelCircuitOutputComposer`. A planner
therefore needs a small dry-run accumulator that mirrors enough of init/inner output composition to support reset
lookahead:

- append note hash read requests, nullifier read requests, key validation requests, note hashes, nullifiers, logs,
  public calls, and private call requests;
- pop the private call request consumed by each tentative inner slot and push nested private calls in the same
  depth-first order as the current PXE loop;
- track fee payer, public teardown request, min revertible counter, and expiration timestamp consistently with the
  Noir composer;
- for `init_N`, account for init-only setup and possible protocol-nullifier injection before applying later slots.

This should be efficient because the maximum lookahead width is 6 and the expensive reset-builder work happens in
`build()`, not in `needsReset()`. The main implementation risk is divergence between the TypeScript dry-run accumulator
and the Noir composer, not asymptotic cost.

## Recommended Next Phase

The Noir-level `_3` prototype is now hardened enough to move from "prove the relation" to "complete the fixed-width
family and unblock real Chonk measurements." The next phase should keep the explicit fixed-width design and avoid a
fused/dynamic circuit redesign.

### 1. Scale Remaining Fixed Widths Mechanically

Do not introduce a Noir-level generic fixed-array loop unless there is a clear measured reason. It may change the
compiled circuit shape through array/indexing/loop lowering. Prefer explicit source in each circuit, either written
manually or produced by a generator that emits explicit calls:

- `let output_1 = execute_next_private_call(output_0, inputs.private_call_1);`
- `let output_2 = execute_next_private_call(output_1, inputs.private_call_2);`
- and so on.

The branch already has `init_3`, `inner_3`, and `inner_6`. Add the remaining fixed-width wrappers:

- `private_kernel_init_1` if product integration wants a width-dispatched family rather than treating existing init as
  width 1;
- `private_kernel_init_2`, `private_kernel_init_4`, `private_kernel_init_5`, `private_kernel_init_6`;
- `private_kernel_inner_2`, `private_kernel_inner_4`, `private_kernel_inner_5`;
- keep existing `private_kernel_inner` as width 1 or add an alias/package if the TypeScript dispatch layer wants a
  uniform `inner_1..6` naming scheme;
- workspace wiring and minimal smoke/equivalence coverage for each.

The implementation should be mostly mechanical: explicit entrypoints and structs per circuit, shared single-step
transition execution in the library.

### 2. Continue BB Multi-App Databus Work

PR `#22640` gives a concrete BB starting point but leaves `NUM_APP_PER_KERNEL = 1`. The next useful BB spike is:

1. apply or rebase onto the PR's multi-app scaffolding;
2. raise `NUM_APP_PER_KERNEL` locally, preferably to `6`;
3. fix the resulting witness-commitment/databus failures;
4. run `bb gates --scheme chonk` against `private_kernel_init_3`, `private_kernel_inner_3`, and
   `private_kernel_inner_6`.

This is the path to real Chonk gate counts. ACIR opcode counts are already enough to show linear Noir-level scaling,
but not enough to decide product economics.

### 3. Measure Before PXE Product Integration

Before adding PXE or TypeScript integration, the fixed-width family should eventually be measured against the current
one-app path:

- bytecode size and compiled artifact size;
- gate counts;
- relevant ACIR opcode deltas;
- proving-key or VK-size impact if available;
- whether `init_N` is cheaper than `init + (N - 1) * inner`;
- whether `inner_N` is cheaper than `N * inner`.

Those measurements are easier said than done for these prototypes because realistic Chonk gate/proving measurements
still require the BB multi-app databus work above. Do not block the remaining mechanical Noir wrappers on that, but do
treat Chonk measurements as the gate before PXE/product integration.

### 4. Prototype Reset-Aware TS Planning

Once the fixed-width family and BB support are in place, the next product-facing task is a planner that chooses the
largest safe prefix up to width 6 without crossing reset boundaries. The main new code should be a TypeScript dry-run
accumulator that mirrors enough of Noir's private-kernel output composer to ask the existing reset builder whether the
next candidate app would require a reset.

This should be tested with synthetic app public inputs that force boundaries such as:

- `init_3 -> reset -> inner_3`;
- `init_2 -> reset -> inner_4`;
- consecutive resets before the next batch;
- depth-first nested-call ordering where processing one app exposes new candidate apps.

## Open Questions

- Should the shared helper keep the `private_kernel_batch` name, or use a more literal transition name until dynamic
  batching exists?
- Should the remaining fixed-width Noir sources be maintained manually, or generated by a small source generator that
  emits explicit calls?
- Should batched init/inner VKs get distinct named indexes, or use a reset-style range abstraction for allowed previous
  kernels?
- What Chonk gate/prover threshold justifies moving from fixed-width experiments into PXE scheduling work?
