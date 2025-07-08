// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
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
class MergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using ShplonkProver = ShplonkProver_<Curve>;
    using OpeningPair = bb::OpeningPair<Curve>;
    using Transcript = NativeTranscript;

  public:
    using MergeProof = std::vector<FF>;
    using Polynomial = bb::Polynomial<FF>;
    using OpeningClaim = ProverOpeningClaim<Curve>;

    // Number of columns that jointly constitute the op_queue, should be the same as the number of wires in the
    // MegaCircuitBuilder
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    // The positions of the table polynomials in the array computed during proof generation
    static constexpr size_t T_CURRENT_IDX = 0;
    static constexpr size_t T_PREV_IDX = 1;
    static constexpr size_t T_IDX = 2;
    static constexpr size_t REVERSED_T_IDX = 3;

    explicit MergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                         CommitmentKey commitment_key = CommitmentKey(),
                         const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    BB_PROFILE MergeProof construct_proof();

    std::shared_ptr<ECCOpQueue> op_queue;
    CommitmentKey pcs_commitment_key;
    std::shared_ptr<Transcript> transcript;

    /**
     * @brief Compute polynomials \f$t, T_prev, T, g(X) := X^{l-1} t(1/X)\f$ and send their commitments to the verifier
     *
     * @return std::array<std::array<Polynomial, NUM_WIRES>, 4> array of table polynomials
     */
    std::array<std::array<Polynomial, NUM_WIRES>, 4> preamble_round();

    /**
     * @brief Construct the opening claims to be passed to the Shplonk prover
     *
     * @details Construct the following opening claims for j = 1, 2, 3, 4:
     *            - p_j(X) := t_j(X) + kappa^{l-1} T_{prev, j}(X) - T_j(X), evaluated at kappa
     *            - g_j(X), evaluated at kappa
     *            - t_j(X), evaluated at 1/kappa
     *
     * @param table_polynomials
     * @param kappa
     * @param kappa_inv
     *
     * @return std::vector<OpeningClaim>
     */
    std::vector<OpeningClaim> construct_opening_claims(
        const std::array<std::array<Polynomial, NUM_WIRES>, 4>& table_polynomials);
};

} // namespace bb
