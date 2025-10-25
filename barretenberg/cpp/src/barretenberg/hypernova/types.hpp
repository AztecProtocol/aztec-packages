// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/recursive_verifier_instance.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

class HypernovaNativeTypes {
  public:
    using VerifierInstance = VerifierInstance_<MegaFlavor>;
    using Proof = HonkProof;
    using MultilinearBatchingVerifier = bb::MultilinearBatchingVerifier<MultilinearBatchingFlavor>;
    using PairingPoints = bb::PairingPoints;
};

class HypernovaRecursiveTypes {
  public:
    using VerifierInstance =
        stdlib::recursion::honk::RecursiveVerifierInstance_<MegaRecursiveFlavor_<MegaCircuitBuilder>>;
    using Proof = stdlib::Proof<MegaCircuitBuilder>;
    using MultilinearBatchingVerifier = bb::MultilinearBatchingVerifier<MultilinearBatchingRecursiveFlavor>;
    using PairingPoints = stdlib::recursion::PairingPoints<MegaCircuitBuilder>;
};
} // namespace bb
