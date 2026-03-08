# Batched Sumcheck and PCS for Hiding Kernel + Translator

## Motivation

In the current Chonk verifier, the hiding kernel (MegaZK) and translator proofs are verified with
**independent** sumchecks and independent Shplemini/KZG reductions. This means two sets of:
- Sumcheck round univariates in the proof transcript
- Shplemini Gemini fold commitments and evaluations
- KZG opening proofs → two pairing point sets

Batching the two sumchecks into one saves:
- **17 × 9 = 153 field elements** from the proof (17 = `CONST_TRANSLATOR_LOG_N`, 9 =
  `BATCHED_RELATION_PARTIAL_LENGTH`, which is the same for both MegaZK and TranslatorFlavor):
  the translator's dedicated sumcheck univariates disappear from the proof
- **One full Shplemini reduction**: instead of two separate Gemini fold sequences, one joint
  reduction over all polynomials from both circuits
- **In recursive mode**: significant gate-count savings because Gemini fold commitments require
  non-native EC scalar muls via the op queue

## Sizes

- `log_n_H = 16` — hiding kernel (MegaZK), current fixed circuit size
- `log_n_T = CONST_TRANSLATOR_LOG_N = 17` — translator
- `log_n = 17` — joint sumcheck length (translator is larger)
- `BATCHED_RELATION_PARTIAL_LENGTH = 9` for both flavors (no mismatch)

## Current Flow

```
Transcript (shared):
  [Hiding kernel pre-sumcheck]
    vk_hash, Oink (wire comms, beta/gamma, z_perm)
  → alpha_H = get_challenge("Sumcheck:alpha")
  → gate_challenge_i  (i = 0..15)
  → Libra:Sum, Libra:Challenge              // ZK masking
  → [16 sumcheck rounds, each a degree-8 univariate]
  → Shplemini_H → pairing_points_H

  [Translator pre-sumcheck]
    vk_hash, wire comms, beta/gamma, z_perm
  → alpha_T = get_challenge("Sumcheck:alpha")
  → gate_challenge_i  (i = 0..16)
  → Libra:Sum, Libra:Challenge              // ZK masking
  → [17 sumcheck rounds, each a degree-8 univariate]
  → Shplemini_T → pairing_points_T
```

## Proposed: Batched Sumcheck Flow

```
Transcript (shared):
  [Hiding kernel pre-sumcheck]
    vk_hash, Oink (wire comms, beta/gamma, z_perm)
  [Translator pre-sumcheck]
    vk_hash, wire comms, beta/gamma, z_perm

  → alpha = get_challenge("Sumcheck:alpha")         // single shared challenge
  → gate_challenge_i  (i = 0..16)                   // single shared pow_β, 17 rounds
  → Libra:Sum, Libra:Challenge                       // single ZK masking for joint univariate
  → [17 joint sumcheck rounds]
  → single Shplemini over {hiding polys ∪ translator polys} → one pairing point set
```

## Protocol Specification

Let:
- `K_H` = `MegaZKFlavor::NUM_SUBRELATIONS`
- `K_T` = `TranslatorFlavor::NUM_SUBRELATIONS`

### Treating the Hiding Kernel as a 2^17 Circuit

The hiding kernel has actual circuit size 2^16 but is treated as a 2^17 circuit for the joint
sumcheck by extending its `padding_indicator_array` from `[1]*16` to `[1]*16 + [0]`.

The existing `RowDisablingPolynomial` mechanism already handles this: the extra zero entry at
round 16 causes the row-disabling factor to zero out rows 2^16..2^17-1 in the sumcheck
computation. The prover simply runs one extra partial-evaluation step where the hiding kernel's
contribution is zero (all upper rows are disabled). The hiding kernel's ZK masking polynomials
live in rows near the bottom of the 2^16 domain and are unaffected by the extension.

The translator's `padding_indicator_array` remains `[1]*17` (no padding needed, it is a full
2^17 circuit).

### Shared Alpha

A single `alpha` is drawn after all pre-sumcheck commitments from **both** circuits.
Joint subrelation separators:

```
α^0, ..., α^{K_H-1},   α^{K_H}, ..., α^{K_H+K_T-1}
└─────────────────────┘ └────────────────────────────┘
     hiding kernel              translator
```

### Joint Sumcheck Rounds

Each round `k ∈ {0,...,16}` the prover sends one degree-8 univariate:

```
U_joint(x) = U_hiding(x) + α^{K_H} · U_translator(x)
```

where:
- `U_hiding(x)` — round-`k` univariate for the hiding kernel; zero for `k = 16` because all
  rows in the upper half are disabled by `padding_indicator_array[16] = 0`
- `U_translator(x)` — round-`k` univariate for the translator (normal for all 17 rounds)

The prover does **not** materialize a joint `ProverPolynomials` struct. It maintains two separate
`PartiallyEvaluatedMultivariates` tables (one per circuit) and runs two `SumcheckProverRound`
evaluations per round, adding the results with the `α^{K_H}` offset.

The verifier's target sum check per round:
```
U_joint(0) + U_joint(1) = running_target_sum
```
initialized to `libra_sum · libra_challenge` (single joint Libra correction).

### ZK / Libra Masking

There is a **single** Libra masking polynomial defined over the full 2^17 domain. It masks the
combined joint univariate `U_joint` across all 17 rounds. One `Libra:Sum` and `Libra:Challenge`
appear in the transcript, and a single Libra evaluation at the end of sumcheck is verified via
the joint Shplemini opening.

The joint Libra is simply a fresh Libra for a 17-round sumcheck — it blinds `U_joint^{(k)}` as
a whole at each round and has no special structure tied to individual circuits. The fact that the
hiding kernel contributes zero to round 16 is enforced by the row-disabling polynomial, not the
Libra. No constraints on the Libra's 17th masking slot are needed.

### Joint Shplemini / PCS

After sumcheck, both circuits' evaluation claims are batched into a single `ClaimBatcher` at the
joint sumcheck challenge point `u = (u_0,...,u_16)`:

```
unshifted: {hiding_unshifted_comms ∪ translator_unshifted_comms}
shifted:   {hiding_shifted_comms   ∪ translator_shifted_comms}
```

The translator's concatenated polynomial groups are appended to `combined_shifted_evals` as
today. A single `Shplemini::compute_batch_opening_claim` call produces one `opening_claim` →
one pairing point set.

The hiding kernel's polynomials are treated as 17-variable for PCS: their upper 2^16 rows are
zero by construction (row-disabling), so their evaluation at the full joint point
`u = (u_0,...,u_16)` equals their evaluation at `(u_0,...,u_15)`. Treating them uniformly as
17-variable avoids heterogeneous evaluation points in Shplemini. The `PolynomialBatcher` simply
zero-extends the hiding kernel's 2^16-size polynomials when forming the batched Gemini input; no
extra prover storage beyond 2^17 (already required for the translator) is needed.

## Proof Size Impact

Removed from the proof:
- 17 translator sumcheck univariates: **17 × 9 = 153 field elements**
- 1 extra translator pairing point set: **2 G1 points = 8 field elements**
- Translator Shplemini: 16 Gemini fold commitments + 17 Gemini fold evaluations:
  **16 × 4 + 17 = 81 field elements**

Added to the proof:
- 1 extra hiding kernel sumcheck univariate (round 16, which is all-zero for hiding kernel but
  still sent): **9 field elements** (though this round carries only translator content)

Net saving: **≈ 234 field elements**.

## Implementation Notes

1. **Hiding kernel prover**: extend its sumcheck from 16 to 17 rounds by passing
   `padding_indicator_array = [1]*16 + [0]` and running `SumcheckProver` with
   `multivariate_d = 17`. Round 16 produces an all-zero hiding kernel univariate.

2. **Translator prover**: unchanged internally; its univariates are combined with the hiding
   kernel's by the new batched driver.

3. **New batched prover driver**: runs both `SumcheckProverRound` instances each round,
   adds `α^{K_H}` × translator contribution to hiding kernel contribution, sends the joint
   univariate to transcript.

4. **New batched verifier driver**: interleaves pre-sumcheck phases of both circuits,
   draws single alpha and gate challenges, then drives a single 17-round sumcheck verification
   using the combined target sum check.

5. **Proof format change**: translator's 17 sumcheck univariates and its Shplemini data are
   removed; the joint univariates occupy 17 slots (hiding kernel's extended proof). Update
   `CHONK_PROOF_LENGTH` and the corresponding Noir constants.

6. **Transcript binding**: shared transcript ensures the joint alpha and gate challenges bind
   to all pre-sumcheck messages from both circuits (Fiat-Shamir soundness).
