#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/ultra_honk/decider_verification_key.hpp"

namespace bb {
template <typename Flavor> class DeciderVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Transcript = typename Flavor::Transcript;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;
    using DeciderProof = std::vector<FF>;

  public:
    explicit DeciderVerifier_();
    /**
     * @brief Constructor from a verification key and a transcript assumed to be initialized with a full Honk proof
     * @details Used in the case where an external transcript already exists and has been initialized with a proof, e.g.
     * when the decider is being used in the context of the larger Honk protocol.
     *
     */
    explicit DeciderVerifier_(const std::shared_ptr<DeciderVerificationKey>& verification_key,
                              const std::shared_ptr<Transcript>& transcript);

    explicit DeciderVerifier_(const std::shared_ptr<DeciderVerificationKey>& verification_key);

    bool verify_proof(const DeciderProof&); // used when a decider proof is known explicitly
    bool verify();                          // used when transcript that has been initialized with a proof
    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<DeciderVerificationKey> accumulator;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    std::shared_ptr<Transcript> transcript;
};

using UltraDeciderVerifier = DeciderVerifier_<UltraFlavor>;
using MegaDeciderVerifier = DeciderVerifier_<MegaFlavor>;

} // namespace bb
