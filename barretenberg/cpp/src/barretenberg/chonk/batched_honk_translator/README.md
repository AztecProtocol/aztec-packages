# Batched Honk Translator

## Purpose

`BatchedHonkTranslator` proves the **MegaZK circuit** and the **translator circuit** (TranslatorVM) jointly — using a single sumcheck and a single Shplemini/KZG polynomial commitment scheme — rather than running two independent protocols.

Both circuits operate over BN254 scalars, so their polynomial openings can be batched into one pairing check. The joint sumcheck additionally binds the two circuits to a shared Fiat-Shamir transcript, strengthening the soundness argument.

In the Chonk proof system this component is the final step after IVC folding: the MegaZK circuit verifies the folding decider and masks the op-queue, while the translator proves the consistency of the ECC op-queue with the ECCVM transcript.

---

## Protocol Overview

The protocol has three phases:

### Phase 1 — Oink (pre-sumcheck)

Both circuits commit their witnesses to the shared transcript independently:

1. **MegaZK** — `OinkProver<MegaZKFlavor>` runs its full pre-sumcheck phase (wire commitments, permutation grand products, relation parameters). Its proof segment is exported as `mega_zk_proof`.
2. **Translator** — `TranslatorProver::execute_{preamble,wire,grand_product}_round()` runs the equivalent pre-sumcheck phase. Relation parameters are captured for use in the joint sumcheck.

The two sub-proofs are separated at the transcript level so the verifier can check them independently: `mega_zk_proof` covers Oink only; `joint_proof` covers the translator Oink, the joint sumcheck, and the joint PCS.

### Phase 2 — Joint Sumcheck

After all pre-sumcheck messages from both circuits are committed, a joint alpha `α` is drawn. The joint round univariate is:

```
U_joint(x) = U_MZK(x) + α^{K_H} · U_translator(x) + L(x)
```

where:
- `K_H = MegaZKFlavor::NUM_SUBRELATIONS` — translator subrelations start at power `α^{K_H}`, immediately after MegaZK's subrelations.
- `L(x)` — joint Libra masking univariate (single masking polynomial covering all 17 rounds).

The sumcheck runs for `JOINT_LOG_N = 17` rounds (the translator's circuit size). The MegaZK circuit has `mega_zk_log_n ≤ 17` variables.

#### Real rounds (`0 .. mega_zk_log_n - 1`)

Both circuits contribute normally. The MegaZK contribution uses `compute_univariate` minus `compute_disabled_contribution` (row-disabling polynomial, RDP) for ZK. After each round, partial evaluations are accumulated in-place.

After the last real round, the MegaZK circuit's claimed evaluations `P_j(u_0, …, u_{d-1})` are sent to the verifier **before** the virtual-round challenges are drawn. This eliminates any prover freedom in the zero-padded region: the verifier applies the tau factor `τ = ∏_{k=d}^{N-1}(1 - u_k)` itself after drawing the virtual-round challenges.

#### Virtual rounds (`mega_zk_log_n .. JOINT_LOG_N - 1`)

The MegaZK circuit is treated as zero-padded to `2^JOINT_LOG_N`. Its contribution is computed via `compute_virtual_contribution`, evaluating the relation at the single non-zero edge, scaled by the RDP scalar `rdp_scalar = 1 - u_2 · … · u_{d-1}` accumulated during the real rounds.

After each virtual round, the partially-evaluated MegaZK polynomial values are multiplied by `(1 - u_k)` so that the final poly[0] entries carry the accumulated `τ` factor.

The translator contributes normally for all 17 rounds.

### Phase 3 — Joint PCS

All polynomials from both circuits are combined into a single `PolynomialBatcher` at `joint_circuit_size = 2^JOINT_LOG_N`. The translator's commitment key (sized to `2^17`) is used for all PCS work, since it covers the larger range.

`ShpleminiProver_<BN254>::prove()` reduces all unshifted and shifted polynomial openings at the joint challenge `(u_0, …, u_16)` to a single KZG opening claim. A `SmallSubgroupIPA` proof covers the joint Libra polynomial.

---

## Proof Format

```cpp
struct Proof {
    HonkProof mega_zk_proof;              // Oink (pre-sumcheck) for the MegaZK circuit
    HonkProof joint_proof; // Translator Oink + joint sumcheck + PCS
};
```

The two segments are produced by calling `transcript->export_proof()` after each phase. The verifier loads them onto the transcript in order: `mega_zk_proof` first (for the MegaZK Oink phase), then `joint_proof` (for everything else).

---

## Verifier

`BatchedHonkTranslatorVerifier_<Curve>` is templated on the curve type:

| Alias | Curve | Use |
|---|---|---|
| `BatchedHonkTranslatorVerifier` | `curve::BN254` | Native verification |
| `BatchedHonkTranslatorRecursiveVerifier` | `stdlib::bn254<UltraCircuitBuilder>` | In-circuit recursive verification |

The verifier mirrors the prover's structure exactly:
1. `verify_mega_zk_oink()` — runs `OinkVerifier<MegaZKFlavor>`, returns commitments.
2. `verify_translator_oink()` — runs `TranslatorVerifier_::receive_pre_sumcheck()`, returns commitments.
3. `verify_joint_sumcheck()` — processes 17 rounds, applies tau to MegaZK evals, computes the joint full-relation purported value `FRV_joint = rdp_MZK · FRV_MZK + α^{K_H} · FRV_translator + libra_eval · libra_challenge`, and performs the final sumcheck check.
4. `verify_joint_pcs()` — assembles the joint claim batcher from both circuits' commitments and evaluations, runs `ShpleminiVerifier_`, and reduces to a `PairingPoints` check.

`reduce_to_pairing_check()` runs all four steps and returns `{ pairing_points, reduction_succeeded }`.

---

## Files

| File | Description |
|---|---|
| `batched_honk_translator_prover.hpp/.cpp` | Prover |
| `batched_honk_translator_verifier.hpp/.cpp` | Verifier (native and recursive) |
| `batched_honk_translator.test.cpp` | Tests: `ProveAndVerify` (MegaZK at full size) and `ProveAndVerifySmallHiding` (MegaZK smaller than translator) |
