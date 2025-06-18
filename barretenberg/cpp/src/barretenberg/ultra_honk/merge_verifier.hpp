// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Verifier class for the Goblin ECC op queue transcript merge protocol
 *
 */
class MergeVerifier {
    using Curve = curve::BN254;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PCS = bb::KZG<Curve>;
    using OpeningClaim = bb::OpeningClaim<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using Transcript = NativeTranscript;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

  public:
    std::shared_ptr<Transcript> transcript;
    std::array<Commitment, NUM_WIRES> T_commitments;
    MergeSettings settings;

    bool verify_proof(const HonkProof& proof);
    explicit MergeVerifier(MergeSettings settings = MergeSettings::PREPEND,
                           const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());
};

} // namespace bb
