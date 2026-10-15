# Batched Honk and Translator Proofs

## Role in Chonk

This component produces the last segment of a Chonk proof; see the [Chonk README](../README.md#proof-structure) for the full proof and verifier order.

`BatchedHonkTranslator` implements the MegaZK Oink, the Translator Oink, and the joint sumcheck + PCS. Both circuits operate over BN254 scalars, allowing their **sumcheck protocols and polynomial openings to be batched into a single reduction**. This avoids running two independent Honk proofs and reduces proof size.

The verifier exposes a **two-phase API** so that the `ChonkVerifier` can run merge and ECCVM verification in between:

```
Phase 1: verify_mega_zk_oink()  →  OinkResult (public inputs, calldata, ecc_op_wires)
            ↓  caller runs merge + ECCVM  ↓
Phase 2: verify(joint_proof, translator_params...)  →  ReductionResult (pairing points)
```

---

## Protocol Overview

### Phase 1 — MegaZK Oink

`OinkProver<MegaZKFlavor>` runs the pre-sumcheck phase (wire commitments, permutation grand products, relation parameters). `prove_mega_zk_oink()` returns this segment, which is stored as `ChonkProof::hiding_oink_proof`.

The verifier's `verify_mega_zk_oink()` returns an `OinkResult` containing:
- Public inputs (the `HidingKernelIO`)
- Calldata commitment (for the databus consistency check)
- ECC op wire commitments (for merge verification)

### Interlude — Merge + ECCVM

`Chonk`/`ChonkVerifier` use the MegaZK Oink outputs to run merge verification and ECCVM verification on the same shared transcript. The ECCVM produces the translator's input parameters (`evaluation_challenge_x`, `batching_challenge_v`, `accumulated_result`).

### Phase 2a — Translator Oink

`BatchedHonkTranslatorProver::execute_translator_oink()` runs the translator's pre-sumcheck phase on the shared transcript through `TranslatorProver::execute_preamble_round`, `execute_wire_and_sorted_constraints_commitments_round` and `execute_grand_product_computation_round`. This phase starts the segment that `prove(translator_key)` returns.

### Phase 2b — Joint Sumcheck

A joint alpha `α` is drawn after all pre-sumcheck commitments. The joint round univariate is:

```
U_joint(x) = U_MegaZK(x) + α^{K_H} · U_translator(x) + L(x)
```

where `L(x)` is the joint Libra masking univariate. The offset `α^{K_H}` (with `K_H = MegaZKFlavor::NUM_SUBRELATIONS`) ensures the translator relations use powers of `α` that do not collide with the powers already used to combine the MegaZK subrelations.

The sumcheck runs for `JOINT_LOG_N = 17` rounds (the translator's fixed circuit size). The MegaZK circuit has `mega_zk_log_n ≤ 17` variables, so:

- **Real rounds** (`0 .. mega_zk_log_n - 1`): Both circuits contribute normally. MegaZK uses row-disabling for ZK, with main-domain relations scaled by `(1 - L)` and the `MegaEccOpBoundaryRelation` (offset-only, enforcing `ecc_op_wire_j = 0` on rows 0..3) scaled by `L`. After the last real round, MegaZK evaluations are sent *before* virtual-round challenges are drawn, eliminating prover freedom in the zero-padded region.

- **Virtual rounds** (`mega_zk_log_n .. 16`): The smaller MegaZK circuit is embedded into the translator's larger sumcheck domain via **extension-by-zero (EBZ)**: its contribution uses `compute_virtual_contribution`, and the verifier applies `τ = ∏_{k≥d}(1 - u_k)`, with `d = mega_zk_log_n`, to the MegaZK evaluations, which is the EBZ factor for the zero-padded region.

### Phase 2c — Joint PCS

All polynomials from both circuits are combined into a single `ClaimBatcher`. `ShpleminiProver_<BN254>::prove()` reduces all openings at the joint challenge to a single KZG claim, with a `SmallSubgroupIPA` proof for the joint Libra polynomial. This proves that all claimed evaluations used in the joint sumcheck correspond to openings of the committed polynomials.

The verifier's `verify()` returns `{ pairing_points, reduction_succeeded }`.

---

## Repeated Commitments Optimization

The joint PCS passes a `REPEATED_COMMITMENTS` to Shplemini that identifies commitments appearing in both the unshifted and shifted batches, avoiding redundant scalar multiplications in the final MSM. The joint layout (after Shplemini's offset for Q and the gemini masking poly) is:

```
Unshifted: [MegaZK_precomputed | MegaZK_witness | Trans_PCS_unshifted]
Shifted:   [MegaZK_shifted     | Trans_PCS_shifted]
```

Two ranges are identified:
- **Range 1 (MegaZK):** The first `NUM_SHIFTED_ENTITIES` witness commitments in the unshifted section duplicate the MegaZK shifted commitments.
- **Range 2 (Translator):** 5 ordered range-constraint wires, the permutation accumulator (`z_perm`), and 5 concatenation wires (11 total) in the translator's unshifted section duplicate their counterparts in the shifted section. The translator's two standalone ranges (see [`TranslatorFlavor::REPEATED_COMMITMENTS`](../../translator_vm/translator_flavor.hpp)) are contiguous and merged into one.

---

## Proof Format

The prover returns two `HonkProof` segments:

- `prove_mega_zk_oink()` returns the MegaZK Oink, stored as `ChonkProof::hiding_oink_proof`.
- `prove(translator_key)` returns the Translator Oink, joint sumcheck and joint PCS, stored as `ChonkProof::joint_proof`.

The split allows the `ChonkVerifier` to interleave merge and ECCVM verification between the two segments on the shared transcript.

---

## Verifier

`BatchedHonkTranslatorVerifier_<Curve>` is templated on the curve type:

| Alias | Curve | Use |
|---|---|---|
| `BatchedHonkTranslatorVerifier` | `curve::BN254` | Native (used in `ChonkVerifier<false>`) |
| `BatchedHonkTranslatorRecursiveVerifier` | `stdlib::bn254<Builder>` | In-circuit (used in `ChonkVerifier<true>`) |

Public API:
1. `verify_mega_zk_oink(mega_zk_proof)` → `OinkResult`
2. `verify(joint_proof, eval_x, batch_v, accum_result, op_queue_comms)` → `ReductionResult`

Internally, `verify()` delegates to:
- `verify_translator_oink()` — translator pre-sumcheck via `TranslatorVerifier_::receive_pre_sumcheck()`
- `verify_joint_sumcheck()` — 17-round joint sumcheck with `FRV_joint = rdp · FRV_MegaZK + α^{K_H} · FRV_translator + libra_eval · libra_challenge`
- `verify_joint_pcs()` — joint Shplemini with `REPEATED_COMMITMENTS`, reduces to `PairingPoints`

---

## Files

| File | Description |
|---|---|
| `batched_honk_translator_prover.hpp/.cpp` | Prover |
| `batched_honk_translator_verifier.hpp/.cpp` | Verifier (native and recursive) |
| `batched_honk_translator.test.cpp` | Tests: `ProveAndVerify`, `ProveAndVerifySmallHiding`, `VerifierManifestConsistency`, `ProverManifestConsistency` |
