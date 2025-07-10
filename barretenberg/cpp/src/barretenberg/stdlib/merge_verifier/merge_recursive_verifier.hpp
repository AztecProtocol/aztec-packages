// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"

namespace bb::stdlib::recursion::goblin {
template <typename CircuitBuilder> class MergeRecursiveVerifier_ {
  public:
    using Curve = bn254<CircuitBuilder>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using GroupElement = typename Curve::Element;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using KZG = ::bb::KZG<Curve>;
    using BatchOpeningClaim = ::bb::BatchOpeningClaim<Curve>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
    using PairingPoints = stdlib::recursion::PairingPoints<CircuitBuilder>;
    using Claims = typename ShplonkVerifier::LinearCombinationOfClaims;

    CircuitBuilder* builder;
    std::shared_ptr<Transcript> transcript;

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

    std::array<Commitment, NUM_WIRES> T_commitments;

    explicit MergeRecursiveVerifier_(CircuitBuilder* builder,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    [[nodiscard("Pairing points should be accumulated")]] PairingPoints verify_proof(
        const stdlib::Proof<CircuitBuilder>& proof, const RefArray<Commitment, NUM_WIRES> t_commitments);

  private:
    /**
     * @brief Receive commitments to \f$t, T_prev, T, g(X) := X^{l-1} t(1/X)\f$
     *
     * @return std::vector<Commitment>
     */
    std::vector<Commitment> preamble_round(const RefArray<Commitment, NUM_WIRES>& t_commitments);

    /**
     * @brief Construct the opening claims to be passed to the Shplonk verifier
     *
     * @details Construct the following opening claims for j = 1, 2, 3, 4:
     *  - t_j(X), evaluated at 1/kappa
     *  - p_j(X) := t_j(X) + kappa^{l-1} T_{prev, j}(X) - T_j(X), evaluated at kappa
     *  - g_j(X), evaluated at kappa
     *
     * @param kappa
     * @param kappa_inv
     * @param pow_kappa
     *
     * @return std::vector<ShplonkVerifier::LinearCombinationOfClaims>
     */
    std::vector<Claims> construct_opening_claims(const FF& kappa, const FF& kappa_inv, const FF& pow_kappa);

    /**
     * @brief Execute the degree check
     *
     * @details For each j = 1, 2, 3, 4, check that \f$g_j(\kappa) = \kappa^{l-1} * t_j(\frac{1}{\kappa})\f$
     *
     * @param opening_claims
     * @param pow_kappa_minus_one
     */
    static void degree_check(const std::vector<Claims>& opening_claims, const FF& pow_kappa_minus_one);

    /**
     * @brief Verify the opening claims received from the Prover
     *
     * @param table_commitments The commitments to the tables received from the Prover
     * @param opening_claims The opening claims to be verified
     * @param kappa
     * @param kappa_inv
     *
     */
    PairingPoints verify_claims(std::vector<Commitment>& table_commitments,
                                const std::vector<Claims>& opening_claims,
                                const FF& kappa,
                                const FF& kappa_inv);
};

} // namespace bb::stdlib::recursion::goblin
