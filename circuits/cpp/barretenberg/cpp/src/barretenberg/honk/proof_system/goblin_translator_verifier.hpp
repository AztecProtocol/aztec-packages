#pragma once
#include "barretenberg/honk/flavor/goblin_translator.hpp"
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

namespace proof_system::honk {
template <typename Flavor> class GoblinTranslatorVerifier_ {
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCSVerificationKey = typename Flavor::PCSParams::VerificationKey;

  public:
    explicit GoblinTranslatorVerifier_(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    GoblinTranslatorVerifier_(GoblinTranslatorVerifier_&& other) noexcept;
    GoblinTranslatorVerifier_(const GoblinTranslatorVerifier_& other) = delete;
    GoblinTranslatorVerifier_& operator=(const GoblinTranslatorVerifier_& other) = delete;
    GoblinTranslatorVerifier_& operator=(GoblinTranslatorVerifier_&& other) noexcept;
    ~GoblinTranslatorVerifier_() = default;

    bool verify_proof(const plonk::proof& proof);
    BF evaluation_input_x = BF::zero();
    BF batching_challenge_v = BF::zero();
    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<PCSVerificationKey> pcs_verification_key;
    VerifierTranscript<FF> transcript;
};

extern template class GoblinTranslatorVerifier_<honk::flavor::GoblinTranslatorBasic>;

using GoblinTranslatorVerifier = GoblinTranslatorVerifier_<honk::flavor::GoblinTranslatorBasic>;

} // namespace proof_system::honk
