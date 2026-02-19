// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Prover class for the Goblin ECC op queue transcript merge protocol
 *
 */
template <size_t BATCH_SIZE> class MergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using OpeningPair = bb::OpeningPair<Curve>;
    using Transcript = NativeTranscript;

  public:
    using MergeProof = std::vector<FF>;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static_assert(NUM_WIRES % BATCH_SIZE == 0, "Batch size must divide number of wires");
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;

    explicit MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                         std::shared_ptr<Transcript> transcript,
                         MergeSettings settings = MergeSettings::PREPEND);

    BB_PROFILE MergeProof construct_proof();

    MergeProof construct_de_interleaving_proof();

    // Public for test access (computing commitments)
    CommitmentKey pcs_commitment_key;

    struct PolynomialBatch {
        std::array<std::array<Polynomial, BATCH_SIZE>, NUM_COLUMNS> batches;

        PolynomialBatch(const std::array<Polynomial, NUM_WIRES>& polynomials)
        {
            for (size_t col = 0; col < NUM_COLUMNS; ++col) {
                for (size_t batch_idx = 0; batch_idx < BATCH_SIZE; ++batch_idx) {
                    batches[col][batch_idx] = polynomials[col * BATCH_SIZE + batch_idx];
                }
            }
        }

        std::array<Polynomial, BATCH_SIZE>& operator[](size_t idx) { return batches[idx]; }

        const std::array<Polynomial, BATCH_SIZE>& operator[](size_t idx) const { return batches[idx]; }

        size_t size() const { return NUM_COLUMNS; }
        auto begin() { return batches.begin(); }
        auto end() { return batches.end(); }
        auto begin() const { return batches.begin(); }
        auto end() const { return batches.end(); }
    };

    static constexpr size_t MERGE_PROOF_SIZE()
    {
        constexpr size_t NUM_COMM = NUM_COLUMNS + 1; // Merged + inverse
        constexpr size_t NUM_EVALS = 3 * NUM_COLUMNS + 1;
        constexpr size_t SHPLONK_COMM = 2; // Q and KZG opening
        size_t num_frs_comm = Transcript::Codec::calc_num_fields<Commitment>();

        return num_frs_comm * (NUM_COMM + SHPLONK_COMM) + NUM_EVALS + 1; // +1 for shift_size
    }

    std::vector<std::string> labels_degree_check()
    {
        std::vector<std::string> labels;
        labels.reserve(NUM_COLUMNS);

        for (size_t idx = 0; idx < NUM_COLUMNS; ++idx) {
            labels.emplace_back("LEFT_TABLE_DEGREE_CHECK_" + std::to_string(idx));
        }
        return labels;
    }

    std::vector<std::string> labels_shplonk_batching_challenges()
    {
        std::vector<std::string> labels;
        labels.reserve(3 * NUM_COLUMNS + 1);

        for (size_t idx = 0; idx < 3 * NUM_COLUMNS + 1; ++idx) {
            labels.emplace_back("SHPLONK_MERGE_BATCHING_CHALLENGE_" + std::to_string(idx));
        }
        return labels;
    }

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<ECCOpQueue> op_queue;
    MergeSettings settings;

    static Polynomial interleave_polynomials(const std::array<Polynomial, BATCH_SIZE>& polys);

    /**
     * @brief Compute the batched polynomial for the degree check.
     *
     * @details To show that \f$\deg(L_j) < k\f$, the prover batches the \f$L_i\f$'s as \f$\sum_i \alpha_i L_i\f$ and
     * computes \f$G(X) = (\sum_i \alpha_i L_i(X)) X^{k-1}\f$. The prover commits to \f$G\f$ and later opens \f$L_i\f$
     * at \f$\kappa\f$ and \f$G\f$ at \f$\kappa^{-1}\f$, so to show that \f$G(\kappa^{-1}) = (\sum_i \alpha_i
     * L_i(\kappa)) * \kappa^{-(k-1)}\f$.
     *
     * @param left_table
     * @param degree_check_challenges
     * @return Polynomial
     */
    static std::array<Polynomial, BATCH_SIZE> compute_degree_check_polynomial(
        const PolynomialBatch& left_columns, const std::vector<FF>& degree_check_challenges);

    /**
     * @brief Compute the batched Shplonk quotient polynomial.
     *
     * @details This function computes the polynomial \f$Q(X)\f$ such that \f$Q(X) * (X - \kappa) * (X - \kappa^{-1}) =
     * F(X)\f$, where \f$F(X)\f$ is defined as
     * \f[
     *  (X - \kappa^{-1}) * (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
     *       + (X - \kappa) * \beta_i (G - g)
     * \f]
     *
     */
    static Polynomial compute_shplonk_batched_quotient(
        const PolynomialBatch& left_columns,
        const PolynomialBatch& right_columns,
        const PolynomialBatch& merged_columns,
        const std::vector<FF>& shplonk_batching_challenges,
        const FF& kappa,
        const FF& kappa_inv,
        const std::array<Polynomial, BATCH_SIZE>& reversed_batched_left_columns,
        const std::vector<FF>& evals);

    /**
     * @brief Compute the partially evaluated Shplonk batched quotient and the resulting opening claim.
     *
     * @details Compute the partially evaluated batched quotient \f$Q'(X)\f$ defined as:
     * \f[
     *  -Q * (z - \kappa) +
     *      + (\sum_i \beta_i (L_i - l_i) + \sum_i \beta_i (R_i - r_i) + \sum_i \beta_i (M_i - m_i))
     *      + (z - \kappa) / (z - \kappa^{-1}) * \beta_i (G - g)
     * \f]
     * and return the opening claim \f$\{ Q', (z, 0) \}\f$.
     *
     */
    static OpeningClaim compute_shplonk_opening_claim(Polynomial& shplonk_batched_quotient,
                                                      const FF& shplonk_opening_challenge,
                                                      const PolynomialBatch& left_columns,
                                                      const PolynomialBatch& right_columns,
                                                      const PolynomialBatch& merged_columns,
                                                      const std::vector<FF>& shplonk_batching_challenges,
                                                      const FF& kappa,
                                                      const FF& kappa_inv,
                                                      std::array<Polynomial, BATCH_SIZE>& reversed_batched_left_columns,
                                                      const std::vector<FF>& evals);
};

} // namespace bb
