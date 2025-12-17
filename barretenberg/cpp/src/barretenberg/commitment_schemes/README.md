# Polynomial Commitment Schemes (PCS)

This module implements the polynomial commitment schemes used in Honk and related proving systems.

## Overview

The PCS module provides cryptographic primitives for committing to polynomials and proving evaluations at specific points. These are fundamental building blocks for zero-knowledge proof systems.

## Components

| Directory | Description |
|-----------|-------------|
| [`gemini/`](./gemini/) | Multilinear-to-univariate reduction protocol |
| [`shplonk/`](./shplonk/) | Batched polynomial opening (Shplonk & Shplemini) |
| [`kzg/`](./kzg/) | Kate-Zaverucha-Goldberg commitment scheme |
| [`ipa/`](./ipa/) | Inner Product Argument commitment scheme |
| [`small_subgroup_ipa/`](./small_subgroup_ipa/) | Small vector inner product protocol for ZK |

## Architecture

The typical flow for polynomial opening in Honk is:

```
Multilinear Polynomials
        │
        ▼
    ┌────────┐
    │ Gemini │  Reduces multilinear claims to univariate claims
    └────────┘
        │
        ▼
   ┌──────────┐
   │ Shplemini │  Batches multiple univariate claims into one
   └──────────┘
        │
        ▼
   ┌──────────┐
   │ KZG/IPA  │  Final polynomial commitment verification
   └──────────┘
```

## Key Files

- `commitment_key.hpp` - Defines commitment keys (SRS/CRS)
- `verification_key.hpp` - Defines verification keys
- `claim.hpp` - Opening claim data structures
- `claim_batcher.hpp` - Batching utilities for claims

## Usage

See individual component READMEs for detailed usage information.



