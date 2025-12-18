# Gemini

Gemini is a protocol for opening several multilinear polynomials at the same point, reducing the problem to univariate polynomial openings.
This protocol is taken from the tensor product argument in section 5 of [BCHO22](https://eprint.iacr.org/2022/420.pdf).
Our implementation is based on an optimized variant of the protocol described in this [paper](https://eprint.iacr.org/2025/1793).

## Overview

Given:
- $ d $ = number of variables
- $ n = 2^d $
- $ u = (u_0, \ldots, u_{d-1}) $ = evaluation point (often from sumcheck)
- $ f_0, \ldots, f_{k-1} $ = multilinear polynomials
- $ g_0, \ldots, g_{h-1} $ = shifted multilinear polynomials

Gemini reduces these multilinear opening claims to a series of univariate claims.

## Protocol Description

### Batching

We use a challenge $ \rho $ to create a random linear combination:
- $ F = \sum_j \rho^j f_j $
- $ G = \sum_j \rho^{k+j} g_j $ , $k$ is the number of unshifted polynomials
- $ A_0 = F + G^{\leftarrow} $ (where $ G^{\leftarrow} $ is the shift of $ G $)

### Folding

The prover creates folded polynomials $ A_0, \ldots, A_{m-1} $:
- $ A_{i+1}(X) = (1 - u_i) \cdot \text{even}(A_i)(X) + u_i \cdot \text{odd}(A_i)(X) $

### Relation
To check that the $i+1^{th}$ fold polynomial is computed correctly, we use the following identities:
$A_i(X) = X \cdot \text{odd}(A_i)(X^2) + \text{even}(A_i)(X^2)$
Which means:
- $\text{even}(A_i)(X^2) = \frac{A_i(X) + A_i(-X)}{2}$
- $\text{odd}(A_i)(X^2) = \frac{A_i(X) - A_i(-X)}{2X}$

Replacing $\text{even},\text{odd}$ in the equation above we get:

$$A_{i+1}(X^2) = (1 - u_i) \cdot \frac{A_i(X) + A_i(-X)}{2} + u_i \cdot \frac{A_i(X) - A_i(-X)}{2r}$$

### Implementation:
- Instead of checking the identity given the evaluations $A_i(r), A_i(-r), A_{i+1}(r^2)$, we assume that the verifier is given $A_i(-r)$ and $A_{i+1}(r^2)$ and computes the positive evalution $A_i(r)$ from those values.
- Later, the correctness of is this evluation is checked against the commitment $[A_i]$ in Shplonk.

Hence, the verifier computes $A_{i}(r)$ using the following formula:

$$A_{i}(r) = \frac{2r \cdot A_{i+1}(r^{2}) - A_{i}(-r) \cdot (r(1-u_{i}) - u_{i})}{r(1-u_{i}) + u_{i}}$$

### Opening Points
To avoid needing to open the fold commitments on additional points, the verifier will get the openings at:
- $ A_0 $ at $ r $ and $ -r $
- $ A_j $ at $ r^{2^j} $ and $ -r^{2^j} $ for $ j = 1, \ldots, m-1 $

The verifier starts from $i=m-1$, iterating over $i$ in decreasing order, and computes the positive evaluation in each round, given the negative evaluation $A_{i}(-r^{2^i})$ and the positive evaluation of the previous fold $A_{i+1}(r^{2^{i+1}})$.

## Files

| File | Description |
|------|-------------|
| `gemini.hpp` | Main header with protocol documentation and verification methods |
| `gemini_impl.hpp` | Implementation details of the prover algorithm|
| `gemini.cpp` | mostly empty |

## Key Types

- `GeminiProver_<Curve>` - Prover implementation
- `GeminiVerifier_<Curve>` - Verifier implementation

## Usage

Gemini is typically used internally by Shplemini and not called directly since the correctness of the univariate commitment openings is not handled in the module itself.
