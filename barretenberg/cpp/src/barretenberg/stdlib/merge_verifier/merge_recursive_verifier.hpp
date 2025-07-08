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
    using OpeningVector = ::bb::OpeningVector<Curve>;
    using BatchOpeningClaim = ::bb::BatchOpeningClaim<Curve>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<CircuitBuilder>>;
    using PairingPoints = stdlib::recursion::PairingPoints<CircuitBuilder>;

    CircuitBuilder* builder;
    std::shared_ptr<Transcript> transcript;

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

    std::array<Commitment, NUM_WIRES> T_commitments;

    explicit MergeRecursiveVerifier_(CircuitBuilder* builder,
                                     const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    [[nodiscard("Pairing points should be accumulated")]] PairingPoints verify_proof(
        const stdlib::Proof<CircuitBuilder>& proof, const RefArray<Commitment, NUM_WIRES> t_commitments);

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
     * @param kappa The evaluation challenge
     * @param kappa_inv 1/kappa
     *
     * @return std::pair<std::vector<std::vector<size_t>>, std::vector<OpeningVector>>
     */
    std::pair<std::vector<std::vector<size_t>>, std::vector<OpeningVector>>
    construct_opening_claims_and_perform_degree_check(const FF& subtable_size, const FF& kappa, const FF& kappa_inv);

    /**
     * @brief Execute the Shplonk verifier functionality
     *
     * @details Export the batch opening claim relative to the claims for p_j(X), g_j(X), t_j(X)
     *
     * @param table_commitments
     * @param indices
     * @param opening_vectors
     * @param kappa
     * @param kappa_inv
     *
     * @return BatchOpeningClaim
     */
    BatchOpeningClaim shplonk_verification(
        std::vector<Commitment>& table_commitments,
        const std::vector<std::vector<size_t>>& indices,
        const std::vector<MergeRecursiveVerifier_<CircuitBuilder>::OpeningVector>& opening_vectors,
        const FF& kappa,
        const FF& kappa_inv);
};

} // namespace bb::stdlib::recursion::goblin
