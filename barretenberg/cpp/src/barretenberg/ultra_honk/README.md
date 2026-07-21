# Ultra Honk

Honk is a Sumcheck-based SNARK for general-purpose circuits expressed in the **Ultra** and **Mega** arithmetizations. At a high level, Honk proves that every row of a circuit satisfies a set of polynomial constraints. It converts row-wise checking into a global summation over the boolean hypercube via Sumcheck, then uses polynomial commitments (KZG) to verify the claimed evaluations efficiently.

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
                                        ├─ Lookup counts/tags + w_4
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
- **Ultra** (9 relations): arithmetic, permutation, lookup, range, elliptic, memory, non-native field, Poseidon2 (external + internal)
- **Mega** (11 relations): Ultra relations + EccOpQueue (for Goblin) + Databus (for inter-circuit communication in Chonk)

ZK variants preserve the same algebraic relations but modify how they are enforced (via masking and row disabling). See [Zero-Knowledge](#zero-knowledge).

Fiat-Shamir challenges are derived using Poseidon2, except for Keccak variants which use Keccak for EVM-compatible on-chain verification.

| Flavor | Purpose |
|---|---|
| `UltraFlavor` | Base Ultra proving |
| `UltraZKFlavor` | ZK Ultra proving |
| `UltraKeccakFlavor` | On-chain (Solidity) verification |
| `UltraKeccakZKFlavor` | ZK on-chain verification |
| `MegaFlavor` | Chonk folding (non-ZK inner proofs) |
| `MegaZKFlavor` | Hiding Kernel in Chonk |

Each flavor defines:
- **Curve / Field**: BN254; Fr (BN254 scalar field)
- **PCS**: KZG
- **Relations**: determined by the base arithmetization (Ultra or Mega)
- **Polynomial entities**: precomputed, witness, shifted, and (for ZK) masking polynomials
- **Transcript**: codec + hash function determining Fiat-Shamir

Source: [`flavor/ultra_flavor.hpp`](../flavor/ultra_flavor.hpp), [`flavor/mega_flavor.hpp`](../flavor/mega_flavor.hpp), [`flavor/ultra_zk_flavor.hpp`](../flavor/ultra_zk_flavor.hpp), [`flavor/mega_zk_flavor.hpp`](../flavor/mega_zk_flavor.hpp), [`flavor/ultra_keccak_flavor.hpp`](../flavor/ultra_keccak_flavor.hpp)

## Relations

### Custom Gates and Selectors

Honk's arithmetization uses **custom gates**: each row of the execution trace has four witness wires (`w_l`, `w_r`, `w_o`, `w_4`) and a set of **selector polynomials** (`q_arith`, `q_elliptic`, `q_lookup`, etc.) that control which constraint is active on that row. A selector value of zero disables the corresponding relation for that row, so different rows can enforce entirely different constraints.

Selectors are committed and their evaluations are opened alongside the witness polynomials via Gemini/Shplonk.

For example, the `ArithmeticRelation` is gated by `q_arith`. When `q_arith = 0` the row is unconstrained by arithmetic; when `q_arith = 1` it enforces a standard fan-in-2 gate `q_m·w_l·w_r + q_l·w_l + q_r·w_r + q_o·w_o + q_4·w_4 + q_c = 0`; higher values of `q_arith` (2, 3) activate additional sub-identities (e.g. a carry-propagation term `w_4_shift` or a cross-row difference constraint). Similarly, `q_elliptic` toggles the elliptic curve point addition/doubling gate, `q_poseidon2_external` and `q_poseidon2_internal` toggle Poseidon2 round gates, and so on.

During Sumcheck, rows where a selector is zero are skipped on the prover side via the relation's `skip` method, avoiding unnecessary computation. This is a prover-only optimization — soundness is unaffected because the verifier checks the committed polynomial evaluations regardless.

### Copy Constraints and the Permutation Argument

Wires may need to carry the same value across different rows (e.g. the output of one gate fed as input to another). These **copy constraints** are enforced globally via a permutation argument. The idea: if two wire positions must hold the same value, they are placed in the same cycle of a permutation σ. The **grand product polynomial** `z_perm` accumulates the ratio of (wire + β·id + γ) / (wire + β·σ + γ) across all rows. If all copy constraints hold, the constructed grand product satisfies the required boundary and transition identities (with a `public_input_delta` correction for public input rows). `UltraPermutationRelation` checks that `z_perm` is constructed correctly.

See [Permutation Argument README](../relations/PERMUTATION_ARGUMENT_README.md) for details.

### Relation Shape and Sumcheck

Each relation is a low-degree multivariate polynomial in the wire and selector values. The key structural parameters are:

- **Subrelations**: a relation may contain multiple subrelation identities (e.g. `ArithmeticRelation` has 2, `EllipticRelation` has 2). Each subrelation can have a different algebraic degree.
- **Partial length**: the degree of a subrelation as a polynomial in the witness/selector polynomials, plus 1. For example, a subrelation of degree 5 has partial length 6. The flavor's `MAX_PARTIAL_RELATION_LENGTH` is the maximum across all subrelations (7 for Ultra, 7 for Mega).
- **Batched relation partial length**: `MAX_PARTIAL_RELATION_LENGTH + 1`, accounting for the `pow_{β_gate}` gate-separation polynomial that Sumcheck multiplies into each round univariate. For ZK flavors this is incremented by 1 again, for the row-disabling polynomial.

During each Sumcheck round, every relation's `accumulate` method is called on extended edges (witness polynomial evaluations extended from degree 1 to the subrelation's partial length). Subrelation contributions are batched using powers of the **subrelation separator** challenge `α`. The result is a single round univariate of degree `BATCHED_RELATION_PARTIAL_LENGTH - 1`. Relations that would contribute zero for a given row (detected via the `skip` method checking the selector) are skipped entirely for efficiency.

Not all subrelations are enforced pointwise at every row. Some identities are designed to hold only as a **global sum** over the trace (e.g. a telescoping/log-derivative style check), rather than vanishing at each row individually. For these subrelations, Honk incorporates them into the Sumcheck polynomial without row separation via `pow_{β_gate}`: the verifier only needs the summed contribution to match the expected global value. Each relation declares which of its subrelations are pointwise-enforced via the `SUBRELATION_LINEARLY_INDEPENDENT` array; by default all subrelations are pointwise. The main examples are the "lookup sum" subrelation in `LogDerivLookupRelation`, `DatabusLookupRelation`, and the generic lookup/permutation relations.


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
| 11 | `DatabusLookupRelation` | (structural) | 15 | 5 | Log-derivative databus reads (kernel calldata, 3 app calldata columns, return data; 3 subrelations each) |

See also: [LogUp README](../relations/LOGUP_README.md), [Permutation Argument README](../relations/PERMUTATION_ARGUMENT_README.md), [Generic LogUp README](../relations/generic_lookup/GENERIC_LOGUP_README.md), [Generic Permutation README](../relations/generic_permutation/GENERIC_PERMUTATION_README.md)

### Challenge Roles

Several Fiat-Shamir challenges appear throughout the protocol:

| Challenge | Role | Derived in |
|---|---|---|
| `eta` (+ `eta²`, `eta³`) | Combines wire values into RAM/ROM memory records | Oink (step 4) |
| `beta`, `gamma` | Permutation argument and log-derivative lookup separators | Oink (step 5) |
| `alpha` | Batches subrelation contributions in Sumcheck | Oink (step 6) |
| `β_gate` (gate challenges) | Gate-separation polynomial `pow_{β_gate}` — ensures row separation in Sumcheck | Pre-Sumcheck |
| `u_0, ..., u_{d-1}` | Sumcheck round challenges — define the evaluation point | Sumcheck rounds |
| `ρ_gem` (Gemini) | Batches all polynomials into a single combined polynomial for Gemini folding | PCS |
| `r` (Gemini) | Gemini folding evaluation point | PCS |
| `ν` (Shplonk) | Batches univariate opening claims | PCS |

## Padding

Circuits have variable size, but it is convenient if recursive verifier verification keys are independent of the inner proof's circuit size. To achieve this, flavors with `USE_PADDING = true` run Sumcheck and Gemini with a fixed log-size `VIRTUAL_LOG_N`, regardless of the actual `log_circuit_size`. This produces a fixed-length proof (fixed number of Sumcheck round univariates and Gemini fold commitments/evaluations), so the recursive verifier circuit and its VK are the same for all inner circuit sizes.

The row-disabling polynomial is circuit-size independent, so all sumcheck rounds are processed uniformly by the verifier — no special handling is needed for padded rounds.

On the prover side, `virtual_log_n` is used instead of `log_circuit_size` when generating gate challenges and running Sumcheck, so the prover produces the expected number of rounds. The actual polynomial data only spans `2^log_circuit_size` entries.

## Proof Flow -- Prover Side

The prover entry point is `UltraProver_::construct_proof()` ([`ultra_prover.cpp`](ultra_prover.cpp)).

### 1. ProverInstance Construction

A **circuit builder** (`UltraCircuitBuilder` or `MegaCircuitBuilder`) accumulates gates that define the circuit: it manages witness values, assigns them to wires, and records which selectors are active on each row. See the [Circuit Builders README](../stdlib_circuit_builders/README.md) for details.

The circuit builder's execution trace is then converted into multilinear polynomials over the boolean hypercube. Selector polynomials (precomputed) and witness polynomials (wires) are populated from the trace blocks.

See [`trace_to_polynomials/`](../trace_to_polynomials/trace_to_polynomials.hpp).

### 2. Oink Rounds

The **Oink** sub-protocol ([`oink_prover.hpp`](oink_prover.hpp)) runs the preprocessing rounds shared between standalone proving and folding. Each step commits to polynomials and computes Fiat-Shamir challenges:

1. **`send_vk_hash_and_public_inputs`** -- absorb VK hash into the Fiat-Shamir state, send public inputs to the transcript
2. **`commit_to_masking_poly`** -- (ZK flavors only) commit to the Gemini masking polynomial
3. **`commit_to_wires`** -- commit to w_l, w_r, w_o (plus ECC op wires and databus columns for Mega)
4. **`commit_to_lookup_counts_and_w4`** -- derive **eta**; compute RAM/ROM memory records into w_4; commit to lookup_read_counts, lookup_read_tags, and w_4
5. **`commit_to_logderiv_inverses`** -- derive **beta, gamma**; compute and commit to log-derivative inverse polynomials (for lookups and, in Mega, databus)
6. **`commit_to_z_perm`** -- compute and commit to the permutation grand product polynomial; derive **alpha**

### 3. Sumcheck

Each row of the execution trace corresponds to one point on the boolean hypercube `{0,1}^d` where `d = log(N)`. For each relation, a valid witness makes the relation evaluate to zero at every hypercube point. Honk batches many per-row identities into a single polynomial `F(X)` using random Fiat-Shamir challenges (`α` for subrelation batching and `β_gate` for row separation via `pow_{β_gate}`). The prover then uses the Sumcheck protocol to prove that `∑_{x∈{0,1}^d} pow_{β_gate}(x)·F(x) = 0`. If any row violates a constraint, then `F(x) ≠ 0` at that point, and the randomized weighting makes it infeasible (except with negligible probability over the challenges) for violations to cancel in the global sum.

Concretely, in each of `d` rounds the prover sends a round univariate `S^i`; the verifier checks `S^i(0) + S^i(1)` equals the running target from the previous round, then derives the next challenge `u_i`. After the final round the prover sends the claimed evaluations of all polynomials at the challenge point `u = (u_0, ..., u_{d-1})`; the verifier evaluates the full relation at these values and checks consistency with the last round univariate.

See [`sumcheck/Sumcheck.md`](../sumcheck/Sumcheck.md) for full details.

### 4. PCS Opening

After Sumcheck produces the evaluation point `u` and claimed evaluations, the polynomial commitment scheme proves these evaluations are correct:

1. **Gemini**: reduces multilinear opening claims at the same point to a series of univariate opening claims. It does this by substituting the challenge variables `u_0, ..., u_{d-1}` one at a time: each step halves the polynomial's dimension by fixing one variable, producing a sequence of "fold" polynomials. After `d` folding steps, the original multilinear opening claim has been reduced to a small set of univariate opening claims, and the intermediate fold commitments/evaluations constitute the proof. See [`commitment_schemes/gemini/README.md`](../commitment_schemes/gemini/README.md).
2. **Shplonk**: batches the univariate opening claims (from Gemini and, for ZK flavors, SmallSubgroupIPA) into a single claim. See [`commitment_schemes/shplonk/README.md`](../commitment_schemes/shplonk/README.md).
3. **KZG**: produces a single-point opening proof (a group element). See [`commitment_schemes/kzg/README.md`](../commitment_schemes/kzg/README.md).

In practice, Gemini and Shplonk are fused in **Shplemini** ([`commitment_schemes/shplonk/shplemini.hpp`](../commitment_schemes/shplonk/shplemini.hpp)) for efficiency.

## Proof Flow -- Verifier Side

The verifier entry point is `UltraVerifier_::verify_proof()` ([`ultra_verifier.cpp`](ultra_verifier.cpp)).

### 1. Oink Verification

The [`OinkVerifier`](oink_verifier.hpp) mirrors the prover: it receives commitments from the transcript, derives the same Fiat-Shamir challenges, and stores them for Sumcheck.

### 2. Sumcheck Verification

The verifier replays Sumcheck: in each round it reads the prover's round univariate (whose degree is fixed at compile time by the flavor), checks that `S^i(0) + S^i(1)` matches the running target, and derives the challenge. After the final round it receives the claimed polynomial evaluations at `u` and checks them against the full relation evaluation.

### 3. PCS Verification

**Shplemini** (the verifier-side fusion of Gemini + Shplonk) reconstructs the batched KZG opening claim from the transcript. For native verification this results in a pairing check; for recursive verification it outputs pairing points for deferred verification in the outer circuit.

For rollup circuits (with `RollupIO`), an additional IPA proof is verified.

## Public Inputs

Public inputs are values that both the prover and verifier know and that must be consistent with the witness. At the circuit builder level, calling `set_public_input(witness_index)` marks an existing witness variable as public. During circuit finalization, these values are collected into a dedicated `pub_inputs` trace block -- a contiguous range of rows in the first wire polynomial (`w_l`) at a known offset (`pub_inputs_offset`). Unlike other trace blocks, the public inputs block has no gate selector; instead, the values are enforced via the permutation argument.

During Oink, the prover sends the public input values through the transcript, and the verifier reads them back. These values are incorporated into the Fiat-Shamir challenge derivation, binding them to the proof. The verifier also uses them to compute the **public input delta** -- a correction factor for the permutation grand product that accounts for the modified copy constraints on the public input rows. Without this correction, the permutation argument would fail because the identity permutation is deliberately broken at public input positions to "expose" those wire values.

In the broader Aztec system, the public inputs also carry **special structured data** depending on the circuit's role. The `IO` template parameter on the verifier (`DefaultIO`, `RollupIO`, `HidingKernelIO`) determines what structured data is extracted from the public inputs after verification -- for example, pairing points for deferred verification, IPA claims for rollups, or kernel return data for the Hiding Kernel.

## Zero-Knowledge

ZK flavors (`UltraZKFlavor`, `UltraKeccakZKFlavor`, `MegaZKFlavor`) add several mechanisms so that every prover message (commitments, round univariates, polynomial evaluations, opening proofs) is statistically independent of the witness. These mechanisms form a chain: witness polynomial masking randomizes the committed data, row disabling prevents the masked rows from breaking relations, Libra masking randomizes Sumcheck round univariates, SmallSubgroupIPA proves the Libra evaluation without revealing it, and the Gemini masking polynomial randomizes the polynomial evaluations opened in the PCS stage.

### 1. Witness Polynomial Masking

Each witness polynomial (wires, lookup counts/tags/inverses, z_perm, databus columns) has its first `NUM_MASKED_ROWS = 3` entries (rows 1-3, after the zero row) overwritten with random field elements before commitment. This is done in-place during Oink via `batch.add_to_batch(..., /*mask?*/ Flavor::HasZK)` (which masks before batched commitment) or explicitly before `commitment_key.commit()` (for z_perm).

### 2. Row Disabling

The 3 masked rows plus the zero row (row 0, needed for shifted polynomials) cannot satisfy the circuit relations, since the witness values there are random. To prevent this from causing Sumcheck to fail, ZK flavors multiply the entire relation by a **row-disabling polynomial** that evaluates to zero on the first 4 rows of the boolean hypercube (rows 0-3). Like `pow_{β_gate}`, this polynomial has a simple closed form so the verifier can evaluate it efficiently without a commitment. This increases `BATCHED_RELATION_PARTIAL_LENGTH` by 1 compared to the non-ZK flavor.

### 3. Libra Masking (Sumcheck Round Univariates)

Without additional masking, the Sumcheck round univariates would still leak witness information (they are computed from the witness polynomials). The **Libra** technique adds a random masking polynomial:

$$G(X_0, \ldots, X_{d-1}) = c + \sum_{i=0}^{d-1} g_i(X_i)$$

where `c` is a random constant and each `g_i` is a random univariate of degree `BATCHED_RELATION_PARTIAL_LENGTH - 1`. The prover commits to a concatenation of the Libra univariates (encoded over a small multiplicative subgroup), sends the total sum of G over the hypercube, and receives a challenge `ρ`. The Sumcheck is then run on `F + ρ·G` instead of `F`. Because G has separable structure, each Sumcheck round univariate gets an additive correction derived from `g_i` and a running sum over the remaining Libra univariates. This makes each round message statistically independent of the witness.

See the ZK section of [`sumcheck/Sumcheck.md`](../sumcheck/Sumcheck.md).

### 4. SmallSubgroupIPA (Libra Evaluation Proof)

At the end of Sumcheck, the verifier needs to check that the Libra polynomial was evaluated correctly at the challenge point `u = (u_0, ..., u_{d-1})`. Because the Libra univariates are the prover's secret, their evaluations cannot be sent directly. Instead, the evaluation is reformulated as an inner product `⟨F, G⟩ = s` where G encodes the Libra coefficients and F encodes the challenge powers, then proved using the **SmallSubgroupIPA** protocol over a multiplicative subgroup of BN254's scalar field of size `SUBGROUP_SIZE = 256`. This size must satisfy `SUBGROUP_SIZE > CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH` (max number of Sumcheck rounds times the number of coefficients per round univariate) and divide the multiplicative group order.

SmallSubgroupIPA produces 3 additional commitments (the concatenated Libra polynomial, a grand-sum accumulator, and a quotient polynomial) and a set of opening claims that are batched into the Shplemini opening claim. See [`commitment_schemes/small_subgroup_ipa/README.md`](../commitment_schemes/small_subgroup_ipa/README.md) for the protocol details.

See [`commitment_schemes/small_subgroup_ipa/README.md`](../commitment_schemes/small_subgroup_ipa/README.md).

### 5. Gemini Masking Polynomial (PCS Evaluation Masking)

Even with all the above, the polynomial evaluations revealed during the PCS stage (Gemini fold commitments and evaluations sent to the verifier, then opened via Shplonk) would leak witness information, since they are linear combinations of the witness polynomials evaluated at the Gemini challenge.

To prevent this, a random polynomial `gemini_masking_poly` of size `N` is generated and committed during Oink. It is included in the set of polynomials batched by Gemini (via `polynomial_batcher.set_unshifted`), so the batched polynomial `A_0 = Σ ρ_gem^j · f_j` includes a `ρ_gem^k · gemini_masking_poly` term. Since this random polynomial is known only to the prover, its contribution makes every Gemini fold evaluation (`A_l(±r^{2^l})`) uniformly random from the verifier's perspective. The verifier holds the commitment to the masking polynomial and can account for it during Shplemini verification.

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

## Security Model

Honk's security relies on:

- **Knowledge soundness** of KZG under discrete log assumptions in BN254 (commonly targeting ~128-bit classical security)
- **Fiat-Shamir** in the random oracle model (Poseidon2 or Keccak)
- **Statistical zero-knowledge** from polynomial masking and Libra/Gemini masking, with distinguishing advantage negligible in `|𝔽|`
- **SmallSubgroupIPA** security requires that `SUBGROUP_SIZE` divides the multiplicative group order of BN254's scalar field and exceeds the total number of Libra coefficients

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
