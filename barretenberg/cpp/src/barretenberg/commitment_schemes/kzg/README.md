# KZG (Kate-Zaverucha-Goldberg)

KZG is a pairing-based polynomial commitment scheme that enables efficient polynomial evaluation proofs.

## Overview

KZG uses:
- A trusted setup (SRS) consisting of powers of a secret \( \tau \): \( [1], [\tau], [\tau^2], \ldots \)
- Bilinear pairings for verification

## Protocol

### Commitment

For a polynomial $ f(X) = \sum_{i=0}^{d-1} f_i X^i $:

$ [f] = \sum_{i=0}^{d-1} f_i [\tau^i] $

### Opening Proof

To prove $ f(r) = v $, the prover computes the quotient polynomial:

$ q(X) = \frac{f(X) - v}{X - r} $

And sends $ [q] $ (the KZG witness).

### Verification

The verifier checks the pairing equation:

$ e([f] - v \cdot [1], [1]_2) = e([q], [\tau - r]_2) $

This reduces to checking two pairing points $ P_0, P_1 $ satisfy:

$ e(P_0, [1]_2) = e(P_1, [\tau]_2) $

## Files

| File | Description |
|------|-------------|
| `kzg.hpp` | KZG prover and verifier implementation |
| `kzg.test.cpp` | Unit tests |

## Key Types

- `KZG<Curve>` - Main KZG class with static methods for:
  - `compute_opening_proof()` - Generate KZG witness
  - `reduce_verify()` - Compute pairing check points
  - `reduce_verify_batch_opening_claim()` - Batch verification

## Supported Curves

- BN254 (primary curve for Honk)

## Usage

```cpp
// Prover
KZG<curve::BN254>::compute_opening_proof(ck, opening_claim, transcript);

// Verifier
auto pairing_points = KZG<curve::BN254>::reduce_verify_batch_opening_claim(claim, transcript);
bool valid = vk.pairing_check(pairing_points[0], pairing_points[1]);
```

