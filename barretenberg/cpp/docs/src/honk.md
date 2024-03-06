# Honk

Honk is a sumcheck-based SNARK protocol which is similar to HyperPlonk [HyperPlonk]. A theory paper, based on the thesis [H], is forthcoming. This spec described what is currently implemented in Barretenberg.

The variants of Honk that we build will be heavily optimized. As a warm-up, we describe a basic, unoptimized version of the protocol [here](honk-outline.md).

# Preliminaries

# Flavors

# Prover's algorithm
This is outlined in `proof_system::honk::UltraProver::construct_proof()`:
 \snippet cpp/src/barretenberg/ultra_honk/ultra_prover.cpp ConstructProof

## Sumcheck

# Verifier's algorithm