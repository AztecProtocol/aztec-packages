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
 * @brief Prover for the batch Goblin ECC op queue merge protocol.
 *
 * @details In the delayed-merge protocol, instead of one merge proof per accumulation step, a single
 * batch merge is performed in the tail kernel. This prover proves that the full merged table T is the
 * correct concatenation of all N accumulated subtables C_0, ..., C_{N-1} (padded to MAX_SUBTABLES M).
 *
 * Protocol overview:
 *   1. Prover sends shift_sizes[0..N-1] and [T] (commitment to full merged table)
 *   2. Verifier sends degree check challenges α_0..α_{M-1}
 *   3. Prover computes G = sum_i α_i * reversed_at_{k_i}(C_i), sends [G]
 *   4. Verifier sends Shplonk batching challenges and evaluation challenge κ
 *   5. Prover sends C_i(κ) for i=0..N-1, T(κ), G(κ^{-1})
 *   6. Prover produces Shplonk/KZG proof
 *
 * Verification checks:
 *   - Concatenation: T(κ) = sum_i C_i(κ) * κ^{offset_i} (offsets derived from shift_sizes)
 *   - Degree:        G(κ^{-1}) * κ^{k_max-1} = sum_i α_i * C_i(κ) * κ^{k_max - k_i}
 *   - KZG:           Shplonk batch opening proof
 *
 * @tparam BATCH_SIZE Number of individual wire polynomials interleaved into each column commitment
 */
template <size_t BATCH_SIZE> class BatchMergeProver {
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using PCS = KZG<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using Transcript = NativeTranscript;
    using Batch = MergeProver<BATCH_SIZE>::Batch;
    using PolynomialBatch = MergeProver<BATCH_SIZE>::PolynomialBatch;

  public:
    using MergeProof = std::vector<FF>;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;
    static_assert(NUM_WIRES % BATCH_SIZE == 0, "Batch size must divide number of wires");
    static constexpr size_t NUM_COLUMNS = NUM_WIRES / BATCH_SIZE;

    /**
     * @param op_queue   The ECC op queue containing all accumulated subtables (N subtables in its deque).
     * @param transcript Shared prover transcript.
     * @param max_subtables M: the fixed maximum number of subtables (CHONK_MAX_ACCUMULATION_STEPS).
     */
    explicit BatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                              std::shared_ptr<Transcript> transcript,
                              size_t max_subtables);

    MergeProof construct_proof();

    // Exposed for test access
    CommitmentKey pcs_commitment_key;

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<ECCOpQueue> op_queue;
    size_t max_subtables; // M

    Polynomial interleave_polynomials(const std::array<Polynomial, BATCH_SIZE>& polys);

    Batch compute_degree_check_polynomial(const std::vector<PolynomialBatch>& subtable_columns,
                                          const std::vector<FF>& degree_check_challenges,
                                          const size_t max_size);
};

} // namespace bb
