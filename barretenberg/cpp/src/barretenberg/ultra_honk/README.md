# Ultra Honk

Honk is a Sumcheck-based SNARK for general-purpose circuits expressed in the **Ultra** and **Mega** arithmetizations. It proves that a witness satisfies a set of polynomial relations over a multilinear evaluation domain, then opens the resulting evaluations via a KZG-based polynomial commitment scheme.

For the IVC/folding layer built on top of Honk, see the [Chonk README](../chonk/README.md).

## Architecture Overview

```
                              PROVER

Circuit Builder ──► ProverInstance ──► Oink ──► Sumcheck ──► PCS ──► Proof
                    (trace +            │                     │
                     polynomials)       │                     ├─ Gemini  (multilinear → univariate)
                                        │                     ├─ Shplonk (batch univariate claims)
                                        │                     └─ KZG     (opening proof)
                                        │
                                        ├─ VK hash + public inputs
                                        ├─ Masking polynomial (ZK only)
                                        ├─ Wire commitments
                                        ├─ Lookup counts + w_4
                                        ├─ Log-derivative inverses
                                        └─ Z_perm (grand product)


                              VERIFIER

Proof ──► Oink (receive commitments, derive challenges)
      ──► Sumcheck (check round univariates, extract evaluation)
      ──► PCS (Shplemini ──► pairing check)
```

### Key Files

| Component | Path (relative to `barretenberg/cpp/src/barretenberg/`) |
|---|---|
| Circuit builders | `stdlib_circuit_builders/ultra_circuit_builder.hpp`, `stdlib_circuit_builders/mega_circuit_builder.hpp` |
| Prover | `ultra_honk/ultra_prover.hpp`, `ultra_honk/ultra_prover.cpp` |
| Verifier | `ultra_honk/ultra_verifier.hpp`, `ultra_honk/ultra_verifier.cpp` |
| Oink prover | `ultra_honk/oink_prover.hpp`, `ultra_honk/oink_prover.cpp` |
| Oink verifier | `ultra_honk/oink_verifier.hpp`, `ultra_honk/oink_verifier.cpp` |
| Prover instance | `ultra_honk/prover_instance.hpp` |
| Witness computation | `ultra_honk/witness_computation.hpp` |
| Trace-to-polynomials | `trace_to_polynomials/trace_to_polynomials.hpp` |
| Flavors | `flavor/ultra_flavor.hpp`, `flavor/mega_flavor.hpp` |
| Sumcheck | `sumcheck/sumcheck.hpp` |
| Gemini | `commitment_schemes/gemini/gemini.hpp` |
| Shplonk / Shplemini | `commitment_schemes/shplonk/shplonk.hpp`, `commitment_schemes/shplonk/shplemini.hpp` |
| KZG | `commitment_schemes/kzg/kzg.hpp` |
| Transcript | `transcript/transcript.hpp` |

## Flavors

A **Flavor** is a compile-time configuration bundle that fixes the field, curve, relations, polynomial layout, commitment scheme, and transcript hash for a particular Honk instantiation.

The two base arithmetizations determine the relation set:
- **Ultra** (9 relations): arithmetic, permutation, lookup, range, elliptic, memory, non-native field, Poseidon2
- **Mega** (11 relations): Ultra relations + EccOpQueue + Databus (for Goblin integration)

ZK variants inherit the same relations from their base; they only add masking and row-disabling machinery (see [Zero-Knowledge](#zero-knowledge)).

All flavors use Poseidon2 for Fiat-Shamir, except the Keccak variants which use Keccak for EVM-compatible on-chain verification. ZK variants (suffix `ZK`) add witness masking, Libra, and row disabling (see [Zero-Knowledge](#zero-knowledge)).

| Flavor | Purpose |
|---|---|
| `UltraFlavor` | Base Ultra proving |
| `UltraZKFlavor` | ZK Ultra proving |
| `UltraKeccakFlavor` | On-chain (Solidity) verification |
| `UltraKeccakZKFlavor` | ZK on-chain verification |
| `MegaFlavor` | Chonk folding (non-ZK inner proofs) |
| `MegaZKFlavor` | Hiding Kernel in Chonk |

Each flavor defines:
- **Curve / Field**: BN254 scalar field
- **PCS**: KZG
- **Relations**: inherited from the base arithmetization (Ultra or Mega)
- **Polynomial entities**: precomputed, witness, shifted, and (for ZK) masking polynomials
- **Transcript**: codec + hash function determining Fiat-Shamir

Source: [`flavor/ultra_flavor.hpp`](../flavor/ultra_flavor.hpp), [`flavor/mega_flavor.hpp`](../flavor/mega_flavor.hpp), [`flavor/ultra_zk_flavor.hpp`](../flavor/ultra_zk_flavor.hpp), [`flavor/mega_zk_flavor.hpp`](../flavor/mega_zk_flavor.hpp), [`flavor/ultra_keccak_flavor.hpp`](../flavor/ultra_keccak_flavor.hpp)

## Proof Flow -- Prover Side

The prover entry point is `UltraProver_::construct_proof()` ([`ultra_prover.cpp`](ultra_prover.cpp)).

### 1. ProverInstance Construction

A **circuit builder** (`UltraCircuitBuilder` or `MegaCircuitBuilder`) accumulates gates that define the circuit: it manages witness values, assigns them to wires, and records which selectors are active on each row. See the [Circuit Builders README](../stdlib_circuit_builders/README.md) for details.

The circuit builder's execution trace is then converted into multilinear polynomials over the boolean hypercube. Selector polynomials (precomputed) and witness polynomials (wires) are populated from the trace blocks.

See [`trace_to_polynomials/`](../trace_to_polynomials/trace_to_polynomials.hpp).

### 2. Oink Rounds

The **Oink** sub-protocol ([`oink_prover.hpp`](oink_prover.hpp)) runs the preprocessing rounds shared between standalone proving and folding. Each step commits to polynomials and squeezes Fiat-Shamir challenges:

1. **`send_vk_hash_and_public_inputs`** -- send verification key hash and circuit public inputs
2. **`commit_to_masking_poly`** -- (ZK flavors only) commit to the Gemini masking polynomial
3. **`commit_to_wires`** -- commit to witness wire polynomials (w_1 ... w_3)
4. **`commit_to_lookup_counts_and_w4`** -- compute RAM/ROM memory records into w_4, commit to lookup read/write counts and w_4
5. **`commit_to_logderiv_inverses`** -- compute and commit to log-derivative inverse polynomials (for lookups and, in Mega, databus)
6. **`commit_to_z_perm`** -- compute and commit to the permutation grand product polynomial

### 3. Sumcheck

Sumcheck reduces the claim that the relation sum vanishes over the boolean hypercube to a single evaluation at a random challenge point `u = (u_1, ..., u_d)`. In each of `d = log(N)` rounds, the prover sends a univariate polynomial; the verifier checks its endpoint sum and provides the next challenge.

See [`sumcheck/Sumcheck.md`](../sumcheck/Sumcheck.md) for full details.

### 4. PCS Opening

After Sumcheck produces the evaluation point `u` and claimed evaluations, the polynomial commitment scheme proves these evaluations are correct:

1. **Gemini**: reduces multilinear evaluation claims to univariate claims via a folding scheme. See [`commitment_schemes/gemini/README.md`](../commitment_schemes/gemini/README.md).
2. **Shplonk**: batches the univariate opening claims into a single claim. See [`commitment_schemes/shplonk/README.md`](../commitment_schemes/shplonk/README.md).
3. **KZG**: produces a single-point opening proof (a group element). See [`commitment_schemes/kzg/README.md`](../commitment_schemes/kzg/README.md).

In practice, Gemini and Shplonk are fused in **Shplemini** ([`commitment_schemes/shplonk/shplemini.hpp`](../commitment_schemes/shplonk/shplemini.hpp)) for efficiency.

For ZK flavors, a **SmallSubgroupIPA** proof is additionally produced to verify the Libra masking evaluation. See [`commitment_schemes/small_subgroup_ipa/README.md`](../commitment_schemes/small_subgroup_ipa/README.md).

## Proof Flow -- Verifier Side

The verifier entry point is `UltraVerifier_::verify_proof()` ([`ultra_verifier.cpp`](ultra_verifier.cpp)).

### 1. Oink Verification

The [`OinkVerifier`](oink_verifier.hpp) mirrors the prover: it receives commitments from the transcript, derives the same Fiat-Shamir challenges, and stores them for Sumcheck.

### 2. Sumcheck Verification

The verifier replays Sumcheck: in each round it reads the prover's univariate, checks the degree and endpoint consistency, and derives the challenge. At the end it obtains the evaluation point `u` and the claimed relation evaluation.

### 3. PCS Verification

**Shplemini** (the verifier-side fusion of Gemini + Shplonk) reconstructs the batched KZG opening claim from the transcript. For native verification this results in a pairing check; for recursive verification it outputs pairing points for deferred verification in the outer circuit.

For rollup circuits (with `RollupIO`), an additional IPA proof is verified.

## Public Inputs

Public inputs are values that both the prover and verifier know and that must be consistent with the witness. At the circuit builder level, calling `set_public_input(witness_index)` marks an existing witness variable as public. During circuit finalization, these values are collected into a dedicated `pub_inputs` trace block -- a contiguous range of rows in the first wire polynomial (`w_l`) at a known offset (`pub_inputs_offset`). Unlike other trace blocks, the public inputs block has no gate selector; instead, the values are enforced via the permutation argument.

During Oink, the prover sends the public input values through the transcript, and the verifier reads them back. These values are incorporated into the Fiat-Shamir challenge derivation, binding them to the proof. The verifier also uses them to compute the **public input delta** -- a correction factor for the permutation grand product that accounts for the modified copy constraints on the public input rows. Without this correction, the permutation argument would fail because the identity permutation is deliberately broken at public input positions to "expose" those wire values.

In the broader Aztec system, the public inputs also carry **special structured data** depending on the circuit's role. The `IO` template parameter on the verifier (`DefaultIO`, `RollupIO`, `HidingKernelIO`) determines what structured data is extracted from the public inputs after verification -- for example, pairing points for deferred verification, IPA claims for rollups, or kernel return data for the Hiding Kernel.

## Zero-Knowledge

ZK flavors (`UltraZKFlavor`, `UltraKeccakZKFlavor`, `MegaZKFlavor`) achieve zero-knowledge by ensuring that no prover message leaks information about the witness. The ZK mechanisms form a chain: witness polynomial masking prevents commitments from leaking, row disabling prevents the masked rows from breaking relations, Libra masking hides Sumcheck round univariates, SmallSubgroupIPA proves the Libra evaluation without revealing it, and the Gemini masking polynomial hides the individual polynomial evaluations opened in Gemini, Shplonk, and KZG.

### 1. Witness Polynomial Masking

Each witness polynomial (wires, lookup counts/tags/inverses, z_perm, databus columns) has its last `NUM_MASKED_ROWS = 3` entries overwritten with random field elements before commitment. This is done by `Polynomial::mask()` during Oink, called via `commit_to_witness_polynomial` and `batch.add_to_batch(..., /*mask?*/ Flavor::HasZK)`.

Because the polynomial is masked *before* the commitment is computed, the commitment reveals nothing about the original witness values -- it commits to the masked polynomial, which has a random tail.

### 2. Row Disabling

The 3 masked rows plus 1 adjacent row (needed for shifted polynomials) cannot satisfy the circuit relations, since the witness values there are random. To prevent this from causing Sumcheck to fail, ZK flavors multiply the entire relation by a **row-disabling polynomial** that evaluates to zero on the last `NUM_DISABLED_ROWS_IN_SUMCHECK = 4` rows of the boolean hypercube. This increases `BATCHED_RELATION_PARTIAL_LENGTH` by 1 compared to the non-ZK flavor.

### 3. Libra Masking (Sumcheck Round Univariates)

Without additional masking, the Sumcheck round univariates would still leak witness information (they are computed from the witness polynomials). The **Libra** technique adds a random masking polynomial:

$$G(X_0, \ldots, X_{d-1}) = c + \sum_{i=0}^{d-1} g_i(X_i)$$

where `c` is a random constant and each `g_i` is a random univariate of degree `BATCHED_RELATION_PARTIAL_LENGTH - 1`. The prover commits to a concatenation of the Libra univariates (encoded over a small multiplicative subgroup), sends the total sum of G over the hypercube, and receives a challenge `ρ`. The Sumcheck is then run on `F + ρ·G` instead of `F`. Because G has separable structure, each Sumcheck round univariate gets an additive correction derived from `g_i` and a running sum over the remaining Libra univariates. This makes each round message statistically independent of the witness.

See the ZK section of [`sumcheck/Sumcheck.md`](../sumcheck/Sumcheck.md).

### 4. SmallSubgroupIPA (Libra Evaluation Proof)

At the end of Sumcheck, the verifier needs to check that the Libra polynomial was evaluated correctly at the challenge point `u = (u_0, ..., u_{d-1})`. Because the Libra univariates are the prover's secret, their evaluations cannot be sent directly. Instead, the evaluation is reformulated as an inner product `⟨F, G⟩ = s` where G encodes the Libra coefficients and F encodes the challenge powers, then proved using the **SmallSubgroupIPA** protocol over a small multiplicative subgroup of BN254.

SmallSubgroupIPA produces 3 additional commitments (the concatenated Libra polynomial, a grand-sum accumulator, and a quotient polynomial) and 4 evaluations, all of which are batched into the Shplemini opening claim.

See [`commitment_schemes/small_subgroup_ipa/README.md`](../commitment_schemes/small_subgroup_ipa/README.md).

### 5. Gemini Masking Polynomial (PCS Evaluation Masking)

Even with all the above, the polynomial evaluations revealed during the PCS stage (Gemini fold evaluations sent to the verifier, then opened via Shplonk) would leak witness information, since they are linear combinations of the witness polynomials evaluated at the Gemini challenge.

To prevent this, a random polynomial `gemini_masking_poly` of size `N` is generated and committed during Oink. It is included in the set of polynomials batched by Gemini (via `polynomial_batcher.set_unshifted`), so the batched polynomial `A_0 = Σ ρ^j · f_j` includes a `ρ^k · gemini_masking_poly` term. Since this random polynomial is known only to the prover, its contribution makes every Gemini fold evaluation (`A_l(±r^{2^l})`) uniformly random from the verifier's perspective. The verifier holds the commitment to the masking polynomial and can account for it during Shplemini verification.

### 6. KZG Witness

The final KZG opening proof is a single group element `[q]` (the quotient commitment). Because KZG is hiding when the opened polynomial is masked (which it is, thanks to the Gemini masking polynomial), the KZG witness itself reveals nothing about the witness.

### Summary of ZK Pipeline

```
Witness polynomials
    │
    ▼ mask last 3 rows with random values
Masked witness polynomials
    │
    ▼ commit (commitments are hiding thanks to masking)
Commitments ──► Oink transcript
    │
    ▼ disable last 4 rows in Sumcheck (row-disabling polynomial)
    ▼ add Libra random univariates to each round (Sumcheck round univariates are hiding)
Sumcheck challenge point u
    │
    ▼ prove Libra evaluation via SmallSubgroupIPA (evaluation is hiding)
    ▼ include gemini_masking_poly in Gemini batching (fold evaluations are hiding)
Gemini fold evaluations ──► Shplonk batching ──► KZG opening proof
    │
    ▼ all prover messages are independent of witness ✓
```

## Relations

### Custom Gates and Selectors

Honk's arithmetization uses **custom gates**: each row of the execution trace has four witness wires (`w_l`, `w_r`, `w_o`, `w_4`) and a set of **selector polynomials** (`q_arith`, `q_elliptic`, `q_lookup`, etc.) that control which constraint is active on that row. A selector value of zero disables the corresponding relation for that row, so different rows can enforce entirely different constraints.

Unlike some proving systems where selectors are treated as public constants inlined into the verifier, in Honk the selector polynomials are committed and their evaluations are opened alongside the witness polynomials via Gemini/Shplonk. The verification key stores only the commitments, not the full polynomials. This keeps the verifier's work independent of the selector polynomial size, which is critical for recursive verification where embedding full selector values into a circuit would be prohibitively expensive.

For example, the `ArithmeticRelation` is gated by `q_arith`. When `q_arith = 0` the row is unconstrained by arithmetic; when `q_arith = 1` it enforces a standard fan-in-2 gate `q_m·w_l·w_r + q_l·w_l + q_r·w_r + q_o·w_o + q_4·w_4 + q_c = 0`; higher values of `q_arith` (2, 3) activate additional sub-identities (e.g. a carry-propagation term `w_4_shift` or a cross-row difference constraint). Similarly, `q_elliptic` toggles the elliptic curve point addition/doubling gate, `q_poseidon2_external` and `q_poseidon2_internal` toggle Poseidon2 round gates, and so on.

This selector-driven design means a single circuit can mix arithmetic, elliptic curve, hash, memory, and lookup gates in the same trace without overhead for inactive constraint types.

### Relation Shape and Sumcheck

Each relation is a low-degree multivariate polynomial in the wire and selector values. The key structural parameters are:

- **Subrelations**: a relation may contain multiple subrelation identities (e.g. `ArithmeticRelation` has 2, `EllipticRelation` has 2). Each subrelation can have a different algebraic degree.
- **Partial length**: the degree of a subrelation as a polynomial in the witness/selector polynomials, plus 1. For example, a subrelation of degree 5 has partial length 6. The flavor's `MAX_PARTIAL_RELATION_LENGTH` is the maximum across all subrelations (7 for Ultra, 7 for Mega).
- **Batched relation partial length**: `MAX_PARTIAL_RELATION_LENGTH + 1`, accounting for the `pow` gate-separation polynomial that Sumcheck multiplies into each round univariate. For ZK flavors this is incremented by 1 again, for the row-disabling polynomial.

During each Sumcheck round, every relation's `accumulate` method is called on extended edges (witness polynomial evaluations extended from degree 1 to the subrelation's partial length). Subrelation contributions are batched using powers of the **subrelation separator** challenge `α`. The result is a single round univariate of degree `BATCHED_RELATION_PARTIAL_LENGTH - 1`. Relations that would contribute zero for a given row (detected via the `skip` method checking the selector) are skipped entirely for efficiency.

The flavor defines the relation tuple, e.g. for Ultra:
```cpp
using Relations = std::tuple<ArithmeticRelation<FF>,
                             UltraPermutationRelation<FF>,
                             LogDerivLookupRelation<FF>,
                             DeltaRangeConstraintRelation<FF>,
                             EllipticRelation<FF>,
                             MemoryRelation<FF>,
                             NonNativeFieldRelation<FF>,
                             Poseidon2ExternalRelation<FF>,
                             Poseidon2InternalRelation<FF>>;
```

### Ultra Relations (9)

| # | Relation | Selector | Subrelations | Max Partial Length | Description |
|---|---|---|---|---|---|
| 1 | `ArithmeticRelation` | `q_arith` | 2 | 6 | Fan-in-2 arithmetic gate with optional carry and cross-row modes |
| 2 | `UltraPermutationRelation` | (structural) | 2 | 6 | Grand product for wire copy constraints |
| 3 | `LogDerivLookupRelation` | `q_lookup` | 3 | 5 | Log-derivative lookup argument (inverse, lookup, boolean check) |
| 4 | `DeltaRangeConstraintRelation` | `q_delta_range` | 4 | 6 | Range constraints via successive-difference checks on all 4 wires |
| 5 | `EllipticRelation` | `q_elliptic` | 2 | 6 | Short Weierstrass EC point addition and doubling |
| 6 | `MemoryRelation` | `q_memory` | 6 | 6 | RAM/ROM read-write consistency (memory, ROM, RAM sub-checks) |
| 7 | `NonNativeFieldRelation` | `q_nnf` | 1 | 6 | Non-native field multiplication with carry limbs |
| 8 | `Poseidon2ExternalRelation` | `q_poseidon2_external` | 4 | 7 | Poseidon2 external (full S-box) round, one subrelation per state element |
| 9 | `Poseidon2InternalRelation` | `q_poseidon2_internal` | 4 | 7 | Poseidon2 internal (partial S-box) round, one subrelation per state element |

### Mega Additions (+2)

| # | Relation | Selector | Subrelations | Max Partial Length | Description |
|---|---|---|---|---|---|
| 10 | `EccOpQueueRelation` | `q_busread` | 8 | 3 | ECC operation queue wire consistency (Goblin) |
| 11 | `DatabusLookupRelation` | (structural) | 9 | 5 | Log-derivative databus reads (calldata, return data, secondary calldata; 3 subrelations each) |

See also: [LogUp README](../relations/LOGUP_README.md), [Permutation Argument README](../relations/PERMUTATION_ARGUMENT_README.md), [Generic LogUp README](../relations/generic_lookup/GENERIC_LOGUP_README.md), [Generic Permutation README](../relations/generic_permutation/GENERIC_PERMUTATION_README.md)

## Transcript & Fiat-Shamir

The prover and verifier communicate via a **Transcript** that serializes commitments and field elements, then derives challenges using the configured hash function (Poseidon2 or Keccak). This implements the Fiat-Shamir transform, making the interactive protocol non-interactive.

See [`transcript/README.md`](../transcript/README.md) for full details, including **origin tags** for debugging Fiat-Shamir consistency ([`transcript/Origin Tags Security.md`](../transcript/Origin%20Tags%20Security.md)).

## Commitment Scheme Pipeline

The PCS pipeline converts multilinear polynomial evaluation claims into a single KZG pairing check:

```
Multilinear evaluations at u
        │
        ▼
   ┌─────────┐
   │  Gemini  │  Multilinear → univariate via folding
   └────┬────┘
        │  Univariate opening claims at multiple points
        ▼
   ┌─────────┐
   │ Shplonk │  Batch into single opening claim
   └────┬────┘
        │  Single univariate opening claim
        ▼
   ┌─────────┐
   │   KZG   │  Produce/verify opening proof
   └─────────┘
```

In practice, the prover uses **ShpleminiProver** and the verifier uses **ShpleminiVerifier** which fuse Gemini and Shplonk for better efficiency.

Detailed documentation:
- [Gemini README](../commitment_schemes/gemini/README.md)
- [Shplonk README](../commitment_schemes/shplonk/README.md)
- [KZG README](../commitment_schemes/kzg/README.md)
- [SmallSubgroupIPA README](../commitment_schemes/small_subgroup_ipa/README.md) (ZK only)

## Integration with Higher-Level Systems

### Chonk / IVC

Chonk (Client-side Highly Optimized ploNK) is the IVC layer that folds multiple Mega circuits using HyperNova, then produces a final Honk proof. It uses the Oink sub-protocol for each fold step and MegaZK for the final Hiding Kernel proof.

See [Chonk README](../chonk/README.md).

### Goblin

Goblin defers expensive non-native ECC operations to a specialized ECCVM + Translator pipeline, connected via the Merge Protocol and the ECC op queue. Mega flavors include the `EccOpQueueRelation` and `DatabusLookupRelation` to interface with Goblin.

- [Merge Protocol](../goblin/MERGE_PROTOCOL.md)
- [ECCVM README](../eccvm/README.md)
- [Translator VM README](../translator_vm/README.md)

### DSL / ACIR

The DSL layer translates ACIR (Abstract Circuit Intermediate Representation) produced by Noir into Honk circuit builders.

See [DSL README](../dsl/README.md).

### Recursive Verification

Honk proofs can be verified inside another circuit (recursive verification) using the stdlib recursive verifier. Recursive flavors (`UltraRecursiveFlavor`, `MegaRecursiveFlavor`, etc.) replace native field/group operations with circuit-native (stdlib) equivalents. The recursive verifier outputs pairing points for deferred verification rather than performing the pairing check directly.

See [`stdlib/honk_verifier/`](../stdlib/honk_verifier/).

## Test Targets

Build from `barretenberg/cpp/build` with `ninja <target>`:

| Target | What it covers |
|---|---|
| `ultra_honk_tests` | Ultra/Mega prover-verifier round trips, relation correctness, transcript consistency, lookup/permutation/databus/ROM/RAM, Oink, Sumcheck |
| `chonk_tests` | Chonk IVC fold-and-prove, verifier, transcript invariants |
| `sumcheck_tests` | Sumcheck protocol (standalone) |
| `commitment_schemes_tests` | Gemini, Shplonk, KZG, SmallSubgroupIPA |
| `eccvm_tests` | ECCVM circuit and prover |
| `translator_vm_tests` | Translator circuit and prover |
| `goblin_tests` | Goblin end-to-end, merge protocol |
| `dsl_tests` | ACIR format, mock verifier inputs |
| `stdlib_honk_verifier_tests` | Recursive Ultra/Mega verification |

Test source files in this directory:

- `ultra_honk.test.cpp` -- Ultra prover/verifier round trips
- `mega_honk.test.cpp` -- Mega prover/verifier round trips
- `oink_prover.test.cpp` -- Oink sub-protocol
- `sumcheck.test.cpp` -- Sumcheck integration
- `relation_correctness.test.cpp` -- Per-relation correctness checks
- `lookup.test.cpp` -- Lookup gates
- `permutation.test.cpp` -- Permutation argument
- `databus.test.cpp` -- Databus (Mega)
- `rom_ram.test.cpp` -- ROM/RAM memory gates
- `range_constraint.test.cpp` -- Range constraints
- `ultra_transcript.test.cpp` -- Ultra transcript manifest
- `mega_transcript.test.cpp` -- Mega transcript manifest
