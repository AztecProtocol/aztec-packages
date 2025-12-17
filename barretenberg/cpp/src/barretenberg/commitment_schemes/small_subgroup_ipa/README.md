# Small Subgroup IPA

A curve-agnostic zero-knowledge protocol for proving inner products of small vectors.

## Overview

SmallSubgroupIPA enables proving statements of the form $ \langle F, G \rangle = s$ where:
- $ G$ is a witness polynomial (prover's secret)
- $ F$ is a challenge polynomial (derived from public challenges)
- $ s$ is the claimed inner product

This protocol is used in two contexts:
1. **ZK-Sumcheck**: Proving correct evaluation of Libra masking polynomials
2. **ECCVM Translation**: Proving translation data consistency

## Motivation

In ZK-Sumcheck, the prover masks the multivariate polynomial by adding a Libra hiding polynomial:
$$\rho \cdot H(x_0,\dots,x_{d-1})$$

This polynomial has a **separable structure**:
$$H(x_0,\dots,x_{d-1}) = c + \sum_{i=0}^{d-1} H_i(x_i)$$

where $c$ is a constant and each $H_i$ is a univariate polynomial (the "Libra univariates").

### The Inner Product Formulation

To open $H$ at the sumcheck challenge point $(u_0,\dots,u_{d-1})$, we observe:
$$H(u_0,\dots,u_{d-1}) = c + \sum_{i=0}^{d-1} H_i(u_i) = \langle F, G \rangle$$

where:
- **$G$** = concatenation of $(c, H_0, H_1, \ldots, H_{d-1})$ in Lagrange basis over subgroup $H$
- **$F$** = challenge polynomial with coefficients $(1, 1, u_0, u_0^2, \ldots, 1, u_1, u_1^2, \ldots)$

The inner product $\langle F, G \rangle$ computes $c \cdot 1 + H_0(u_0) + H_1(u_1) + \cdots = H(u_0, \ldots, u_{d-1})$.

### Why This Approach?

Instead of:
1. Committing to $H$ as a multilinear polynomial (expensive: size $2^d$)
2. Opening $H$ at $(u_0, \ldots, u_{d-1})$ via Gemini/Shplemini

We:
1. Commit to the concatenated polynomial $G$ (small: size $\approx d \cdot L$ where $L$ = `LIBRA_UNIVARIATES_LENGTH`)
2. Prove $\langle F, G \rangle = s$ using SmallSubgroupIPA (leverages small multiplicative subgroup)

This is efficient because $|G| \leq |H|$ (the subgroup size), avoiding the exponential blowup.

## Protocol Description

### Witness Polynomial $G$

For ZK-Sumcheck, $G$ is the masked concatenated Libra polynomial:

$$G = (\text{libra\_constant}, g_{0,0}, \ldots, g_{0,L-1}, \ldots, g_{d-1,0}, \ldots, g_{d-1,L-1})$$

Masked by adding $(r_0 + r_1 X) \cdot Z_H(X)$ where $Z_H$ is the vanishing polynomial over subgroup $H$.

### Derived Witnesses

The prover computes:
- **Grand Sum Polynomial** $A(X)$: Cumulative sum encoding $\langle F, G \rangle$
- **Quotient Polynomial** $Q(X)$: Proves the grand sum identity holds

### Verification Equation

The verifier checks the algebraic identity:

$$L_1(r) A(r) + (r - g^{-1})(A(gr) - A(r) - F(r)G(r)) + L_{|H|}(r)(A(r) - s) = Q(r) \cdot Z_H(r)$$

Where:
- $r$ is the evaluation challenge (from Gemini)
- $g$ is the subgroup generator
- $L_1(X)$, $L_{|H|}(X)$ are the first and last Lagrange polynomials over $H$
- $Z_H(X) = X^{|H|} - 1$ is the vanishing polynomial
- $s$ is the claimed inner product $\langle F, G \rangle$

## Key Constants

| Constant | Description |
|----------|-------------|
| `SUBGROUP_SIZE` | Size of multiplicative subgroup $H$ (curve-dependent) |
| `LIBRA_UNIVARIATES_LENGTH` | Length of Libra masking univariates |

### Curve-Specific Values

| Curve | `SUBGROUP_SIZE` |
|-------|-----------------|
| BN254 | 16 |
| Grumpkin | 16 |

## Files

| File | Description |
|------|-------------|
| `small_subgroup_ipa.hpp` | Main prover and verifier classes |
| `small_subgroup_ipa.cpp` | Implementation |
| `small_subgroup_ipa_utils.hpp` | Helper functions |
| `small_subgroup_ipa.test.cpp` | Unit tests |

## Key Types

- `SmallSubgroupIPAProver<Flavor>` - Prover implementation
- `SmallSubgroupIPAVerifier<Curve>` - Verifier implementation

## Security Considerations

1. **Evaluation Challenge**: The evaluation point $r$ must not be in the subgroup $H$, as this would cause division by zero in the Lagrange polynomial computation. The verifier aborts if $Z_H(r) = 0$.

2. **Polynomial Sizes**: The protocol has tight constraints on polynomial sizes based on `SUBGROUP_SIZE` and `LIBRA_UNIVARIATES_LENGTH`.

## Usage

### Prover

```cpp
SmallSubgroupIPAProver<Flavor> prover(
    zk_sumcheck_data,
    multilinear_challenge,
    claimed_inner_product,
    transcript,
    commitment_key
);
prover.prove();
auto witness_polynomials = prover.get_witness_polynomials();
```

### Verifier

The verifier logic is integrated into `ShpleminiVerifier` when `HasZK=true`. It checks:
1. Algebraic identity holds at the evaluation point
2. Polynomial commitments open correctly

