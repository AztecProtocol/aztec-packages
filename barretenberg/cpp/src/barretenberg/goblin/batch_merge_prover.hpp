// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
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
    using ShplonkProver = ShplonkProver_<Curve>;

  public:
    using MergeProof = std::vector<FF>;

    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    /**
     * @param op_queue   The ECC op queue containing all accumulated subtables (N subtables, in append order).
     * @param transcript Shared prover transcript.
     * @param max_subtables M: the fixed maximum number of subtables (CHONK_MAX_ACCUMULATION_STEPS).
     */
    explicit BatchMergeProver(const std::shared_ptr<ECCOpQueue>& op_queue, size_t max_subtables);

    /**
     * @brief Construct the batch merge proof.
     *
     * @details Proves that the full merged table T is the correct concatenation of all N subtables
     * C_0, ..., C_{N-1} stored in the op_queue in append order (C_0 oldest, C_{N-1} most recently merged) together with
     * an additional zero-knowledge commitment C_zk (prepended at the beginning).
     *
     */
    MergeProof construct_proof();

    // Exposed for test access
    CommitmentKey pcs_commitment_key;

    // Public for testing purposes
    std::shared_ptr<Transcript> transcript;

  protected:
    std::shared_ptr<ECCOpQueue> op_queue;
    size_t max_subtables; // M

    static Polynomial compute_degree_check_polynomial(const std::vector<Polynomial>& flattened_columns,
                                                      const std::vector<FF>& degree_check_challenges,
                                                      const size_t max_size);
};

} // namespace bb
