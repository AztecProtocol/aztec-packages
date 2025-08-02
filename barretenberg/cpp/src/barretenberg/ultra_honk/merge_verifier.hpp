// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Verifier class for the Goblin ECC op queue transcript merge protocol
 *
 */
class MergeVerifier {
    using Curve = curve::BN254;
    using FF = typename Curve::ScalarField;
    using PCS = bb::KZG<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using Transcript = NativeTranscript;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

  public:
    using Commitment = typename Curve::AffineElement;
    using TableCommitments = std::array<Commitment, NUM_WIRES>; // Commitments to the subtables and the merged table

    /**
     * Commitments used by the verifier to run the verification algorithm. They contain:
     *  - `t_commitments`: the subtable commitments data, containing the commitments to t_j read from the transcript by
     *     the PG verifier with which the Merge verifier shares a transcript
     *  - `T_prev_commitments`: the commitments to the full op_queue table after the previous iteration of merge
     */
    struct InputCommitments {
        TableCommitments t_commitments;
        TableCommitments T_prev_commitments;
    };

    std::shared_ptr<Transcript> transcript;
    MergeSettings settings;

    explicit MergeVerifier(const MergeSettings settings = MergeSettings::PREPEND,
                           const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());
    std::pair<bool, TableCommitments> verify_proof(const HonkProof& proof, const InputCommitments& input_commitments);
};

} // namespace bb
