# Parallel ACIR Circuit Construction

## Status: PoC complete, ready for production PR

The core parallel execution mechanism is proven and tested. The originally-planned precursor
refactor (separating setup gates from constraint gates in sequential `build_constraints`) turned
out to be unnecessary — see "Key insight" below.

## Key insight: no precursor PR needed

The original plan called for a two-PR approach: first refactor sequential `build_constraints` to
pre-create setup state, then add the parallel path. The concern was that sequential and parallel
paths would produce different circuits because setup gates land in different positions.

**The realization:** `build_constraints_parallel` with N=1 threads already produces bit-identical
circuits to N=2 threads. Both paths go through `prepare_builder_from_profiles` (which pre-creates
constants, range lists, and lookup tables), so setup gates land in the same position regardless of
thread count. Sequential execution is just the N=1 special case of parallel execution.

**Validated:** `BuildConstraintsParallelN1vsN2` test passes — full wire-by-wire, selector-by-selector,
variable, and union-find comparison between 1-thread and 2-thread parallel construction. Zero
mismatches.

This means we can ship the parallel infrastructure in a single PR:
1. Wire `build_constraints_parallel` into `create_circuit` for `UltraCircuitBuilder`
2. The old sequential `build_constraints` remains for other builder types (Mega)
3. Update VKs (they change because setup gates move to the beginning)
4. All existing tests pass — the parallel path with any thread count is a drop-in replacement

**Note on scope:** The builder changes (cursors, deferred buffers, `execute_parallel`) only affect
the ACIR construction path. Direct C++ circuit construction is unchanged — cursor mode is opt-in,
entered only through `execute_parallel`. The lazy-init behavior of `put_constant_variable`,
`create_range_list`, and `get_table` is preserved for all non-ACIR usage.

## CRITICAL INVARIANT: Bit-identical circuits for any N

**Circuits produced by `build_constraints_parallel` MUST be bit-identical regardless of thread
count.** N=1, N=2, N=32 must all produce the exact same circuit — same wires, same selectors,
same variable indices, same union-find. This is non-negotiable because:

- Different circuits produce different VKs
- VKs are hardcoded in the protocol (Aztec L1 contracts)
- If the circuit depends on thread count, different machines with different core counts would
  produce incompatible proofs
- The verifier must be able to verify proofs from any prover regardless of hardware

**This means:** Any mechanism that could produce different gate counts or variable indices based
on thread assignment is a bug. This includes:
- Gate fusion that depends on task-to-thread assignment
- Shared mutable state accessed in nondeterministic order
- Any code path that reads `block.size()` in cursor mode (returns pre-allocated total, not cursor)

## Next step: production PR

**Key files:**
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/acir_format.cpp` — wire `build_constraints_parallel`
  into `create_circuit<UltraCircuitBuilder>`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/acir_format.hpp` — declarations
- Builder files (already modified on PoC branch): `execution_trace_block.hpp`, `circuit_builder_base.hpp`,
  `circuit_builder_base_impl.hpp`, `ultra_circuit_builder.hpp`, `ultra_circuit_builder.cpp`

**Verification:**
- All existing tests must pass (no behavioral change for constraint correctness)
- `CircuitChecker::check()` must pass on all circuits
- `BuildConstraintsParallelN1vsN2` validates bit-identical circuits across thread counts
- VKs WILL change — run `barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh --update_inputs`
  to pin new VKs after verifying correctness

## Motivation

Circuit construction from ACIR is entirely single-threaded — the biggest sequential bottleneck as
core count increases and as GPU-accelerated proving makes parallel work (MSM, sumcheck) cheaper.

Measured on real transaction (`ecdsar1+transfer_1_recursions+sponsored_fpc`, 11 circuits):

| Cores | Total prove time | create_circuit | ProverInstance | Sequential circuit % |
|-------|------------------|----------------|----------------|---------------------|
| 1     | ~25s             | 844ms          | 815ms          | ~6.6%               |
| 8     | ~5.4s            | 709ms          | 497ms          | ~22%                |
| 32    | 5.58s            | 702ms (12.6%)  | 528ms (9.5%)   | **22%**             |

With GPU proving, sequential circuit construction could become 50%+ of total time.

## What the PoC proved

### Core mechanism: cursor-based parallel writes

Threads write to pre-allocated regions of a shared builder using per-thread cursors. No builder
duplication, no merge, no wire index remapping. The existing stdlib code (SHA256, Poseidon2, etc.)
is completely unmodified — it calls the same `populate_wires`, `emplace_back`, `add_variable` APIs,
which internally route through cursors when in parallel mode.

**Tested with:** Two `std::thread`s running SHA256 + Poseidon2 concurrently on a shared builder.
Zero mismatches across all blocks, selectors, variables, and union-find. 500/500 stress test.

### Copy constraints (assert_equal) are safe under concurrency

Each opcode's `assert_equal` calls only touch its own internal variables and its own unique output
witnesses. The union-find modifications operate on disjoint variable sets across threads. No
deferral needed.

**Key invariant:** ACIR output witnesses are unique per opcode. No two opcodes call `assert_equal`
on the same ACIR witness. The stdlib pattern is always: read inputs → compute → assert outputs
equal witnesses. The "ripple" from `update_real_variable_indices` stays contained within one opcode.

**Tested with:** Chained SHA256 opcodes where A's output witnesses are B's input witnesses, running
on real concurrent threads. Union-find bit-identical to sequential (verified all 43,704 variables).

### Range constraints and lookup gates: deferred per-thread, replayed after join

These are the only operations that append to shared collections (`range_lists[target].variable_indices`
and `table.lookup_gates`). Both are order-independent:
- `variable_indices` gets sorted and deduplicated in `process_range_list`
- `lookup_gates` just counts occurrences in `construct_lookup_read_counts`

Per-thread buffers, concatenated in deterministic thread order after join.

**Tested with:** 5,792 deferred lookup entries + 458 deferred range constraints from chained SHA256,
all replayed correctly. Finalized circuits pass CircuitChecker.

### Gate construction is deterministic across threads

After finalization, every block (arithmetic, lookup, delta_range, elliptic, poseidon2_external,
poseidon2_internal, pub_inputs) is bit-identical between sequential and parallel construction —
verified wire-by-wire and selector-by-selector. Variable counts match. Union-find matches.

### `put_constant_variable` is safe with read-only cache after warmup

All constants for tested opcodes (SHA256, Poseidon2) are fully covered by one warmup instance.
In cursor mode, the cache is read-only — lookups are safe for concurrent reads (no writers).
Zero cache misses observed during parallel phase.

### `execute_parallel` orchestrator (production-ready)

Lives on the builder (`UltraCircuitBuilder::execute_parallel`). Takes a vector of task lambdas
and pre-computed per-task sizes. Handles:
- Pre-allocation of all blocks and variables
- Per-thread cursor setup (on main thread, avoiding resize races)
- Thread dispatch with `set_parallel_thread_index`
- Deferred operation replay after join
- 500/500 stress test, zero race conditions

### Profile-based planning (simulates eventual table lookup)

`profile_constraint_type` runs a constraint on a throwaway builder and extracts:
- `TaskBlockSizes` (per-block gate counts + variable count)
- Constants to pre-register
- Range list targets to pre-create
- Lookup table IDs to pre-create

`prepare_builder_from_profiles` populates the real builder's caches from this data without
executing any constraints. This is the interface the table lookup will eventually implement.

## Real circuit analysis

### Aztec transaction opcode breakdown (ecdsar1+transfer_0_recursions+sponsored_fpc)

| Circuit | Opcodes | Gates | Key constraint types |
|---------|--------:|------:|---------------------|
| EcdsaRAccount:entrypoint | 8,938 | 78,062 | 2000 quad, 468 range, 1 sha256, 29 pos2, 1 ecdsa_r1 |
| private_kernel_init | 8,913 | 44,239 | 6253 quad, 1218 range, 69 pos2, 1 msm |
| private_kernel_inner | 19,697 | 95,347 | 10724 quad, 3683 big_quad, 2658 range, 69 pos2 |
| Token:transfer | 22,600 | 79,563 | 11675 quad, 3752 range, 57 pos2, 8 msm, 6 aes128 |
| private_kernel_reset | 29,586 | 102,252 | 16018 quad, 3403 big_quad, 4447 range, 375 pos2 |
| private_kernel_tail | 9,096 | 43,186 | 6634 quad, 1402 range, 11 pos2 |
| hiding_kernel | 1,502 | 36,180 | 1413 quad, 80 range, 7 pos2 |

### Per-block gate breakdown for private_kernel_inner (95,347 gates)

| Block | Gates | % |
|-------|------:|--:|
| arithmetic | 40,636 | 42.6% |
| poseidon2_internal | 39,216 | 41.1% |
| poseidon2_external | 6,880 | 7.2% |
| elliptic | 336 | 0.4% |

No single opcode dominates. 69 Poseidon2 instances produce 48% of gates. With table lookup
(no warmup), all ~19,600 constraints distribute across threads with near-linear speedup.

## Builder changes implemented

### execution_trace_block.hpp
- Per-thread cursor arrays (`std::vector<size_t> cursors_`) on `Selector` and `ExecutionTraceBlock`
- `thread_local parallel_thread_idx` for routing operations to correct cursor
- `enable_cursor_mode(thread_idx, start)` / `disable_cursor_mode(thread_idx)`
- `populate_wires` and selector writes route through `active_cursor()` / `active_cursor_ref()`
- `last_gate_index()` / `next_gate_index()` for cursor-aware gate position queries
- `wire_cursor_start()` for tracking task boundary (prevents cross-task gate fusion)

### circuit_builder_base.hpp
- Per-thread variable cursor array (`std::vector<uint32_t> variable_cursors_`)
- `enable_variable_cursor(thread_idx, start)` / `disable_variable_cursor(thread_idx)`
- `resize_variables(total_size)` for pre-allocation
- `get_variable_cursor()` routes through `parallel_thread_idx`
- `increment_num_gates` skipped in cursor mode
- `get_next_var_index()` / `get_prev_var_index()` const accessors

### ultra_circuit_builder.hpp
- `TaskBlockSizes` struct + `snapshot_block_sizes()` / `delta()`
- `execute_parallel()` orchestrator
- Per-thread deferred buffers for lookup gates and range constraints
- `init_deferred_buffers()` / `apply_deferred_lookup_gates()` / `apply_deferred_range_constraints()`
- `update_used_witnesses` / `update_finalize_witnesses` skipped in cursor mode

### ultra_circuit_builder.cpp
- `put_constant_variable`: read-only cache bypass in cursor mode
- `create_small_range_constraint`: deferral in cursor mode
- `create_gates_from_plookup_accumulators`: lookup gate deferral in cursor mode
- `create_ecc_add_gate` / `create_ecc_dbl_gate`: cursor-aware gate fusion (uses cursor position
  instead of `block.size()` to find previous gate; fusion disabled at task boundaries)

### rom_ram_logic.hpp / rom_ram_logic.cpp
- Per-thread ROM/RAM ID cursors for pre-allocated array assignment
- `create_ROM_array` / `create_RAM_array`: cursor-mode returns pre-assigned IDs
- `gate_index` recording uses `last_gate_index()` / `next_gate_index()` instead of `block.size()`

### acir_format.cpp
- `profile_constraint_type()`: throwaway builder measurement (separate pre-warmed builder to
  avoid cross-instance gate fusion in profiling)
- `prepare_builder_from_profiles()`: cache population from profiles
- `build_constraints_parallel()`: full parallel orchestration
- Constraint type grouping by gate-count-affecting parameters (range by num_bits, big_quad by
  size(), logic by (num_bits, is_xor_gate), aes128/blake2s/blake3 by inputs.size(), poseidon2
  by state.size(), multi_scalar_mul by points.size())

## Shared state audit

| State | Category | Solution | Verified |
|-------|----------|----------|----------|
| Block gate writes | Partitionable | Per-thread cursors | Yes (500/500) |
| `add_variable` | Partitionable | Per-thread variable cursors | Yes |
| `assert_equal` / union-find | Naturally disjoint | No change needed | Yes (43k vars) |
| `put_constant_variable` | Read-only after warmup | Cache bypass in cursor mode | Yes (0 misses) |
| Range list creation | One-time init | Pre-created from profiles | Yes |
| Plookup table creation | One-time init | Pre-created from profiles | Yes |
| `create_small_range_constraint` | Deferred | Per-thread buffer, replay | Yes (458 entries) |
| `table.lookup_gates` append | Deferred | Per-thread buffer, replay | Yes (5792 entries) |
| `update_used_witnesses` | Skip in cursor mode | Boomerang detection only | Yes |
| `update_finalize_witnesses` | Skip in cursor mode | Finalize detection only | Yes |
| `increment_num_gates` | Skip in cursor mode | Pre-computed total | Yes |
| ROM/RAM array creation | Pre-allocated | Per-thread ID cursors | Yes |
| `memory_read/write_records` | Gate index recording | Uses `last_gate_index()` | Yes |
| ECC gate fusion | Cursor-aware | Uses cursor position, not block.size() | In progress |

## The remaining blocker: setup gate ordering

### The problem

In sequential `build_constraints`, the first constraint of each type triggers one-time setup:
- Range list staircase creation (`create_range_list` → arithmetic gates + variables)
- Lookup table initialization (`get_table` → populates `lookup_tables`)
- Constant registration (`put_constant_variable` → `fix_witness` → arithmetic gate)

These setup gates are interleaved with the first constraint's own gates. Their position in the
circuit affects the VK.

In parallel mode, `prepare_builder_from_profiles` creates setup gates separately before any
constraints run. The setup gates land at different positions → different circuit → different VK.

Both circuits are valid (both pass CircuitChecker), but they are NOT identical.

### The solution: precursor refactor

Change the sequential `build_constraints` path to separate setup from execution. This is a
standalone change with no parallel code — just reordering when setup gates are created.

### What currently happens (implicit setup)

When `build_constraints` processes constraints sequentially, the first constraint of each type
triggers lazy initialization:

1. **`put_constant_variable(value)`** — if the value isn't cached, creates a new variable +
   `fix_witness` gate (1 arithmetic gate). Every subsequent call with the same value returns the
   cached index. SHA256 creates ~900 unique constants on its first invocation; the 2nd+ SHA256
   finds them all cached. These `fix_witness` gates are interleaved with the first constraint's
   own gates in the arithmetic block.

2. **`create_range_list(target_range)`** — called lazily from `create_small_range_constraint` when
   a range target hasn't been seen before. Creates a "staircase" of sorted padding variables +
   unconstrained arithmetic gates (e.g., SHA256 triggers 5 range lists costing 1371 arithmetic
   gates). These gates are interleaved with the first constraint that triggers each range.

3. **`get_table(table_id)`** — called lazily from `create_gates_from_plookup_accumulators` when a
   lookup table hasn't been created yet. Appends to `lookup_tables`. No gates are created, but the
   table must exist before any plookup reads reference it.

### What needs to change (explicit setup)

Add a setup phase at the beginning of `build_constraints` that pre-creates all setup state before
any constraint processing. This requires knowing which constraint types are present in the program.

**Concrete changes to `build_constraints` in `acir_format.cpp`:**

1. **Pre-register constants.** Before the constraint loops, call `put_constant_variable(v)` for
   every constant value that any constraint type will need. The set of constants per constraint
   type is deterministic (SHA256 always needs the same ~900 constants, Poseidon2 needs ~5, etc.).
   Source: `ConstraintProfile::constants` from `profile_constraint_type`, or eventually a stored
   table.

2. **Pre-create range lists.** Before the constraint loops, call `create_range_list(target)` for
   every range target that any constraint type will need. Source:
   `ConstraintProfile::range_list_targets`, or eventually a stored table. SHA256 needs targets
   {1, 3, 7, 15, 16383}. Most opcodes need only {16383} (DEFAULT_PLOOKUP_RANGE_SIZE).

3. **Pre-create lookup tables.** Before the constraint loops, call `get_table(id)` for every
   BasicTableId that any constraint type will need. Source: `ConstraintProfile::table_ids`, or
   eventually a stored table. SHA256 needs SHA256 lookup tables; logic constraints need XOR/AND
   tables; etc.

**The key invariant:** After the setup phase, no constraint execution triggers `put_constant_variable`
cache misses, `create_range_list` calls, or new `get_table` calls. Every constraint — whether it's
the 1st or 100th of its type — produces identical gates.

**Where the setup data comes from (now vs later):**
- **Now (PoC):** `profile_constraint_type` runs constraints on a throwaway builder and extracts
  the constants/ranges/tables. This is slow (2x work per type) but correct.
- **Later (production):** A stored table keyed by `(constraint_type, parameters)` provides the
  same data as a compile-time lookup. The table is generated once and validated by pinning tests.

### Effect on the circuit

The setup gates (fix_witness for constants, range list staircases) move from being interleaved
with the first constraint of each type to being grouped at the beginning of the circuit. This
changes:
- Gate ordering within the arithmetic block
- Variable indices (constants get earlier indices)
- The VK (different gate positions → different polynomials)

It does NOT change:
- The set of constraints (same gates, just reordered)
- The satisfying witness assignment
- Circuit correctness (both old and new pass CircuitChecker and prove/verify)

### Implementation plan

**Single PR:** Ship the parallel infrastructure and wire it into `create_circuit` for Ultra.

1. Extract all PoC changes (builder + acir_format) into a clean branch off `merge-train/barretenberg`
2. Wire `build_constraints_parallel` into `create_circuit<UltraCircuitBuilder>` (replacing
   `build_constraints` for Ultra only; Mega and other builders continue using the sequential path)
3. Enable `BuildConstraintsParallelN1vsN2` test to validate bit-identical circuits across thread counts
4. Run full test suite (`dsl_tests`, `ultra_honk_tests`, `chonk_tests`)
5. Update VKs via `test_chonk_standalone_vks_havent_changed.sh --update_inputs`
6. Later: replace `profile_constraint_type` (throwaway builder) with stored lookup tables for
   production performance

## Files modified in PoC

| File | Change |
|------|--------|
| `honk/execution_trace/execution_trace_block.hpp` | Per-thread cursors, thread-local index, `last_gate_index()`, `next_gate_index()`, `wire_cursor_start()` |
| `stdlib_circuit_builders/circuit_builder_base.hpp` | Per-thread variable cursors, resize, accessors |
| `stdlib_circuit_builders/circuit_builder_base_impl.hpp` | Cursor-aware add_variable |
| `stdlib_circuit_builders/ultra_circuit_builder.hpp` | execute_parallel, deferred buffers, TaskBlockSizes, ROM/RAM cursor management |
| `stdlib_circuit_builders/ultra_circuit_builder.cpp` | put_constant_variable bypass, deferral checks, cursor-aware ECC gate fusion |
| `stdlib_circuit_builders/rom_ram_logic.hpp` | Per-thread ROM/RAM ID cursors |
| `stdlib_circuit_builders/rom_ram_logic.cpp` | Cursor-mode ROM/RAM creation, cursor-aware gate_index recording |
| `dsl/acir_format/acir_format.hpp` | build_constraints_parallel declaration |
| `dsl/acir_format/acir_format.cpp` | profile_constraint_type, prepare_builder_from_profiles, build_constraints_parallel, constraint grouping |
| `dsl/acir_format/per_block_gate_count.test.cpp` | All PoC tests |

## Tests

| Test | What it verifies |
|------|-----------------|
| `RealParallelChainedSha256` | Bit-identical circuit (full wire/selector/variable/union-find comparison) with real witness values, CircuitChecker on both, chained data dependencies, 5792 deferred lookups + 458 deferred ranges |
| `BuildConstraintsParallelN1vsN2` | Real AcirProgram through `build_constraints_parallel` with 1 vs 2 threads, full wire/selector/variable/union-find comparison — validates that sequential is just the N=1 case of parallel |
| `SequentialVsParallelSemanticEquivalence` | Sequential `build_constraints` vs `build_constraints_parallel` — same block sizes, variable counts, copy cycles, constants, range lists, lookup tables |
| `AcirTestParallelEquivalence` | Parameterized over all acir_tests — 3-way comparison (sequential, N=1, N=2) with semantic equivalence and bit-identical checks |
| `IsolatedVsSharedSelectorEquivalence` | Selector equivalence between isolated and shared warmed builders |
| `WarmedAdditivityComprehensive` | Gate count additivity across 5 opcode types after warmup |
| Individual opcode measurements | Per-block gate counts for Quad, SHA256, Poseidon2, EC Add, Logic XOR |
