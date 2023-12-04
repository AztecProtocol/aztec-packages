#pragma once
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/goblin_ultra_recursive.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/flavor/ultra_recursive.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/recursion/honk/transcript/transcript.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {
template <typename Flavor> class MergeRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using PairingPoints = std::array<GroupElement, 2>;

    Builder* builder;

    explicit MergeRecursiveVerifier_(Builder* builder);
};

// Instance declarations for Ultra and Goblin-Ultra verifier circuits with both conventional Ultra and Goblin-Ultra
// arithmetization.
extern template class MergeRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive_<UltraCircuitBuilder>>;
extern template class MergeRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive_<GoblinUltraCircuitBuilder>>;
extern template class MergeRecursiveVerifier_<proof_system::honk::flavor::GoblinUltraRecursive_<UltraCircuitBuilder>>;
extern template class MergeRecursiveVerifier_<
    proof_system::honk::flavor::GoblinUltraRecursive_<GoblinUltraCircuitBuilder>>;

} // namespace proof_system::plonk::stdlib::recursion::honk
