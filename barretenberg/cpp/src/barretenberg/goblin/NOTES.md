# Reverting top-of-trace blinding impact for non-ZK Mega — work notes

Temporary reviewer notes for this branch. Delete before merge (or move to PR description).

## Goal

PR #22334 ("masking at the top of the trace") introduced a `TRACE_OFFSET = 4` preamble that affected **both** ZK and non-ZK Mega circuits, complicating the merge protocol and paying a 4-row cost on every circuit even when no masking was needed. The goal here is to undo that cost for non-ZK Mega while keeping top-of-trace masking for ZK (we don't want to re-introduce `MaskingTailData`). The merge protocol should revert to essentially its pre-#22334 shape.

## Three categories

Every change in this branch falls into one of:
- **Revert**: exactly restoring pre-#22334 code.
- **Retain**: keeping the post-#22334 design (for ZK).
- **New**: a genuinely new piece of machinery needed because of the asymmetry the first two categories create.

---

## Reverts (back to pre-#22334 behavior)

- **`goblin/merge_prover.{hpp,cpp}`**: no shift constants, no κ^s bookkeeping. `construct_*_columns` called without a `start_offset`. Single concatenation/degree-check formula for PREPEND and APPEND.
- **`goblin/merge_verifier.{hpp,cpp}`**: no `pow_kappa_s` / APPEND correction. `check_concatenation_identities` takes a single `pow_kappa` arg. `check_degree_identity` uses the full eval vector rather than a separate `l_data_evals`.
- **`goblin/merge_constants.hpp`**: **deleted**. No more `MERGE_FULL_SHIFT`, `MERGE_APPEND_OUTPUT_SHIFT`.
- **`op_queue/ecc_op_queue.hpp` & `ecc_ops_table.hpp`**: `construct_ultra_ops_table_columns`, `construct_previous_ultra_ops_table_columns`, `construct_current_ultra_ops_subtable_columns` are all back to zero-argument form. `get_append_offset()` is simpler.
- **`relations/ecc_op_queue_relation.hpp`**: back to the `w_*_shift` form of the equality subrelation (`ecc_op_wire[r] == w[r+1]` inside the ecc_op domain).
- **`trace_to_polynomials.cpp::add_ecc_op_wires_to_prover_instance`**: ecc_op_wire populated at `wire_start - NUM_ZERO_ROWS` (which becomes row 0 for non-ZK, row 4 for ZK) from `wire[wire_start + i]`. Matches the `w_shift` relation form.
- **`MegaCircuitBuilder::queue_ecc_no_op` / `ECCOpQueue::no_op_ultra_only`**: restored. Deleted by #22334.
- **`chonk/chonk.cpp::complete_kernel_circuit_logic`**: restored `circuit.queue_ecc_no_op()` at the top of the tail kernel branch. This is what supplies Translator's 2 leading shiftability zeros (placed at the top of the final aggregate op queue because the tail subtable is prepended last).
- **`translator_vm/translator_circuit_builder.{hpp,cpp}`**: `NUM_NO_OPS_START = 1` restored; `feed_ecc_op_queue_into_circuit` consumes the initial no-op as its 2 leading zeros and processes random ops starting from index `NUM_NO_OPS_START`.
- **`goblin_avm/goblin_avm.cpp`**: AVM's `GoblinAvm` constructor queues `queue_ecc_no_op()` first (matches Chonk's tail-kernel behavior so Translator sees 2 leading zeros in both flows).
- **Gate-count constants in `dsl/acir_format/gate_count_constants.hpp`**: updated numbers reflect the simpler merge verifier (fewer gates) and the added no-op in the tail kernel.

## Retained from #22334

- **ZK masking stays at the top of the trace.** No `MaskingTailData`, no `padding_indicator_array`, no tail-masking row-disabling polynomial. The row-disabling polynomial stays `1 − L_0 − L_1 − L_2 − L_3` for ZK flavors.
- **`MegaZKFlavor::TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK = 4`**. Masking values remain at rows 1–3 in MegaZK witness wires, ecc_op block starts at row 5.
- **`MegaAvmFlavor::TRACE_OFFSET = 0`** (inherits from `MegaFlavor`). Previously it was 1 as a workaround for `ecc_op_wire` layout; no longer needed since the no-op in the AVM op queue provides the 2 leading zeros for Translator directly.
- **Sumcheck's `excluded_head_size = HasZK ? TRACE_OFFSET : 0`** (`sumcheck_round.hpp`). Was introduced by #22334; correct for the new ZK layout.
- **`UltraFlavor`, `UltraZKFlavor`, `UltraExecutionTraceBlocks`**: `TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK`. Ultra is unaffected by this work — it keeps top-of-trace masking semantics as introduced in #22334.

## New pieces (required by the non-ZK/ZK asymmetry)

These didn't exist pre-#22334 because Mega and MegaZK shared a single trace layout. They're consequences of making `TRACE_OFFSET` flavor-dependent.

### 1. Per-flavor `TRACE_OFFSET`

- `MegaFlavor::TRACE_OFFSET = 0` (was 4).
- `MegaZKFlavor::TRACE_OFFSET = 4` (explicit override — was inherited).
- `MegaExecutionTraceBlocks::TRACE_OFFSET` static constant **deleted**; callers must pass `Flavor::TRACE_OFFSET` into `compute_offsets(trace_offset)`.
- One call-site update in `circuit_checker/mega_circuit_builder.test.cpp` (passes `MegaFlavor::TRACE_OFFSET` explicitly to `compute_offsets`).

### 2. `UltraEccOpsTable::HIDING_KERNEL_LEADING_ZEROS`

The hiding kernel's ecc_op_wire polynomial carries `TRACE_OFFSET = 4` leading zeros (MegaZKFlavor's preamble). For the merge prover's commitment to `t_commitments` (the hiding kernel's subtable columns) to match the hiding kernel's Oink-committed ecc_op_wire, the op queue's APPEND path must produce the same 4-leading-zero structure.

Implementation: a single compile-time constant in `ecc_ops_table.hpp`:
```cpp
static constexpr size_t HIDING_KERNEL_LEADING_ZEROS = 4;  // = MegaZKFlavor::TRACE_OFFSET
```

Used in three places inside `UltraEccOpsTable`:
- `num_ultra_rows()` and `current_ultra_subtable_size()` — when fixed_append is active, the appended subtable's span includes the preamble.
- `construct_column_polynomials_with_fixed_append` — writes the appended subtable's ops at `fixed_append_offset*NUM_ROWS_PER_OP + HIDING_KERNEL_LEADING_ZEROS`.
- `construct_current_ultra_ops_subtable_columns` — when the current subtable is the appended one, prepends the 4-row preamble.
- `get_reconstructed_with_fixed_append` — inserts 2 extra no-op fillers between the prepended tables and the appended subtable so that get_ultra_ops() ordering matches the column polynomial layout (Translator consumes this).

The merge protocol itself is flavor-oblivious; this is entirely a property of the op queue.

### 3. Cross-flavor databus offset

The hiding kernel's databus commitments (calldata) are copy-constrained to the previous kernel's return_data commitments across the IVC boundary. If `databus_offset` = `Flavor::TRACE_OFFSET`, non-ZK (0) and ZK (4) kernels would produce incompatible commitments.

Fix: `prover_instance.cpp`'s `allocate_databus_polynomials` and `construct_databus_polynomials` now hardcode `databus_offset = NUM_DISABLED_ROWS_IN_SUMCHECK` (= 4) for all Mega flavors. Non-ZK pays 4 leading zero rows on databus columns it doesn't use for masking, but that's a small cost for cross-flavor commitment compatibility.

### 4. Flavor-aware hiding-kernel VK generation

The hiding kernel's precomputed polynomials (`lagrange_ecc_op`, `lagrange_first`, `lagrange_last`, gate selectors) depend on the flavor's `TRACE_OFFSET`. Pre-#22334 (and post-#22334 before this branch) `MegaFlavor` and `MegaZKFlavor` produced identical precomputed VKs, so `ProverInstance_<MegaFlavor>` could compute the hiding kernel's VK. Post-revert they don't match.

Every VK-for-a-circuit code path now branches on "is this the hiding kernel?":

**Test/mock helpers** (pass `is_hiding_kernel` to a helper, which picks `ProverInstance_<MegaZKFlavor>` vs `ProverInstance_<MegaFlavor>`):
- `chonk/mock_circuit_producer.hpp::get_verification_key(builder, is_hiding_kernel)`
- `chonk/test_bench_shared.hpp::precompute_vks` — sets `is_hiding_kernel = (j == NUM_CIRCUITS - 1)`.
- `dsl/acir_format/hypernova_recursion_constraint.test.cpp::get_verification_key` / `get_kernel_vk_from_circuit` / `construct_kernel_vk_from_acir_program` — same pattern.
- `chonk/mock_circuit_producer.hpp::create_next_circuit_and_vk` — inspects IVC state to determine hiding kernel.

**bbapi (TS-facing schema)** — this propagates the flag across the API boundary:
- `bbapi/bbapi_shared.hpp::BBApiRequest`: new field `loaded_circuit_is_hiding_kernel`.
- `bbapi/bbapi_chonk.hpp`: added `bool is_hiding_kernel = false` to `ChonkLoad`, `ChonkComputeVk`, `ChonkCheckPrecomputedVk` request structs.
- `bbapi/bbapi_chonk.cpp`:
  - `ChonkLoad::execute` stores the flag on `BBApiRequest`.
  - `ChonkAccumulate::execute` reads it for the `VkPolicy::CHECK` branch.
  - `ChonkComputeVk::execute` and `ChonkCheckPrecomputedVk::execute` pass it to `compute_chonk_vk_from_program(program, is_hiding_kernel)`, which picks the flavor.

**bb CLI layer** (`api/api_chonk.cpp`):
- `ChonkAPI::prove` loop sets `is_hiding_kernel = (i == size − 1)` on `ChonkLoad`.
- `write_chonk_vk` hardcodes `is_hiding_kernel = true` (it's only called with the hiding kernel's bytecode).
- `ChonkAPI::check_precomputed_vks` loop sets it similarly on `ChonkCheckPrecomputedVk`.

**TS bindings** — auto-regenerated via `yarn generate` (`src/cbind/generate.ts`). `ChonkLoad`, `ChonkComputeVk`, `ChonkCheckPrecomputedVk` now have `isHidingKernel: boolean` in both the TypeScript and Rust generated bindings.

**TS caller** (`ts/src/barretenberg/backend.ts`):
- `chonkLoad` loop passes `isHidingKernel: i === lastIdx`.
- Post-prove `chonkComputeVk` call passes `isHidingKernel: true`.

Reviewer note on the footgun: the default of `false` means a caller who forgets to set the flag will silently get a MegaFlavor VK for the hiding kernel and only discover the mismatch at verify time. No compile-time or runtime guard currently prevents this. If this becomes a problem, we could make the field non-default (require explicit specification) or add a heuristic check on the bytecode.

### 5. Tests that poke the Translator / op queue directly need an initial no-op

Several tests construct a fresh `ECCOpQueue` and call `random_op_ultra_only` / `add_accumulate` directly (without going through a Chonk tail kernel that queues the no-op). These needed an explicit `op_queue->no_op_ultra_only()` at the top:
- `translator_vm/translator_circuit_builder.test.cpp` (10 spots; sed-applied)
- `translator_vm/translator.test.cpp` (2 spots)
- `translator_vm/relation_correctness.test.cpp`
- `translator_vm/relation_failure.test.cpp`
- `chonk/batched_honk_translator/batched_honk_translator.test.cpp`
- `stdlib/translator_vm_verifier/translator_recursive_verifier.test.cpp`
- `goblin/mock_circuits.hpp::construct_and_merge_mock_circuits` — now queues `queue_ecc_no_op()` at the start of the penultimate circuit (matching the real tail-kernel flow).

## ZK hiding kernel's ecc_op_wires now have 4 leading zeros (was 5)

Minor numeric change from the w_shift form. With `MegaZKFlavor::TRACE_OFFSET = 4`:
- ecc_op block trace_offset = `TRACE_OFFSET + NUM_ZERO_ROWS` = 5.
- `ecc_op_wire[4 + i] = wire[5 + i]` for `i ∈ [0, block_size)` — so ecc_op_wire has data starting at row 4 (4 leading zeros), not row 5 (5 leading zeros).

This is why `HIDING_KERNEL_LEADING_ZEROS = 4`, not 5.

## Tests status

All C++ test suites green:

| Suite | Tests | Notes |
|---|---|---|
| goblin_tests | 40 | incl. recursive Goblin verifier tests |
| ultra_honk_tests | 287 | incl. ZKBoundary (MegaZK trace-layout checks) |
| translator_vm_tests | 51 | |
| chonk_tests | 33 | incl. `ChonkTests.Basic`, `ChonkRecursionTests.*` |
| goblin_avm_tests | 4 | |
| eccvm_tests | 44 | |
| hypernova_tests | 9 | |
| stdlib_honk_verifier_tests | 49 | |
| stdlib_eccvm_verifier_tests | 8 | |
| stdlib_translator_vm_verifier_tests | 5 | |
| boomerang_value_detection_tests | 87 | |
| dsl_tests | 545 | incl. HypernovaRecursionConstraintTest |
| bbapi_tests | 30 | msgpack roundtrip for new `is_hiding_kernel` field |
| api_tests | 2 | |

## Remaining before merge

- Rewrite `goblin/MERGE_PROTOCOL.md` — currently describes the post-#22334 shape with FULL_SHIFT / APPEND_OUTPUT_SHIFT / κ^{s-t}. New content should describe the simpler form (single identity, no shifts in the merge) plus the op-queue's hiding-kernel preamble as the one piece of flavor-awareness.
- Regenerate precomputed VKs: `cd barretenberg/cpp/scripts && ./test_chonk_standalone_vks_havent_changed.sh --update_inputs`. Changing `MegaFlavor::TRACE_OFFSET` from 4 to 0 changes every app/kernel VK; changing the `ecc_op_queue_relation` and `add_ecc_op_wires_to_prover_instance` also contributes. All Chonk standalone VKs will change.
- Delete this NOTES.md before merge (or migrate its content to the PR description).

## File inventory

Top-level files touched (not exhaustive; generated files are auto-regenerated):

**Protocol / relations**
- `goblin/merge_prover.{hpp,cpp}`
- `goblin/merge_verifier.{hpp,cpp}`
- `goblin/merge_constants.hpp` (deleted)
- `relations/ecc_op_queue_relation.hpp`

**Flavor**
- `flavor/mega_flavor.hpp`
- `flavor/mega_zk_flavor.hpp`
- `flavor/mega_avm_flavor.hpp`
- `honk/execution_trace/mega_execution_trace.hpp`

**Op queue**
- `op_queue/ecc_op_queue.hpp`
- `op_queue/ecc_ops_table.hpp`

**Trace / prover instance**
- `trace_to_polynomials/trace_to_polynomials.cpp`
- `ultra_honk/prover_instance.cpp` (databus offset)

**Builder helpers**
- `stdlib_circuit_builders/mega_circuit_builder.{hpp,cpp}` (`queue_ecc_no_op`)

**Chonk**
- `chonk/chonk.cpp` (tail kernel no-op)
- `chonk/mock_circuit_producer.hpp`
- `chonk/test_bench_shared.hpp`

**Goblin AVM**
- `goblin_avm/goblin_avm.cpp`
- `goblin_avm/goblin_verifier.test.cpp`

**Translator**
- `translator_vm/translator_circuit_builder.{hpp,cpp}`

**bbapi / API / TS**
- `bbapi/bbapi_shared.hpp`
- `bbapi/bbapi_chonk.{hpp,cpp}`
- `api/api_chonk.cpp`
- `ts/src/barretenberg/backend.ts`
- `ts/src/cbind/generated/*.ts` (regenerated)
- `rust/barretenberg-rs/src/{generated_types.rs,api.rs}` (regenerated)

**Tests**
- `circuit_checker/mega_circuit_builder.test.cpp`
- `ultra_honk/zk_boundary.test.cpp`
- `goblin/merge.test.cpp`
- `goblin/goblin_verifier.test.cpp`
- `goblin/mock_circuits.hpp`
- `boomerang_value_detection/graph_description_goblin.test.cpp`
- `boomerang_value_detection/graph_description_merge_recursive_verifier.test.cpp`
- `translator_vm/translator.test.cpp`
- `translator_vm/translator_circuit_builder.test.cpp`
- `translator_vm/relation_correctness.test.cpp`
- `translator_vm/relation_failure.test.cpp`
- `chonk/batched_honk_translator/batched_honk_translator.test.cpp`
- `stdlib/translator_vm_verifier/translator_recursive_verifier.test.cpp`
- `dsl/acir_format/hypernova_recursion_constraint.test.cpp`
- `dsl/acir_format/gate_count_constants.hpp`
