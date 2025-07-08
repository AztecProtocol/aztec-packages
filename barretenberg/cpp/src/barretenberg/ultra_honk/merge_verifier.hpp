// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
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
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using PCS = bb::KZG<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using Transcript = NativeTranscript;

  public:
    using Commitment = typename Curve::AffineElement;
    using OpeningVector = bb::OpeningVector<Curve>;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    // Number of claims verified by the Sphlonk verifier
    static constexpr size_t NUM_MERGE_CLAIMS = 3 * NUM_WIRES;
    // Number of commitments received by the MergeVerifier
    static constexpr size_t NUM_MERGE_COMMITMENTS = 3 * NUM_WIRES;
    // The positions of the commitments to the table polynomials in the array computed during proof verification
    static constexpr size_t T_CURRENT_IDX = 0;
    static constexpr size_t T_PREV_IDX = 1;
    static constexpr size_t T_IDX = 2;
    static constexpr size_t REVERSED_T_IDX = 3;

    std::shared_ptr<Transcript> transcript;
    std::array<Commitment, NUM_WIRES> T_commitments;

    explicit MergeVerifier(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());
    bool verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments);

    /**
     * @brief Receive commitments to the \f$t, T_prev, T, g(X) := X^{l-1} t(1/X)\f$
     *
     * @return std::array<std::array<Polynomial, NUM_WIRES>, 4> array of table polynomials
     */
    std::vector<Commitment> preamble_round(const RefArray<Commitment, NUM_WIRES>& t_commitments);

    /**
     * @brief Construct the opening claims to be passed to the Shplonk verifier and perfom degree check
     *
     * @details Construct the following opening claims for j = 1, 2, 3, 4:
     *            - p_j(X) := t_j(X) + kappa^{l-1} T_{prev, j}(X) - T_j(X), evaluated at kappa
     *            - g_j(X), evaluated at kappa
     *            - t_j(X), evaluated at 1/kappa
     *          and perform the degree check by enforcing for j = 1, 2, 3, 4 that: g_j(kappa) = kappa^{l-1} *
     * t_j(1/kappa)
     *
     * @param subtable_size
     * @param degree_identity_verified
     *
     * @return std::pair<std::vector<std::vector<size_t>>, std::vector<OpeningVector>>
     */
    std::pair<std::vector<std::vector<size_t>>, std::vector<OpeningVector>>
    construct_opening_claims_and_perform_degree_check(const uint32_t& subtable_size, bool& degree_identity_verified);
};

} // namespace bb
