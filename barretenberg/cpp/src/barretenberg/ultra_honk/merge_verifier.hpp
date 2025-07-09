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

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    // Number of claims verified by the Sphlonk verifier
    static constexpr size_t NUM_MERGE_CLAIMS = 3 * NUM_WIRES;
    // Number of commitments received by the MergeVerifier
    static constexpr size_t NUM_MERGE_COMMITMENTS = 3 * NUM_WIRES;
    // The positions of the commitments to the table polynomials in the vector computed during proof verification
    static constexpr size_t t_IDX = 0;
    static constexpr size_t T_PREV_IDX = 1;
    static constexpr size_t T_IDX = 2;
    static constexpr size_t REVERSED_t_IDX = 3;

    std::shared_ptr<Transcript> transcript;
    std::array<Commitment, NUM_WIRES> T_commitments;

    explicit MergeVerifier(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());
    bool verify_proof(const HonkProof& proof, const RefArray<Commitment, NUM_WIRES>& t_commitments);

    /**
     * @brief Receive commitments to the \f$t, T_prev, T, g(X) := X^{l-1} t(1/X)\f$
     *
     * @return std::vector<typename MergeVerifier::Commitment> vector of table commitments
     */
    std::vector<typename MergeVerifier::Commitment> preamble_round(
        const RefArray<Commitment, NUM_WIRES>& t_commitments);

    /**
     * @brief Construct the opening claims to be passed to the Shplonk verifier
     *
     * @details Construct the following opening claims for j = 1, 2, 3, 4 using the :
     *            - p_j(X) := t_j(X) + kappa^{l-1} T_{prev, j}(X) - T_j(X), evaluated at kappa
     *            - g_j(X), evaluated at kappa
     *            - t_j(X), evaluated at 1/kappa
     *
     * @param kappa
     * @param kappa_inv
     * @param pow_kappa
     *
     * @return ShplonkVerifier::LinearCombinationOfClaims
     */
    std::vector<typename ShplonkVerifier::LinearCombinationOfClaims> construct_opening_claims(const FF& kappa,
                                                                                              const FF& kappa_inv,
                                                                                              const FF& pow_kappa);

    /**
     * @brief Execute the degree check
     *
     * @details For each j = 1, 2, 3, 4, check that \f$g_j(\kappa) = \kappa^{l-1} * t_j(\frac{1}{\kappa})\f$
     *
     * @param opening_claims
     * @param pow_kappa_minus_one
     * @return true
     * @return false
     */
    static bool degree_check(const std::vector<typename ShplonkVerifier::LinearCombinationOfClaims>& opening_claims,
                             const FF& pow_kappa_minus_one);

    /**
     * @brief Verify the opening claims received from the Prover
     *
     * @param table_commitments The commitments to the tables received from the Prover
     * @param opening_claims The opening claims to be verified
     *
     */
    bool verify_claims(std::vector<Commitment>& table_commitments,
                       const std::vector<typename ShplonkVerifier::LinearCombinationOfClaims>& opening_claims);
};

} // namespace bb
