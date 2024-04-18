# Honk

Honk is a sumcheck-based SNARK protocol which is similar to HyperPlonk [HyperPlonk]. A theory paper, based on the thesis [H], is forthcoming. This spec described what is currently implemented in Barretenberg.

The variants of Honk that we build will be heavily optimized. As a warm-up, we describe a basic, unoptimized version of the protocol [here](honk-outline.md).

# Preliminaries

# Flavors

# Prover's algorithm
This is outlined in `proof_system::honk::UltraProver::construct_proof()`:
 \snippet cpp/src/barretenberg/ultra_honk/ultra_prover.cpp ConstructProof

## Sumcheck
Sumcheck protocol is a proof system allowing to efficiently prove claims about the sums of values of multilinear polynomials in \f$ d \f$ variables over the Boolean hypercube \f$ \{0,1\}^d \f$ as well as more elaborate relations between such polynomials. Our implementation of Sumcheck including is described [here](sumcheck-outline.md).
# Verifier's algorithm