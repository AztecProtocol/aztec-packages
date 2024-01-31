#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/proof_system/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::honk {

/**
 * @brief Verifier class for the Goblin ECC op queue transcript merge protocol
 *
 */
class MergeVerifier {
    using Curve = curve::BN254;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PCS = pcs::kzg::KZG<Curve>;
    using OpeningClaim = pcs::OpeningClaim<Curve>;
    using VerifierCommitmentKey = pcs::VerifierCommitmentKey<Curve>;
    using Transcript = BaseTranscript;

  public:
    std::shared_ptr<Transcript> transcript;

    explicit MergeVerifier();
    bool verify_proof(const honk::proof& proof);

  private:
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    static constexpr size_t NUM_WIRES = flavor::GoblinUltra::NUM_WIRES;
};

} // namespace bb::honk
