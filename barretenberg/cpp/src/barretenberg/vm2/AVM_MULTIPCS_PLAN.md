# AVM Multipcs Implementation Plan

## Goal

Reduce the number of witness commitments in the AVM proof by interleaving `BATCH_SIZE` (BS) consecutive polynomials into each commitment. Adapted from the Ultra/Mega multipcs technique to the AVM's generated-from-PIL architecture.

**Current AVM witness commitment count:** 3012 (2559 wires + 453 derived)
**With BS=2:** ~1506 commitments. **With BS=4:** ~753 commitments.

## Design decisions

**On-the-fly interleaving (not interleaved storage).** Polynomials stay individually allocated. We interleave only at commitment time (via `commit_interleaved<BS>()`) and materialize temporary interleaved buffers for PCS. This keeps the change local to prover/verifier — tracegen, sumcheck, logderivative computation are untouched. RAM is not a concern for AVM so the temporary buffers are fine.

**PIL-level dispatch.** The codegen (`bb-pilcom`) emits interleaving constants (`INTERLEAVING_BATCH_SIZE`, group counts). Prover/verifier are written once against these constants. Change BS by regenerating — no C++ code changes needed.

## Architecture

```
PIL files (.pil)
    │
    ▼
bb-pilcom codegen (vm_builder.rs)  ← receives --batch-size N
    │
    ▼
Generated C++ (columns.hpp, flavor_variables.hpp)  ← emits group constants
    │
    ▼
Flavor (flavor.hpp)  ← reads generated constants
    │
    ▼
Prover / Verifier (prover.cpp, verifier.cpp)  ← generic loops driven by constants
```

## Notation

- BS = `INTERLEAVING_BATCH_SIZE` (1, 2, 4, ...)
- LOG_K = `INTERLEAVING_LOG_K` = log2(BS)
- N = trace length (`MAX_AVM_TRACE_SIZE`)
- "group" = a consecutive block of BS polynomials sharing one commitment

## What stays untouched

- ProvingKey allocation
- Tracegen (writes to individual polys as today)
- Logderivative inverse computation
- Sumcheck
- `Polynomial` class (no stride/offset needed)

---

## Step 0: Branch setup and porting from `si/multipcs-proto`

**Base branch:** `merge-train/avm` (clean, no multipcs infrastructure).

Three pieces of infrastructure must be ported from `si/multipcs-proto`. None of these exist on `merge-train/avm`.

### 0a. `pippenger_interleaved` — MSM for interleaved polynomials

**Where to find:** `si/multipcs-proto`
- `barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp` — declaration (~13 lines)
- `barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp` — implementation + template instantiations (~40 lines)

Builds an interleaved scalar array from individual chunk spans and delegates to standard MSM. Self-contained.

### 0b. `commit_interleaved<BS>()` — commitment key method

**Where to find:** `si/multipcs-proto`
- `barretenberg/cpp/src/barretenberg/commitment_schemes/commitment_key.hpp` — new method (~35 lines)

Calls `pippenger_interleaved`. For BS=1, degenerates to `commit()`. Depends only on 0a.

### 0c. Gemini `shift_exponent` — support for shift-by-BS in PCS

**Where to find:** `si/multipcs-proto`
- `barretenberg/cpp/src/barretenberg/commitment_schemes/gemini/gemini.hpp` (~524 lines diff vs `merge-train/avm`)

**Why needed:** Materialized interleaved group polynomials have stride BS — a row shift of the original entity means a shift by BS positions in the interleaved poly. The base Gemini only supports `batched_to_be_shifted_by_one` (shift by 1). The branch generalizes `PolynomialBatcher` to accept a `shift_exponent` parameter (default 1, set to BS for interleaved groups).

**This is the largest port.** The branch also has Gemini changes for rho batching refactor and ZK tail polynomials — strip the ZK-specific parts (AVM has `HasZK = false`).

### 0d. `compute_lagrange_basis_impl` — Lagrange basis utility

**Where to find:** `si/multipcs-proto`
- `barretenberg/cpp/src/barretenberg/flavor/mega_interleaving_entities.hpp` (lines ~549-565)

Trivial utility (~15 lines). Supports BS=1,2,4. Copy into AVM utility header or inline in verifier.

### What NOT to port

- Ultra/Mega interleaving entity files (`ultra_interleaving_entities.hpp`, `mega_interleaving_entities.hpp`) — AVM has its own grouping via codegen
- Oink round restructuring (`OinkWitnessRounds_<BS>`) — AVM has its own simpler commitment rounds
- Flavor templates (`UltraFlavor_<BS>`, `MegaFlavor_<BS>`) — not applicable
- Recursive flavors — follow-up work
- ZK masking (`MaskingEntities`, tail polynomials) — AVM has no ZK

---

## Compilation strategy

AVM compilation is slow (~4 min for `bb-avm`). Minimize compile cycles by batching interdependent changes.

**Recommended order:**

1. **Codegen (Step 1)** — Rust, compiles fast. Verify generated output before touching C++.
2. **Port infrastructure (Step 0)** — shared barretenberg code, not AVM-specific. Validate with existing PCS tests (`shplemini.test.cpp`, `kzg.test.cpp`) which build faster than AVM targets.
3. **All AVM changes in one pass (Steps 2-6)** — these are interdependent, changing one without the others won't compile:
   - `Transcript::commitments` array size (flavor) must match prover send / verifier receive counts
   - Proof length formula must match serialization
   - VK type must match verifier usage
   - **Write all of flavor + prover + verifier + VK changes before compiling.**
4. **Build targets by cost:**
   - `barretenberg_linter` — syntax only, fastest
   - `vm2_tests` — faster than `bb-avm`, sufficient for prove+verify tests
   - `bb-avm` — full build, only for final validation

---

## Step 1: Codegen — emit interleaving constants

**Files:**
- `bb-pilcom/bb-pil-backend/src/vm_builder.rs`
- `bb-pilcom/bb-pil-backend/templates/columns.hpp.hbs`
- `barretenberg/cpp/scripts/avm2_gen.sh`

**What to do:**

1. Add `--batch-size` CLI argument to `bb_pil` (default 1). Pass to template context.

2. In `columns.hpp.hbs`, emit after existing layout constants:

```cpp
constexpr auto INTERLEAVING_BATCH_SIZE = {{batch_size}};
constexpr auto INTERLEAVING_LOG_K = {{log2_batch_size}};

constexpr auto NUM_PRECOMPUTED_GROUPS = (NUM_PRECOMPUTED_ENTITIES + INTERLEAVING_BATCH_SIZE - 1) / INTERLEAVING_BATCH_SIZE;
constexpr auto NUM_WIRE_GROUPS = (NUM_WIRE_ENTITIES + INTERLEAVING_BATCH_SIZE - 1) / INTERLEAVING_BATCH_SIZE;
constexpr auto NUM_DERIVED_GROUPS = (NUM_DERIVED_ENTITIES + INTERLEAVING_BATCH_SIZE - 1) / INTERLEAVING_BATCH_SIZE;
constexpr auto NUM_SHIFTED_GROUPS = (NUM_SHIFTED_ENTITIES + INTERLEAVING_BATCH_SIZE - 1) / INTERLEAVING_BATCH_SIZE;
constexpr auto NUM_WITNESS_GROUPS = NUM_WIRE_GROUPS + NUM_DERIVED_GROUPS;
constexpr auto NUM_UNSHIFTED_GROUPS = NUM_PRECOMPUTED_GROUPS + NUM_WITNESS_GROUPS;
```

3. Update `avm2_gen.sh` to forward `--batch-size`.

**Verify:** Regenerate with `--batch-size 1`, diff against current output — must be identical.

---

## Step 2: Flavor — add constants and update proof layout

**File:** `vm2/constraining/flavor.hpp`

1. Import generated constants into `AvmFlavor`:
```cpp
static constexpr size_t INTERLEAVING_BATCH_SIZE = bb::avm2::INTERLEAVING_BATCH_SIZE;
static constexpr size_t INTERLEAVING_LOG_K = bb::avm2::INTERLEAVING_LOG_K;
static constexpr size_t NUM_WIRE_GROUPS = bb::avm2::NUM_WIRE_GROUPS;
static constexpr size_t NUM_DERIVED_GROUPS = bb::avm2::NUM_DERIVED_GROUPS;
static constexpr size_t NUM_WITNESS_GROUPS = bb::avm2::NUM_WITNESS_GROUPS;
static constexpr size_t NUM_UNSHIFTED_GROUPS = bb::avm2::NUM_UNSHIFTED_GROUPS;
static constexpr size_t NUM_SHIFTED_GROUPS = bb::avm2::NUM_SHIFTED_GROUPS;
```

2. Update `Transcript`:
```cpp
// Before:
std::array<Commitment, NUM_WITNESS_ENTITIES> commitments;
// After:
std::array<Commitment, NUM_WITNESS_GROUPS> commitments;
```

3. Update `COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS`:
```cpp
NUM_WITNESS_GROUPS * NUM_FRS_COM +                                              // was NUM_WITNESS_ENTITIES
NUM_ALL_ENTITIES * NUM_FRS_FR +                                                 // sumcheck evals (unchanged)
MAX_AVM_TRACE_LOG_SIZE * NUM_FRS_FR * BATCHED_RELATION_PARTIAL_LENGTH +        // sumcheck univariates (unchanged)
(MAX_AVM_TRACE_LOG_SIZE + INTERLEAVING_LOG_K - 1) * NUM_FRS_COM +              // gemini fold comms (+LOG_K)
(MAX_AVM_TRACE_LOG_SIZE + INTERLEAVING_LOG_K) * NUM_FRS_FR +                   // gemini fold evals (+LOG_K)
2 * NUM_FRS_COM                                                                 // shplonk + kzg
```

Group polynomials have degree `N * BS`, so Gemini needs `log2(N * BS) = log2(N) + LOG_K` rounds — `LOG_K` more fold commitments and evaluations than before. Interleaving challenges are Fiat-Shamir (derived from transcript hash), not proof elements.

---

## Step 3: Prover — interleaved commitment rounds

**File:** `vm2/constraining/prover.cpp`

### 3a. Wire commitment round

```cpp
// Current: batch-commit individual wires
void AvmProver::execute_wire_commitments_round() {
    auto batch = commitment_key.start_batch();
    for (auto [poly, label] : zip_view(prover_polynomials.get_wires(),
                                        prover_polynomials.get_wires_labels())) {
        batch.add_to_batch(poly, label);
    }
    batch.commit_and_send_to_verifier(transcript, AVM_MAX_MSM_BATCH_SIZE);
}
```

```cpp
// New: commit interleaved groups
void AvmProver::execute_wire_commitments_round() {
    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;
    auto wires = prover_polynomials.get_wires();
    for (size_t g = 0; g < Flavor::NUM_WIRE_GROUPS; g++) {
        size_t start = g * BS;
        size_t count = std::min(BS, wires.size() - start);
        std::vector<PolynomialSpan<const FF>> chunks;
        for (size_t j = 0; j < count; j++) {
            chunks.push_back(wires[start + j]);
        }
        auto comm = commitment_key.commit_interleaved<BS>(chunks);
        transcript->send_to_verifier("WIRE_GROUP_" + std::to_string(g), comm);
    }
}
```

For BS=1, `commit_interleaved<1>` degenerates to `commit()`.

**Batched MSM:** The naive loop above makes one `pippenger_interleaved` call per group (~1280 for BS=2 wires). To match the current batching behavior (`AVM_MAX_MSM_BATCH_SIZE=32`), extend `CommitBatch` to support interleaved groups, or add a `batch_commit_interleaved` that collects multiple groups and commits them in fewer MSM calls. This avoids a performance regression from the current batched path.

### 3b. Derived commitment round

Same pattern over `get_derived()` with `NUM_DERIVED_GROUPS`.

### 3c. PCS round — materialize interleaved polynomials

Gemini needs the actual interleaved polynomials to fold and evaluate. Materialize them here (oink uses `commit_interleaved` directly and doesn't need materialization).

All three unshifted categories need materialization: precomputed (from ProvingKey), wires, and derived. Shifted groups are a subset of wire groups (thanks to BS-alignment from 3d).

```cpp
void AvmProver::execute_pcs_rounds() {
    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;

    if constexpr (BS == 1) {
        // Current logic unchanged
        ...
    } else {
        // Materialize interleaved group polynomials
        auto interleaved_precomputed = build_interleaved_groups<BS>(
            prover_polynomials.get_precomputed(), Flavor::NUM_PRECOMPUTED_GROUPS);
        auto interleaved_wires = build_interleaved_groups<BS>(
            prover_polynomials.get_wires(), Flavor::NUM_WIRE_GROUPS);
        auto interleaved_derived = build_interleaved_groups<BS>(
            prover_polynomials.get_derived(), Flavor::NUM_DERIVED_GROUPS);

        // Unshifted groups = precomputed + wires + derived (concatenated)
        // Shifted groups = wire groups in [SHIFTED_WIRE_GROUP_START..SHIFTED_WIRE_GROUP_END)
        //   (a contiguous subset of interleaved_wires, thanks to BS-alignment)

        // Get short batching challenges (one per unshifted group)
        // Batch groups with short scalars
        // Pass to PolynomialBatcher, Shplemini + KZG
        ...
    }
}
```

Helper:
```cpp
// Materialize F_g(X) = sum_{j=0}^{BS-1} f_{g*BS+j}(X^BS) * X^j
template <size_t BS>
std::vector<Polynomial> build_interleaved_groups(std::span<Polynomial> polys, size_t num_groups) {
    std::vector<Polynomial> result;
    result.reserve(num_groups);
    for (size_t g = 0; g < num_groups; g++) {
        size_t start = g * BS;
        size_t max_end = 0;
        for (size_t j = 0; j < BS && start + j < polys.size(); j++) {
            max_end = std::max(max_end, polys[start + j].end_index());
        }
        Polynomial interleaved(max_end * BS);
        for (size_t j = 0; j < BS && start + j < polys.size(); j++) {
            const auto& p = polys[start + j];
            for (size_t i = 0; i < p.end_index(); i++) {
                interleaved.at(i * BS + j) = p.at(i);
            }
        }
        result.push_back(std::move(interleaved));
    }
    return result;
}
```

### 3d. Shifted polynomial grouping — BS-alignment required

The `to_be_shifted` range is contiguous within wires (`WIRES_TO_BE_SHIFTED_START_IDX` to `WIRES_TO_BE_SHIFTED_END_IDX`). The PCS needs shifted group commitments that correspond to actual wire group commitments (same commitment, different evaluation point). If a wire group mixes shifted and non-shifted polys, the shifted group polynomial would differ from the wire group polynomial — commitment mismatch, verification fails.

**The codegen must ensure `WIRES_TO_BE_SHIFTED_START_IDX` is BS-aligned within the wire layout.** Then shifted groups are a contiguous subset of wire groups and their commitments match. If `NUM_WIRES_TO_BE_SHIFTED` is not divisible by BS, pad the last shifted group with zero polynomials.

This is a required change in `vm_builder.rs`: when emitting the wire column order, pad the non-shifted wire section to the next BS boundary before emitting shifted wires.

---

## Step 4: Verifier — receive group commitments, combine evaluations

**File:** `vm2/constraining/verifier.cpp`

### 4a. Receive grouped commitments

```cpp
// Receive wire group commitments
std::vector<Commitment> wire_group_comms(Flavor::NUM_WIRE_GROUPS);
for (size_t g = 0; g < Flavor::NUM_WIRE_GROUPS; g++) {
    wire_group_comms[g] =
        transcript->template receive_from_prover<Commitment>("WIRE_GROUP_" + std::to_string(g));
}

// Get beta, gamma challenges (unchanged)

// Receive derived group commitments
std::vector<Commitment> derived_group_comms(Flavor::NUM_DERIVED_GROUPS);
for (size_t g = 0; g < Flavor::NUM_DERIVED_GROUPS; g++) {
    derived_group_comms[g] =
        transcript->template receive_from_prover<Commitment>("DERIVED_GROUP_" + std::to_string(g));
}
```

### 4b. Sumcheck — unchanged

Sumcheck runs on individual entity evaluations as today. No changes.

### 4c. Get interleaving challenges and Lagrange basis

After sumcheck, before PCS:

```cpp
constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;

std::vector<FF> interleaving_challenges;
for (size_t i = 0; i < Flavor::INTERLEAVING_LOG_K; i++) {
    interleaving_challenges.push_back(
        transcript->template get_challenge<FF>("interleaving_challenge_" + std::to_string(i)));
}

// L_j = product over bits of j: if bit_k=1 then u_k, else (1 - u_k)
auto lagrange_basis = compute_interleaving_lagrange_basis<BS>(interleaving_challenges);
```

### 4d. Combine evaluations into group evaluations

```cpp
auto combine_evals = [&](std::span<const FF> evals, size_t num_groups) -> std::vector<FF> {
    std::vector<FF> group_evals(num_groups);
    for (size_t g = 0; g < num_groups; g++) {
        FF combined(0);
        for (size_t j = 0; j < BS && g * BS + j < evals.size(); j++) {
            combined += evals[g * BS + j] * lagrange_basis[j];
        }
        group_evals[g] = combined;
    }
    return group_evals;
};

auto unshifted_group_evals = combine_evals(unshifted_evals, Flavor::NUM_UNSHIFTED_GROUPS);
auto shifted_group_evals = combine_evals(shifted_evals, Flavor::NUM_SHIFTED_GROUPS);
```

### 4e. PCS verification

Same structure as current, but over group commitments + group evaluations:

```cpp
// Collect all unshifted group commitments: precomputed groups + wire groups + derived groups
// Batch with short scalars
// Collect shifted group commitments (subset of wire groups)
// Batch with short scalars
// Pass to Shplemini + KZG pairing check
```

---

## Step 5: Transcript serialization

**File:** `vm2/constraining/flavor.hpp` (Transcript class)

Update `serialize_full_transcript()` and `deserialize_full_transcript()`:

```
[NUM_WITNESS_GROUPS commitments]                            ← was NUM_WITNESS_ENTITIES
[sumcheck univariates]                                       ← unchanged
[NUM_ALL_ENTITIES sumcheck evaluations]                      ← unchanged
[(MAX_AVM_TRACE_LOG_SIZE + LOG_K - 1) gemini fold comms]    ← was (LOG_SIZE - 1)
[(MAX_AVM_TRACE_LOG_SIZE + LOG_K) gemini fold evals]        ← was LOG_SIZE
[shplonk + kzg]                                              ← unchanged
```

Interleaving challenges are Fiat-Shamir challenges (derived from transcript hash), not proof elements — they don't appear in serialized proof. The extra Gemini folds come from group polynomials having degree `N * BS`.

---

## Step 6: Precomputed (VK) commitment interleaving

**Files:**
- `vm2/constraining/flavor.hpp` (VerificationKey)
- VK generation code (wherever precomputed commitments are computed)

Precomputed columns must be interleaved in the same way as witness columns. The PCS operates over all unshifted group commitments — precomputed groups + wire groups + derived groups. If precomputed commitments stay individual while witness commitments are grouped, the claim counts won't match and verification fails.

### 6a. VK stores group commitments

```cpp
// Before: VK holds NUM_PRECOMPUTED_ENTITIES individual commitments (122)
// After: VK holds NUM_PRECOMPUTED_GROUPS group commitments (61 for BS=2)
```

The `VerificationKey` / `PrecomputedEntities` type needs to change from holding `NUM_PRECOMPUTED_ENTITIES` commitments to `NUM_PRECOMPUTED_GROUPS` group commitments.

### 6b. VK generation

When computing the VK, interleave BS consecutive precomputed polynomials per group commitment:

```cpp
for (size_t g = 0; g < NUM_PRECOMPUTED_GROUPS; g++) {
    // collect BS consecutive precomputed polys
    // commit_interleaved<BS>(chunks)
    // store as vk.precomputed_group_commitments[g]
}
```

### 6c. Verifier uses precomputed group commitments

In `verifier.cpp`, the PCS collects all unshifted group commitments:
```cpp
// precomputed groups (from VK) + wire groups (from proof) + derived groups (from proof)
// = NUM_UNSHIFTED_GROUPS total
```

The verifier combines precomputed sumcheck evaluations into group evaluations using the same Lagrange basis as witness evaluations.

### 6d. Hardcoded VK update

The AVM uses a hardcoded VK (`avm_fixed_vk.hpp`). This needs to be regenerated with group commitments instead of individual ones. The VK hash will change.

---

## Step 7: Update Noir proof length constant

**File:** `noir-projects/.../constants.nr`

Update `AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED` to match new `COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS`.

For BS=2: proof shrinks by ~`(3012 - 1506) * 2 = 3012` field elements from fewer commitments.

---

## File change summary

| File | Change |
|------|--------|
| `bb-pilcom/bb-pil-backend/src/vm_builder.rs` | Accept `--batch-size`, pass to templates |
| `bb-pilcom/bb-pil-backend/templates/columns.hpp.hbs` | Emit interleaving constants and group counts |
| `barretenberg/cpp/scripts/avm2_gen.sh` | Forward `--batch-size` |
| `vm2/generated/columns.hpp` | (regenerated) |
| `vm2/constraining/flavor.hpp` | Group constants, Transcript, proof length, VK type |
| `vm2/constraining/avm_fixed_vk.hpp` | (regenerated) hardcoded VK with group commitments |
| `vm2/constraining/prover.cpp` | Batched `commit_interleaved` rounds, materialized PCS |
| Commitment key (`commitment_key.hpp`) | `batch_commit_interleaved` or extend `CommitBatch` |
| `vm2/constraining/verifier.cpp` | Receive groups, Lagrange combine, group PCS with precomputed groups |
| VK generation code | Interleave precomputed polys into group commitments |
| `noir-projects/.../constants.nr` | Proof length + VK length |

---

## Testing

1. **BS=1 regression:** Regenerate with `--batch-size 1`, `vm2_tests` must pass identically.
2. **BS=2 unit test:** Prove + verify in `vm2_tests`.
3. **End-to-end:** TS bulk test (`avm_bulk.test.ts`).

---

## Follow-up work (not in scope)

- Recursive verifier support for interleaved AVM proofs.
