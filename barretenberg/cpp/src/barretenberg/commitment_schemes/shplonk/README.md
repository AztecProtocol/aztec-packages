# Shplonk & Shplemini

This directory contains Shplonk (batched polynomial opening) and Shplemini (combined Shplonk + Gemini).

## Shplonk

Shplonk reduces multiple polynomial opening claims (each at a single point) into a single claim for a single polynomial at a single point.

### Protocol

Given claims $ \{(f_j, x_j, v_j)\} $ where $ f_j(x_j) = v_j $:

1. **Prover** batches claims with challenge $ \nu $ and computes quotient polynomial:

   $$ Q(X) = \sum_j \nu^{j-1} \cdot \frac{f_j(X) - v_j}{X - x_j} $$

2. **Prover** sends commitment $ [Q] $ to verifier

3. **Verifier** receives evaluation challenge $ z $ and computes:

   $$ [G] = [Q] - \sum_{j=1}^m \frac{\nu^{j-1}}{z - x_j} [f_j] + \left(\sum_{j=1}^m \frac{\nu^{j-1} v_j}{z - x_j}\right) [1] $$

4. **Verifier** checks that $ G(z) = 0 $ using KZG or IPA

### Batched MSM Computation

The key optimization is that the verifier computes $ [G] $ as a **single MSM** over all commitments:

```
MSM(commitments, scalars) where:
  commitments = [[Q], [f_1], ..., [f_n], [1]]
  scalars     = [  1,  s_1,  ...,  s_n,  θ ]
```

Where:
- $ s_i = -\sum_{j: f_j \text{ uses } [f_i]} \frac{\nu^{j-1} \cdot a_j}{z - x_j} $ (scalar for commitment $ [f_i] $)
- $ \theta = \sum_j \frac{\nu^{j-1} \cdot v_j}{z - x_j} $ (scalar for identity $ [1] $)

**Key Methods in `ShplonkVerifier_`:**

| Method | Description |
|--------|-------------|
| `update()` | updates the internal state of the verifier given a linear combination and the inverse of the vanishing eval |
| `finalize()` | Executes the MSM and returns an `OpeningClaim` |
| `export_batch_opening_claim()` | Exports `BatchOpeningClaim` without executing MSM (allows combining with KZG's $ [W] $) |

**Usage Pattern:**
```cpp
// 1. Initialize verifier with commitments
ShplonkVerifier_<Curve> verifier(polynomial_commitments, transcript, num_claims);

// 2. Accumulate claims (updates scalars internally)
for (auto& claim : claims) {
    verifier.update(claim, inverse_vanishing_eval);
}

// 3a. Finalize with MSM execution
OpeningClaim<Curve> result = verifier.finalize(g1_identity);

// 3b. OR export for deferred MSM (e.g., to combine with KZG)
BatchOpeningClaim<Curve> batch_claim = verifier.export_batch_opening_claim(g1_identity);
```

### Handling Linear Combinations

When polynomials share commitments (e.g., $ p_2 = a \cdot p_1 $), Shplonk avoids redundant MSM entries by accumulating scalars:

Instead of computing:
$$ [Q] - \frac{1}{z - x_1}[p_1] - \frac{\nu}{z - x_2}[p_2] + \ldots $$

We compute:
$$ [Q] - \left(\frac{1}{z - x_1} + \frac{a\nu}{z - x_2}\right)[p_1] + \ldots $$

This is achieved via the `LinearCombinationOfClaims` structure which stores:
- `indices`: which base commitments are involved
- `scalars`: the coefficients in the linear combination
- `opening_pair`: the evaluation point and claimed value

## Shplemini

Shplemini combines Gemini and Shplonk into a single protocol, providing:
- Multilinear polynomial opening at a single point
- For zero-knowledge cases, the SmallSubgroupIPA related data is added to the final claim

### Verification Flow

The `ShpleminiVerifier::compute_batch_opening_claim()` method orchestrates the full verification:

```
1. Receive Gemini data from transcript
   ├─ Fold commitments [A₁], ..., [Aₘ₋₁]
   ├─ Evaluation challenge r
   └─ Negative evaluations A₀(-r), A₁(-r²), ..., Aₘ₋₁(-r^{2^{m-1}})

2. Receive Shplonk data from transcript
   ├─ Batching challenge ν
   ├─ Quotient commitment [Q]
   └─ Evaluation challenge z

3. Compute scalars for polynomial batches (via ClaimBatcher)
   ├─ Unshifted:    s₀ = (1/(z−r) + ν/(z+r))
   ├─ Shifted:      s₁ = r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
   └─ Interleaved:  special handling for Translator

4. Accumulate commitments and scalars
   ├─ Unshifted commitments with scalar: -ρⁱ ⋅ s₀
   ├─ Shifted commitments with scalar:   -ρⁱ ⋅ s₁
   └─ Fold commitments [Aⱼ] with scalar from Gemini

5. Compute positive fold evaluations A₀(r), A₁(r²), ... from Gemini relation

6. (Optional) Handle ZK data via SmallSubgroupIPA

7. Output BatchOpeningClaim for final KZG/IPA verification
```

### Challenges

| Symbol | Name | Source | Purpose |
|--------|------|--------|---------|
| $ \rho $ | Gemini batching challenge | Transcript | Batches multilinear polynomials into $ A_0 $ |
| $ r $ | Gemini evaluation challenge | Transcript | Point where fold polynomials are opened (at $ \pm r^{2^i} $) |
| $ \nu $ | Shplonk batching challenge | Transcript | Batches univariate opening claims |
| $ z $ | Shplonk evaluation challenge | Transcript | Point where the batched quotient $ Q $ is evaluated |

### Handling Shifted Polynomials

When a polynomial $ g $ is the "shift" of another polynomial $ f $ (i.e., $ g(X) = f(X)/X $), Shplemini uses different scalars:

| Batch | Scalar Formula | Intuition |
|-------|----------------|-----------|
| Unshifted $ f $ | $ \frac{1}{z-r} + \frac{\nu}{z+r} $ | Direct batching at $ \pm r $ |
| Shifted $ g = f/X $ | $ \frac{1}{r}\left(\frac{1}{z-r} - \frac{\nu}{z+r}\right) $ | Accounts for $ 1/X $ factor |

The shifted scalar differs by a factor of $ r^{-1} $ and uses subtraction instead of addition, which comes from the Gemini relation for $ A_0 = F + G/X $.

### Handling Interleaved Polynomials (Translator)

For the Translator flavor, a group of polynomials $ P_0, P_1, \ldots, P_{s-1} $ (where $ s $ is the group size) are combined via **interleaving** rather than standard batching.

**note:**  Our implemententation only supports $s$ values that are powers of 2.

**Definitions:**
- $ P_+(X) = \sum_{i=0}^{s-1} r^i \cdot P_i(X) $ (partial evaluation with positive powers of $ r $)
- $ P_-(X) = \sum_{i=0}^{s-1} (-r)^i \cdot P_i(X) $ (partial evaluation with alternating sign powers)

The full Gemini identity $ A_0(r) $ and $ A_0(-r) $ include contributions from these interleaved polynomials:
- $ A_0(r) = A_{0+}(r) + P_+(r^s) $
- $ A_0(-r) = A_{0-}(-r) + P_-((-r)^s) $

**Prover sends:** The evaluations $ P_+(r^s) $ and $ P_-((-r)^s) $ via transcript labels `"Gemini:P_pos"` and `"Gemini:P_neg"`, where $s$ is the grouping size.

**Scalar contribution:** These evaluations contribute to the constant term accumulator in Shplonk:

$$\theta_{\text{interleaved}} = \frac{1}{z - r^s} \cdot \left( \nu^{2d} \cdot P_+(r^s) + \nu^{2d+1} \cdot P_-((-r)^s) \right)$$

where $ d = \text{virtual\_log\_n} $ and the interleaved claims use batching powers $ \nu^{2d} $ and $ \nu^{2d+1} $ (placed after all Gemini fold claims in the batching order)

### Key Features

- **Batch Opening**: Combines multiple polynomial commitments into one claim
- **ZK Support**: When `HasZK=true`, handles Libra masking polynomials
- **Padding Support**: Supports circuits smaller than the maximum size via `padding_indicator_array`
- **Repeated Commitment Optimization**: Combines scalars for duplicate commitments

### Output Structure

```cpp
template <typename Curve, bool HasZK>
struct ShpleminiVerifierOutput_ {
    BatchOpeningClaim<Curve> batch_opening_claim;
    // Only present when HasZK=true:
    bool consistency_checked;  // Libra consistency verification result
};
```

## Files

| File | Description |
|------|-------------|
| `shplonk.hpp` | Shplonk prover implementation |
| `shplonk.test.cpp` | Shplonk unit tests |
| `shplemini.hpp` | Shplemini prover and verifier |
| `shplemini.test.cpp` | Shplemini unit tests |

## Key Types

- `ShplonkProver_<Curve>` - Shplonk prover
- `ShpleminiProver_<Curve>` - Combined Gemini + Shplonk prover
- `ShpleminiVerifier_<Curve, HasZK>` - Verifier (templated on ZK flag)
- `ShpleminiVerifierOutput_<Curve, HasZK>` - Verifier output

## Usage

### Prover

```cpp
auto opening_claim = ShpleminiProver::prove(
    circuit_size,
    polynomial_batcher,
    multilinear_challenge,
    commitment_key,
    transcript,
    libra_polynomials  // For ZK flavors
);
```

### Verifier

```cpp
auto [batch_opening_claim, consistency_checked /* only for ZK flavors*/ ] =
    ShpleminiVerifier::compute_batch_opening_claim(
        padding_indicator_array,
        claim_batcher,
        multilinear_challenge,
        g1_identity,
        transcript,
        repeated_commitments,
        libra_commitments,      // For ZK flavors
        libra_evaluation,        // For ZK flavors
        sumcheck_round_commitments, // ECCVM commited sumcheck
        sumcheck_round_evaluations // ECCVM commited sumcheck
    );
```


