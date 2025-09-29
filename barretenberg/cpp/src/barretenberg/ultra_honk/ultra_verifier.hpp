// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {
template <typename Flavor> class UltraVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using PublicInputs = std::vector<FF>;
    using Proof = typename Transcript::Proof;

  public:
    struct UltraVerifierOutput {
      public:
        bool result;
        std::array<Commitment, Flavor::NUM_WIRES> ecc_op_tables;

        UltraVerifierOutput() = default;

        explicit operator bool() const { return result; }
    };

    explicit UltraVerifier_(
        const std::shared_ptr<VerificationKey>& vk,
        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key = VerifierCommitmentKey<curve::Grumpkin>(),
        const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : verifier_instance(std::make_shared<VerifierInstance>(vk))
        , ipa_verification_key(std::move(ipa_verification_key))
        , transcript(transcript)
    {}

    template <class IO> UltraVerifierOutput verify_proof(const Proof& proof, const Proof& ipa_proof = {});

    std::shared_ptr<Transcript> ipa_transcript = std::make_shared<Transcript>();
    std::shared_ptr<VerifierInstance> verifier_instance;
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key;
    std::shared_ptr<Transcript> transcript;
};

using UltraVerifier = UltraVerifier_<UltraFlavor>;
using UltraRollupVerifier = UltraVerifier_<UltraRollupFlavor>;
using UltraKeccakVerifier = UltraVerifier_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
using UltraStarknetVerifier = UltraVerifier_<UltraStarknetFlavor>;
#endif
using MegaVerifier = UltraVerifier_<MegaFlavor>;
using MegaZKVerifier = UltraVerifier_<MegaZKFlavor>;

} // namespace bb
