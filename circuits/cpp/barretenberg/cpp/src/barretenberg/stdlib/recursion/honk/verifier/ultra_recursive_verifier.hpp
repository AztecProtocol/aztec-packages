#pragma once
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/flavor/ultra_recursive.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/recursion/honk/transcript/trancript.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {
template <typename Flavor> class UltraRecursiveVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCSVerificationKey = typename Flavor::PCSParams::VerificationKey;
    using Builder = typename Flavor::CircuitBuilder;

  public:
    explicit UltraRecursiveVerifier_(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    UltraRecursiveVerifier_(UltraRecursiveVerifier_&& other) noexcept;
    UltraRecursiveVerifier_(const UltraRecursiveVerifier_& other) = delete;
    UltraRecursiveVerifier_& operator=(const UltraRecursiveVerifier_& other) = delete;
    UltraRecursiveVerifier_& operator=(UltraRecursiveVerifier_&& other) noexcept;

    bool verify_proof(const plonk::proof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<PCSVerificationKey> pcs_verification_key;
    // Transcript<Builder> trancript;
    Builder* builder; // needed only for recursive verfifier (i.e. recursive flavors..)
};

extern template class UltraRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive>;

using UltraRecursiveVerifier = UltraRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive>;

} // namespace proof_system::plonk::stdlib::recursion::honk
