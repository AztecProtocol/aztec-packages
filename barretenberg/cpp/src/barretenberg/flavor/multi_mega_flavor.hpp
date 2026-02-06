// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"

namespace bb {

/**
 * @brief MultiMegaFlavor batches 4 polynomials per interleaved commitment, reducing witness commitments from 24 to 9.
 *
 * @details Key constraint: All polynomials in a batch must have the same shift property (all shiftable OR all
 * unshiftable).
 *
 * Batching layout (9 interleaved witness commits):
 *
 * ROUND 1 (before eta) - 5 commits:
 *   W₁ (shiftable):   [w_l, w_r, w_o, ZERO]
 *   W₂ (unshiftable): [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
 *   W₃ (unshiftable): [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
 *   W₄ (unshiftable): [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data,
 * return_data_read_counts] W₅ (unshiftable): [return_data_read_tags, ZERO, ZERO, ZERO]
 *
 * ROUND 2 (after eta) - 2 commits:
 *   W₆ (shiftable):   [w_4, ZERO, ZERO, ZERO]
 *   W₇ (unshiftable): [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
 *
 * ROUND 3 (after beta/gamma) - 1 commit:
 *   W₈ (unshiftable): [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
 *
 * ROUND 4 - 1 commit:
 *   W₉ (shiftable):   [z_perm, ZERO, ZERO, ZERO]
 *
 * Total: 9 interleaved commits (vs 24 individual) - 62.5% reduction
 */
class MultiMegaFlavor : public MegaFlavor {
  public:
    // Interleaving batch size
    static constexpr size_t INTERLEAVING_BATCH_SIZE = 4;

    // Number of interleaved witness commitments
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 9;

    // +2 Gemini rounds for k=2 (batch size 4 = 2^2)
    static constexpr size_t INTERLEAVING_LOG_K = 2;

    /**
     * @brief Container for the 9 interleaved witness commitments.
     * @details These replace the 24 individual witness commitments in the standard MegaFlavor.
     */
    template <typename DataType> class InterleavedWitnessCommitments {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              interleaved_wires,        // W₁: [w_l, w_r, w_o, ZERO] - shiftable
                              interleaved_ecc_op_wires, // W₂: ecc_op_wires - unshiftable
                              interleaved_databus_1,    // W₃: first batch of databus - unshiftable
                              interleaved_databus_2,    // W₄: second batch of databus - unshiftable
                              interleaved_databus_3,    // W₅: [return_data_read_tags, ZERO, ZERO, ZERO] - unshiftable
                              interleaved_w_4,          // W₆: [w_4, ZERO, ZERO, ZERO] - shiftable
                              interleaved_lookup,       // W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
                              interleaved_inverses,     // W₈: all inverses - unshiftable
                              interleaved_z_perm)       // W₉: [z_perm, ZERO, ZERO, ZERO] - shiftable

        // Shiftable commitments (W₁, W₆, W₉)
        auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }

        // Unshiftable commitments (W₂, W₃, W₄, W₅, W₇, W₈)
        auto get_unshiftable()
        {
            return RefArray{ interleaved_ecc_op_wires, interleaved_databus_1, interleaved_databus_2,
                             interleaved_databus_3,    interleaved_lookup,    interleaved_inverses };
        }

        // Round 1 commitments (before eta)
        auto get_round_1()
        {
            return RefArray{ interleaved_wires,
                             interleaved_ecc_op_wires,
                             interleaved_databus_1,
                             interleaved_databus_2,
                             interleaved_databus_3 };
        }

        // Round 2 commitments (after eta)
        auto get_round_2() { return RefArray{ interleaved_w_4, interleaved_lookup }; }

        // Round 3 commitments (after beta/gamma)
        auto get_round_3() { return RefArray{ interleaved_inverses }; }

        // Round 4 commitments
        auto get_round_4() { return RefArray{ interleaved_z_perm }; }
    };

    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    /**
     * @brief Labels for interleaved commitments in the transcript.
     */
    class InterleavedCommitmentLabels : public InterleavedWitnessCommitments<std::string> {
      public:
        InterleavedCommitmentLabels()
        {
            interleaved_wires = "INTERLEAVED_WIRES";
            interleaved_ecc_op_wires = "INTERLEAVED_ECC_OP_WIRES";
            interleaved_databus_1 = "INTERLEAVED_DATABUS_1";
            interleaved_databus_2 = "INTERLEAVED_DATABUS_2";
            interleaved_databus_3 = "INTERLEAVED_DATABUS_3";
            interleaved_w_4 = "INTERLEAVED_W_4";
            interleaved_lookup = "INTERLEAVED_LOOKUP";
            interleaved_inverses = "INTERLEAVED_INVERSES";
            interleaved_z_perm = "INTERLEAVED_Z_PERM";
        }
    };

    /**
     * @brief Container for interleaved precomputed commitments (8 total, down from 31).
     *
     * Batching layout:
     *   S₁: [q_m, q_c, q_l, q_r]
     *   S₂: [q_o, q_4, q_busread, q_lookup]
     *   S₃: [q_arith, q_delta_range, q_elliptic, q_memory]
     *   S₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, ZERO]
     *   S₅: [sigma_1, sigma_2, sigma_3, sigma_4]
     *   S₆: [id_1, id_2, id_3, id_4]
     *   S₇: [table_1, table_2, table_3, table_4]
     *   S₈: [lagrange_first, lagrange_last, lagrange_ecc_op, databus_id]
     */
    template <typename DataType_> class InterleavedPrecomputedCommitments {
      public:
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              interleaved_selectors_1, // S₁: [q_m, q_c, q_l, q_r]
                              interleaved_selectors_2, // S₂: [q_o, q_4, q_busread, q_lookup]
                              interleaved_selectors_3, // S₃: [q_arith, q_delta_range, q_elliptic, q_memory]
                              interleaved_selectors_4, // S₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, ZERO]
                              interleaved_sigmas,      // S₅: [sigma_1, sigma_2, sigma_3, sigma_4]
                              interleaved_ids,         // S₆: [id_1, id_2, id_3, id_4]
                              interleaved_tables,      // S₇: [table_1, table_2, table_3, table_4]
                              interleaved_lagrange) // S₈: [lagrange_first, lagrange_last, lagrange_ecc_op, databus_id]
    };

    // Number of interleaved precomputed commitments
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 8;

    // Total number of interleaved commitments (precomputed + witness)
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;

    // Number of shiftable interleaved witness commitments (W₁, W₆, W₉)
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 3;

    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    /**
     * @brief Labels for interleaved precomputed commitments.
     */
    class InterleavedPrecomputedLabels : public InterleavedPrecomputedCommitments<std::string> {
      public:
        InterleavedPrecomputedLabels()
        {
            interleaved_selectors_1 = "INTERLEAVED_SELECTORS_1";
            interleaved_selectors_2 = "INTERLEAVED_SELECTORS_2";
            interleaved_selectors_3 = "INTERLEAVED_SELECTORS_3";
            interleaved_selectors_4 = "INTERLEAVED_SELECTORS_4";
            interleaved_sigmas = "INTERLEAVED_SIGMAS";
            interleaved_ids = "INTERLEAVED_IDS";
            interleaved_tables = "INTERLEAVED_TABLES";
            interleaved_lagrange = "INTERLEAVED_LAGRANGE";
        }
    };

    // Updated FINAL_PCS_MSM_SIZE for interleaved commitments with batching:
    // The verifier batches the 17 interleaved commitments into 1 using batching_rho before Shplemini
    // 1 batched unshifted + 1 batched shifted + 1 (Shplonk Q) + (pcs_log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG
    // W) Note: PCS uses pcs_log_n = log_n + INTERLEAVING_LOG_K since Gemini operates on interleaved polynomials
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        // Batched unshifted: 1 (batched from 17 interleaved commitments using batching_rho)
        // Batched shifted: 1 (batched from 3 shiftable commitments using batching_rho)
        // Shplonk Q: 1
        // Gemini folds: pcs_log_n - 1
        // G1 identity: 1
        // KZG W: 1
        // Total: 1 + 1 + 1 + (pcs_log_n - 1) + 1 + 1 = 4 + pcs_log_n = 27 for log_n=21
        return 4 + pcs_log_n;
    }

    // VerificationKey stores 8 interleaved precomputed commitments instead of 31 individual ones.
    // The NativeVerificationKey_ base class handles construction (grouping polys in chunks of INTERLEAVING_BATCH_SIZE
    // and calling commit_interleaved), hashing, and serialization.
    using VerificationKey = NativeVerificationKey_<InterleavedPrecomputedCommitments<Commitment>,
                                                   Codec,
                                                   HashFunction,
                                                   CommitmentKey,
                                                   VKSerializationMode::FULL,
                                                   INTERLEAVING_BATCH_SIZE>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    // For interleaved commitments, shifted commitments are at non-contiguous indices (8, 13, 16).
    // The current RepeatedCommitmentsData mechanism assumes contiguous ranges, so we disable it.
    // This means the MSM will include the 3 shifted commitments separately (not deduplicated with unshifted).
    // TODO: Optimize by extending RepeatedCommitmentsData to support non-contiguous ranges.
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData();

    /**
     * @brief Information about which polynomials go into each interleaved batch.
     * @details This provides a mapping from the individual polynomials to their interleaved groups.
     * Useful for verifier to reconstruct evaluations from individual claimed evals.
     */
    struct InterleavingInfo {
        // W₁: [w_l, w_r, w_o, ZERO]
        static constexpr size_t WIRES_BATCH_SIZE = 3; // actual polys, rest is zero-padded

        // W₂: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
        static constexpr size_t ECC_OP_WIRES_BATCH_SIZE = 4;

        // W₃: [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
        static constexpr size_t DATABUS_1_BATCH_SIZE = 4;

        // W₄: [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data, return_data_read_counts]
        static constexpr size_t DATABUS_2_BATCH_SIZE = 4;

        // W₅: [return_data_read_tags, ZERO, ZERO, ZERO]
        static constexpr size_t DATABUS_3_BATCH_SIZE = 1;

        // W₆: [w_4, ZERO, ZERO, ZERO]
        static constexpr size_t W_4_BATCH_SIZE = 1;

        // W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
        static constexpr size_t LOOKUP_BATCH_SIZE = 2;

        // W₈: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
        static constexpr size_t INVERSES_BATCH_SIZE = 4;

        // W₉: [z_perm, ZERO, ZERO, ZERO]
        static constexpr size_t Z_PERM_BATCH_SIZE = 1;
    };
};

} // namespace bb
