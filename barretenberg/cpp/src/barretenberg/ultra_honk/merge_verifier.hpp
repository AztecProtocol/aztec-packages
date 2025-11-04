// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Unified verifier class for the Goblin ECC op queue transcript merge protocol
 * @details Works for both native verification and recursive (in-circuit) verification
 * @tparam Curve The curve type (native curve::BN254 or stdlib bn254<Builder>)
 */
template <typename Curve> class MergeVerifier_ {
  public:
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using PCS = bb::KZG<Curve>;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    using Proof = std::vector<FF>; // Native: std::vector<bb::fr>, Recursive: stdlib::Proof<Builder>
    using Transcript = TranscriptFor_t<Curve>;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    using TableCommitments = std::array<Commitment, NUM_WIRES>; // Commitments to the subtables and the merged table

    /**
     * Commitments used by the verifier to run the verification algorithm. They contain:
     *  - `t_commitments`: the subtable commitments data, containing the commitments to t_j read from the transcript by
     *     the HN verifier with which the Merge verifier shares a transcript
     *  - `T_prev_commitments`: the commitments to the full op_queue table after the previous iteration of merge
     */
    struct InputCommitments {
        TableCommitments t_commitments;
        TableCommitments T_prev_commitments;
    };

    /**
     * @brief Result of merge verification
     * @details Contains pairing points for KZG verification, merged table commitments, and degree check status
     */
    struct VerificationResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments;
        bool degree_check_passed;
    };

    MergeSettings settings;
    std::shared_ptr<Transcript> transcript;

    explicit MergeVerifier_(const MergeSettings settings = MergeSettings::PREPEND,
                            std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>())
        : settings(settings)
        , transcript(std::move(transcript))
    {}

    /**
     * @brief Verify the merge proof
     * @tparam Transcript The transcript type (NativeTranscript or StdlibTranscript<Builder>)
     * @param proof The proof to verify (HonkProof for native, stdlib::Proof<Builder> for recursive)
     * @param input_commitments The input commitments for the merge
     * @param transcript Shared transcript for Fiat-Shamir
     * @return VerificationResult containing pairing points, merged commitments, and degree check status
     */
    [[nodiscard("Verification result should be checked")]] VerificationResult verify_proof(
        const Proof& proof, const InputCommitments& input_commitments);
};

// Type aliases for convenience
using MergeVerifier = MergeVerifier_<curve::BN254>;

namespace stdlib::recursion::goblin {
template <typename Builder> using MergeRecursiveVerifier = MergeVerifier_<bn254<Builder>>;
} // namespace stdlib::recursion::goblin

} // namespace bb
