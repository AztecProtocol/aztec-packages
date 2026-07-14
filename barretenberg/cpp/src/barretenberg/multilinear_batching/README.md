# Multilinear Batching

The **multilinear batching** prover and verifier reduce a group of multilinear evaluation
claims, each at its *own* point, to a single evaluation claim at a *common* point, in one
sumcheck. It is the batching primitive that powers HyperNova folding inside [Chonk](../chonk/README.md):
each Chonk kernel collects the sumcheck claims of the proofs it recursively verifies and folds them
into one accumulator with a single multilinear batching proof.

This document specifies the protocol, the relation it runs, the flavor that fixes its shape, and how
Chonk uses it. It is intended as a reference point for the Chonk documentation.

## Table of Contents

1. [The Problem](#the-problem)
2. [Notation](#notation)
3. [Claims](#claims)
4. [Protocol](#protocol)
5. [The Relation](#the-relation)
6. [The Flavor](#the-flavor)
7. [Costs and Proof Size](#costs-and-proof-size)
8. [Width Family and Dispatch](#width-family-and-dispatch)
9. [Use in Chonk](#use-in-chonk)
10. [Soundness Notes](#soundness-notes)
11. [Code Map](#code-map)

## The Problem

A HyperNova accumulator for a single circuit is, after the per-instance sumcheck and entity
batching, a pair of multilinear evaluation claims (see the *Batching Claims into Accumulator*
section of the [Chonk README](../chonk/README.md)):

$$
P(r) = v, \qquad P^{\text{sh}}(r) = v^{\text{sh}},
$$

i.e. a non-shifted polynomial $P$ and its shifted counterpart $P^{\text{sh}}$, both claimed at the
same point $r \in \mathbb{F}^{\log N}$ produced by that circuit's sumcheck. A Chonk kernel verifies
several proofs in a row — the accumulator carried in from the previous kernel, the previous kernel's
own proof, and up to `MAX_APPS_PER_KERNEL` app proofs — so it ends up holding **several such claims,
each at a different point** $r_i$.

To carry a single accumulator forward (and ultimately open a single commitment in the decider), the
kernel must reduce all of these claims to one claim at one point. Multilinear batching does this in a
single sumcheck of a fixed number of rounds, regardless of how many claims are batched.

Reducing claims at distinct points to a claim at a common point is the standard HyperNova folding
step [[1](#ref-hypernova)]. Here it batches an arbitrary group of up to `CHONK_MAX_CLAIMS_PER_KERNEL`
claims at once, run once per kernel.

## Notation

**Batching claim.** Given $N$ input claims, the protocol outputs one claim at a common point $r$:

$$
\big\{\, P_i(r_i) = v_i,\ \ P_i^{\text{sh}}(r_i) = v_i^{\text{sh}} \,\big\}_{i=0}^{N-1}
\ \longrightarrow\
P(r) = v,\ \ P^{\text{sh}}(r) = v^{\text{sh}},
\qquad
P = \sum_{i} \rho^i P_i,\ \ v = \sum_{i} \rho^i P_i(r).
$$

Soundness: the sumcheck and eq checks with a random $\gamma$ establish each input claim
$P_i(r_i) = v_i$; drawing $\rho$ after the evaluations are bound makes the single later opening of
$[P_{\text{new}}]$ at $r$ pin down each $P_i(r)$ individually.

| Symbol | Code identifier | Meaning | Bound / value |
|---|---|---|---|
| $N$ | `NUM_CLAIMS` | batching width (claims in the group) | $2 \le N \le$ `CHONK_MAX_CLAIMS_PER_KERNEL` $= 7$ |
| $P_i,\ P_i^{\text{sh}}$ | `non_shifted_polynomial`, `shifted_polynomial` | the $i$-th claim's polynomial pair | multilinear, $\le d$ variables |
| $v_i,\ v_i^{\text{sh}}$ | `non_shifted_evaluation`, `shifted_evaluation` | claimed values $P_i(r_i)$, $P_i^{\text{sh}}(r_i)$ | |
| $r_i$ | `challenge` | the $i$-th claim's evaluation point | $\in \mathbb{F}^{\le d}$ |
| $\text{eq}_i$ | `eq(i)` column | $\text{eq}(X, r_i)$, the multilinear selector for $r_i$ | |
| $\gamma$ | `claim_batching_challenge` | separates the input claims | drawn before sumcheck |
| $\alpha$ | `Sumcheck:alpha` | sumcheck subrelation separator | |
| $r$ | `sumcheck_output.challenge` | output (common) point | $\in \mathbb{F}^{d}$ |
| $\rho$ | `claim_merge_challenge` | merges the per-claim outputs | drawn after sumcheck |
| $d$ | `VIRTUAL_LOG_N` | fixed sumcheck round count | `CONST_FOLDING_LOG_N` $= 24$ |

## Claims

A claim is the unit of batching. The prover holds the polynomials; the verifier holds only the
commitments and claimed values. Both are templated so the verifier works natively (over `curve::BN254`)
and recursively (over the stdlib `bn254` curve).

`MultilinearBatchingProverClaim` (`multilinear_batching_claims.hpp`):

```cpp
struct MultilinearBatchingProverClaim {
    std::vector<FF> challenge;         // evaluation point r
    FF non_shifted_evaluation;         // P(r)
    FF shifted_evaluation;             // P_shift(r)
    Polynomial non_shifted_polynomial; // P
    Polynomial shifted_polynomial;     // the shiftable polynomial (pre-shift form)
    Commitment non_shifted_commitment; // [P]
    Commitment shifted_commitment;     // [P_shift]
    size_t dyadic_size;
};
```

`MultilinearBatchingVerifierClaim<Curve>` holds the same data without the polynomials: `challenge`,
`non_shifted_evaluation`, `shifted_evaluation`, `non_shifted_commitment`, `shifted_commitment`. It
provides `stdlib_from_native` / `get_value` to move between native and in-circuit representations and
`hash_with_origin_tagging` to bind a claim into a transcript hash (used by Chonk to chain accumulator
hashes through kernel public inputs).

Note the *shifted* polynomial is stored in pre-shift form; `ProvingKey` materializes the shift with
`preshifted_polynomials[idx].shifted()`. A claim therefore contributes **two** polynomial evaluation
claims (non-shifted and shifted) that share the point $r$.

## Protocol

Fix a batching width `NUM_CLAIMS` $= N$. The input is $N$ claims
$\lbrace (r_i,  P_i,  P_i^{\text{sh}},  v_i,  v_i^{\text{sh}})\rbrace_{i=0}^{N-1}$. The prover and verifier
share a transcript whose state already commits to these claims (in Chonk, via the per-instance
sumchecks that produced them), so the claims themselves are **not** sent in the proof — only the
batching sumcheck is. Two challenges drive the protocol:

- **$\gamma$ — `claim_batching_challenge`**, drawn *before* the sumcheck. Its powers
  $(1, \gamma, \gamma^2, \ldots, \gamma^{N-1})$ enter the relation as public per-claim coefficients
  (`RelationParameters::compute_multilinear_batching_challenges`). $\gamma$ *separates* the input
  claims so that a single sumcheck proves all $N$ of them.
- **$\rho$ — `claim_merge_challenge`**, drawn *after* the sumcheck, once the claimed evaluations are
  bound to the transcript. Its powers *merge* the per-claim outputs into one accumulator.

### Transcript schedule

The proof carries only the batching sumcheck (round univariates and the claimed evaluations); the
input claims are not sent. Fiat–Shamir order, with literal label strings:

| # | Label | Action |
|---|---|---|
| precondition | — | the group's per-instance sumchecks are already absorbed in the shared transcript |
| 1 | `claim_batching_challenge` | draw $\gamma$ |
| 2 | `Sumcheck:alpha` | draw $\alpha$ |
| 3 | (standard `SumcheckProver` schedule) | send the $d$ round univariates, draw the round challenges $r$ |
| 4 | `claim_merge_challenge` | draw $\rho$ |

### Prover (`MultilinearBatchingProverInternal`)

1. Draw $\gamma$ from the transcript.
2. Build the proving key: for each claim store $P_i$, $P_i^{\text{sh}}$, and
   $\text{eq}_i := \text{eq}(X, r_i)$ as the witness columns, and record $r_i$ and the claimed values.
3. Run sumcheck (`execute_relation_check_rounds`) on the [batching relation](#the-relation) for a
   fixed `VIRTUAL_LOG_N` rounds. The sumcheck produces a new point $r$ (the sumcheck challenge) and the
   claimed evaluations $P_i(r)$, $P_i^{\text{sh}}(r)$, $\text{eq}_i(r)$.
4. Draw $\rho$.
5. Merge (`compute_new_claim`) using scalars $(1, \rho, \rho^2, \ldots, \rho^{N-1})$:

$$
P_{\text{new}} = \sum_{i=0}^{N-1} \rho^i P_i,
\qquad
[P_{\text{new}}] = \sum_{i=0}^{N-1} \rho^i [P_i],
\qquad
v_{\text{new}} = \sum_{i=0}^{N-1} \rho^i P_i(r),
$$

and identically for the shifted polynomials. The commitment merge is a single `batch_mul`. The result
is one `MultilinearBatchingProverClaim` at point $r$ — the new accumulator.

### Verifier (`MultilinearBatchingVerifierInternal::verify_proof`)

1. Draw $\gamma$; compute its powers.
2. Compute the sumcheck target from the *input* claims:

$$
\text{target} = \underbrace{\sum_{i} \gamma^i v_i}_{\text{non-shifted}} \;+\; \alpha \cdot \underbrace{\sum_{i} \gamma^i v_i^{\text{sh}}}_{\text{shifted}},
$$

   where $\alpha$ is the sumcheck's standard subrelation separator.
3. Verify the sumcheck against this target, obtaining the point $r$ and the claimed
   $P_i(r)$, $P_i^{\text{sh}}(r)$, $\text{eq}_i(r)$.
4. **eq-consistency check** (`check_eq_consistency`): for each $i$, assert the claimed
   $\text{eq}_i(r)$ equals $\text{eq}(r_i, r)$ recomputed from the in-memory claim point $r_i$. This is
   what binds the sumcheck's eq columns to the actual claim points (which never appear in the proof).
5. Draw $\rho$ and merge the input commitments and the claimed evaluations exactly as the prover does,
   producing the output `MultilinearBatchingVerifierClaim` at $r$.

Verification succeeds iff the sumcheck verifies *and* the eq-consistency check passes.

### Why $\gamma$ before, $\rho$ after

$\gamma$ must be fixed before the sumcheck because it is baked into the relation. $\rho$ is drawn only
*after* the sumcheck has bound every $P_i(r)$ to the transcript; merging with a post-binding $\rho$
ensures the single later opening of $[P_{\text{new}}]$ pins down each $P_i(r)$ individually rather
than only their $\gamma$-combination.

## The Relation

`MultilinearBatchingRelation` (`relations/multilinear_batching/multilinear_batching_relation.hpp`) has
two subrelations, both linearly *dependent* (there is no gate/`pow` polynomial — every row
participates):

```
SUBRELATION_PARTIAL_LENGTHS = { 3, 3 };           // non-shifted, shifted
SUBRELATION_LINEARLY_INDEPENDENT = { false, false };
```

With $\gamma^i$ = `multilinear_batching_challenges[i]` as public coefficients, the accumulation is

$$
\text{subrel}_0 \mathrel{+}= \sum_i \gamma^i \, P_i(x)\,\text{eq}_i(x),
\qquad
\text{subrel}_1 \mathrel{+}= \sum_i \gamma^i \, P_i^{\text{sh}}(x)\,\text{eq}_i(x).
$$

Because $\sum_x P_i(x) \text{eq}(x, r_i) = P_i(r_i)$ for a multilinear $P_i$, summing each subrelation
over the Boolean hypercube yields $\sum_i \gamma^i P_i(r_i)$ and $\sum_i \gamma^i P_i^{\text{sh}}(r_i)$,
which the sumcheck checks equal the target's two halves. The sumcheck verifier batches the two
subrelations with $\alpha$. The relation `skip`s a row only when, for every claim, the eq column is
zero or both value columns are zero.

## The Flavor

`MultilinearBatchingFlavor_<NumClaims>` (`flavor/multilinear_batching_flavor.hpp`) fixes the protocol
shape at compile time:

| Property | Value | Meaning |
|---|---|---|
| `NUM_CLAIMS` | `NumClaims` | batching width |
| `NUM_ALL_ENTITIES` | `3 * NUM_CLAIMS` | non-shifted, shifted, and eq column per claim |
| `VIRTUAL_LOG_N` | `CONST_FOLDING_LOG_N` (= 24) | fixed sumcheck round count |
| `USE_PADDING` | `true` | extension-by-zero to a fixed size |
| `HasZK` | `false` | the batching proof is not itself ZK |
| `Curve` | `curve::BN254` (native) / stdlib `bn254` (recursive) | |

**Fixed round count for fixed proof size.** Real witness columns of length $N < 2^{\texttt{VIRTUAL LOG N}}$
are extended by zero (multiplying by $\prod_{i=N+1}^{\texttt{VIRTUAL LOG N}}(1 - X_i)$), so sumcheck
always runs `VIRTUAL_LOG_N` rounds. This makes the proof size and the recursive verifier circuit
constant regardless of the actual claim sizes. The eq columns cannot be extended by zero — eq is
$\prod_i\big((1-X_i)(1-Y_i) + X_i Y_i\big)$ — so the flavor supplies
`extend_eq_polynomials_for_virtual_round`, which recomputes the eq value at the next edge from the
true claim point.

The recursive flavor `MultilinearBatchingRecursiveFlavor_<NumClaims>` mirrors the native one over the
stdlib curve, with a `StdlibTranscript` and stdlib codec.

## Costs and Proof Size

For a width-$N$ batch over $d = $ `VIRTUAL_LOG_N` rounds:

| | Prover | Verifier |
|---|---|---|
| Group ops | two size-$N$ `batch_mul`s ($[P_{\text{new}}]$ and $[P_{\text{new}}^{\text{sh}}]$) in `compute_new_claim` | the same two size-$N$ `batch_mul`s |
| Field / poly ops | one sumcheck over $3N$ columns for $d$ rounds; merge of $N$ polynomials | sumcheck verify ($d$ rounds), $N$ `eq` evaluations, $O(N)$ for the target sum and evaluation merge |
| Proof size | — | $d$ round univariates (length `BATCHED_RELATION_PARTIAL_LENGTH`) $+\ 3N$ claimed evaluations |

The proof contains **no polynomial commitments**: the verifier already holds the claim commitments in
memory and $[P_{\text{new}}]$ is computed, not sent. There is no PCS opening here — the merged
accumulator commitment is opened once, later, by the Chonk decider.

## Width Family and Dispatch

Each kernel batches a different number of claims, so a *family* of flavors is instantiated, one per
width in `[2, CHONK_MAX_CLAIMS_PER_KERNEL]`:

```cpp
static constexpr size_t MAX_APPS_PER_KERNEL = 5;
// carried accumulator + previous kernel proof + up to MAX_APPS_PER_KERNEL app proofs
static constexpr size_t CHONK_MAX_CLAIMS_PER_KERNEL = MAX_APPS_PER_KERNEL + 2;  // = 7
```

The public `MultilinearBatchingProver` / `MultilinearBatchingVerifier` take the claims at runtime and
dispatch the runtime count to the matching compile-time width via `constexpr_for<2,
CHONK_MAX_CLAIMS_PER_KERNEL + 1>`, so adding a width is automatic when the constant is bumped and an
unsupported count throws. A width of **1** needs no batching at all — a lone sumcheck claim is already
an accumulator — and is handled by the caller (Chonk) without invoking this module.

The internal prover/verifier (`*Internal`) are templated on the flavor and never called directly; the
public entrypoints route to them. `MultilinearBatchingNativeVerifier` and
`MultilinearBatchingRecursiveVerifier` are the two verifier aliases.

## Use in Chonk

Chonk delegates folding and batching to a **stateful** `HypernovaFoldingProver`. As each circuit is
verified, `HypernovaFoldingProver::accumulate_instance` runs its per-instance sumcheck and caches the
resulting claim (`Chonk::instance_to_accumulator` is a thin wrapper). Once per kernel — when the group
is complete — `HypernovaFoldingProver::finalize(previous_accumulator)` batches the group:

- the claims are the accumulator carried in from the previous kernel (absent for the init kernel)
  followed by each cached per-instance claim, so
  `num_claims = (previous_accumulator ? 1 : 0) + group_size`, with $1 \le$ `num_claims` $\le$ `CHONK_MAX_CLAIMS_PER_KERNEL`;
- the batching continues on the *group's accumulation transcript*, so $\gamma$ is bound by the group's
  instance sumchecks already absorbed there and the claims need not be re-hashed;
- a single-claim init kernel has nothing to batch, so `finalize` returns its lone claim directly;
- the single accumulator `finalize` returns is propagated to the next kernel.

The kernel's recursive verifier mirrors this with the verifier-side `accumulate_instance` / `finalize`
(driven by `Chonk::complete_kernel_circuit_logic`): it runs each proof's sumcheck in-circuit, caches
the claims, then `finalize` loads the batching proof onto the shared transcript and calls
`MultilinearBatchingRecursiveVerifier::verify_proof`. The decider is verified against the hiding
kernel's resulting accumulator.

### Worked example: per-kernel widths

| Kernel | Claims batched | $N$ |
|---|---|---|
| Init kernel | its app group (first app via OINK, the rest via HN); no carried accumulator | 1 to `MAX_APPS_PER_KERNEL` ($N = 1$ means no batching) |
| Inner kernel (max) | carried accumulator + previous kernel + 5 apps | 7 = `CHONK_MAX_CLAIMS_PER_KERNEL` |
| Reset kernel | carried accumulator + previous kernel (no apps) | 2 |
| Hiding kernel | carried accumulator + reset-tail kernel's `HN_FINAL` claim | 2 |

## Soundness Notes

- **Claim binding without sending claims.** The claims are not in the proof; they are bound by the
  shared transcript state from the group's instance sumchecks. $\gamma$ is derived from that state, so
  a prover cannot choose claims after seeing $\gamma$.
- **$\gamma$-separation.** Proving $\sum_i \gamma^i P_i(r_i) = \sum_i \gamma^i v_i$ for a transcript-
  derived $\gamma$ implies each $P_i(r_i) = v_i$ except with Schwartz–Zippel probability in $\gamma$.
- **eq-consistency.** The eq columns are witness data; the explicit check that $\text{eq}_i(r) =
  \text{eq}(r_i, r)$ ties them to the claim points, preventing a malicious prover from substituting
  different eq polynomials.
- **$\rho$-merge.** Drawing $\rho$ after the evaluations are bound means the eventual single opening of
  $[P_{\text{new}}]$ at $r$ binds each $P_i(r)$ individually.
- **Fixed rounds / padding.** Extension-by-zero keeps the sumcheck at `VIRTUAL_LOG_N` rounds; the eq
  extension correction is required for the eq columns because their virtual-round behavior is not
  zero-extension.
- **Not zero-knowledge, by design.** The flavor sets `HasZK = false`. The batching proof need not hide
  anything: it is an inner proof, and the accumulator it outputs is opened only later — inside the ZK
  HyperNova decider and the joint MegaZK + Translator proof — which provide the hiding. The per-instance
  sumchecks it batches are likewise inner proofs.

In debug builds, `MultilinearBatchingProverClaim::compare_with_verifier_claim` recomputes commitments
and MLE evaluations to cross-check the prover claim against the verifier claim, and Chonk maintains a
native verifier accumulator alongside the prover (`update_native_verifier_accumulator`).

## Code Map

| File | Contents |
|---|---|
| `multilinear_batching_claims.hpp` / `.cpp` | `MultilinearBatchingProverClaim`, `MultilinearBatchingVerifierClaim<Curve>`; debug claim comparison |
| `multilinear_batching_prover.hpp` / `.cpp` | `MultilinearBatchingProverInternal<Flavor>` (sumcheck + merge) and the public `MultilinearBatchingProver` (runtime→width dispatch) |
| `multilinear_batching_verifier.hpp` / `.cpp` | `MultilinearBatchingVerifierInternal<Flavor>` and the public `MultilinearBatchingVerifier<IsRecursive>` |
| `../flavor/multilinear_batching_flavor.hpp` | `MultilinearBatchingFlavor_<N>` / `MultilinearBatchingRecursiveFlavor_<N>`, `ProvingKey`, eq virtual-round extension |
| `../relations/multilinear_batching/multilinear_batching_relation.hpp` | the two-subrelation batching relation |
| `../relations/relation_parameters.hpp` | `compute_multilinear_batching_challenges` (powers of $\gamma$) |
| `multilinear_batching.test.cpp` | native + recursive tests across widths |

### References

1. <a name="ref-hypernova"></a>**HyperNova: Recursive arguments for customizable constraint systems** (Abhiram Kothapalli, Srinath Setty): [Paper](https://eprint.iacr.org/2023/573)
2. <a name="ref-hyperplonk"></a>**HyperPlonk: Plonk with Linear-Time Prover and High-Degree Custom Gates** (Binyi Chen, Benedikt Bünz, Dan Boneh, Zhenfei Zhang): [Paper](https://eprint.iacr.org/2022/1355)
