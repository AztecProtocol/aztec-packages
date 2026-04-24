// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Batch merge prover
 *
 * @details This prover proves that the full merged table T is the correct concatenation of all N accumulated subtables
 * C_0, ..., C_{N-1} (padded to MAX_SUBTABLES M).
 *
 * Protocol overview:
 *   1. Prover sends C_0, .., C_{M-1}, shift_sizes[0..N-1] and [T] (commitment to full merged table)
 *   2. Verifier sends degree check challenges α_0..α_{M-1}
 *   3. Prover computes G = sum_i α_i * C_i(1/X) X^{shift_sizes[i] - 1}, sends [G]
 *   4. Verifier sends Shplonk batching challenges and evaluation challenge κ
 *   5. Prover sends C_i(κ) for i=0..M-1, T(κ), G(κ^{-1})
 *   6. Prover produces Shplonk/KZG proof
 *
 * Verification checks:
 *   - Concatenation: T(κ) = sum_i C_i(κ) * κ^{offset_i} (offsets derived from shift_sizes)
 *   - Degree:        G(κ^{-1}) = sum_i α_i * C_i(κ) * κ^{- shift_sizes[i] + 1}
 *   - KZG:           Shplonk batch opening proof
 *
 */
class BatchMergeProver {
  protected:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using Transcript = NativeTranscript;

  public:
    using MergeProof = std::vector<FF>;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    /**
     * @param op_queue   The ECC op queue containing all accumulated subtables (N subtables in its deque).
     * @param transcript Shared prover transcript.
     * @param max_subtables M: the fixed maximum number of subtables (CHONK_MAX_ACCUMULATION_STEPS).
     */
    explicit BatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                              std::shared_ptr<Transcript> transcript,
                              size_t max_subtables);

    /**
     * @brief Construct the batch merge proof.
     *
     * @details Proves that the full merged table T is the correct concatenation of all N subtables
     * C_0, ..., C_{N-1} (deque order: C_0 most recently prepended, C_{N-1} oldest) stored in the op_queue.
     *
     * Proof structure:
     *   Prover → Verifier: C_0, .., C_{M-1}, shift_size_0..shift_size_{N-1}, [T]
     *   Verifier → Prover: degree check challenges α_0..α_{M-1}
     *   Prover → Verifier: [G]
     *   Verifier → Prover: Shplonk batching challenges, κ
     *   Prover → Verifier: C_i(κ) for each i, T(κ), G(κ^{-1})
     *   Prover → Verifier: [Q] (Shplonk quotient)
     *   Verifier → Prover: z (KZG opening challenge)
     *   Prover → Verifier: [W] (KZG opening proof)
     */
    MergeProof construct_proof();

    // Exposed for test access
    CommitmentKey pcs_commitment_key;

  protected:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<ECCOpQueue> op_queue;
    size_t max_subtables; // M

    static Polynomial compute_degree_check_polynomial(
        const std::vector<std::array<Polynomial, NUM_WIRES>>& subtable_columns,
        const std::vector<FF>& degree_check_challenges,
        const size_t max_size);

    Polynomial compute_shplonk_batched_quotient(const std::vector<std::array<Polynomial, NUM_WIRES>>& subtables,
                                                const std::array<Polynomial, NUM_WIRES>& merged_table,
                                                const std::vector<FF>& shplonk_batching_challenges,
                                                const FF& kappa,
                                                const FF& kappa_inv,
                                                const Polynomial& degree_check_poly,
                                                const std::vector<FF>& evals);

    OpeningClaim compute_shplonk_opening_claim(Polynomial& shplonk_batched_quotient,
                                               const FF& shplonk_opening_challenge,
                                               const std::vector<std::array<Polynomial, NUM_WIRES>>& subtables,
                                               const std::array<Polynomial, NUM_WIRES>& merged_table,
                                               const std::vector<FF>& shplonk_batching_challenges,
                                               const FF& kappa,
                                               const FF& kappa_inv,
                                               Polynomial& degree_check_poly,
                                               const std::vector<FF>& evals);
};

} // namespace bb
