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
    template <typename DataType> class InterleavedPrecomputedCommitments {
      public:
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

    // Updated FINAL_PCS_MSM_SIZE for interleaved commitments:
    // 1 (Shplonk Q) + 17 unshifted + 3 shifted + (log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG W)
    // Note: shifted commitments are NOT deduplicated because they're at non-contiguous indices
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        // Unshifted: 8 precomputed + 9 witness = 17
        // Shifted: 3 (W₁, W₆, W₉ - NOT deduplicated due to non-contiguous indices)
        // Shplonk Q: 1
        // Gemini folds: log_n - 1
        // G1 identity: 1
        // KZG W: 1
        // Total: 20 + 1 + (log_n - 1) + 1 + 1 = 20 + log_n + 2 = 43 for log_n=21
        return NUM_ALL_INTERLEAVED_COMMITMENTS + NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS + log_n + 2;
    }

    /**
     * @brief Specialized VerificationKey for MultiMegaFlavor that stores interleaved precomputed commitments.
     * @details This VK stores 8 interleaved precomputed commitments instead of 31 individual ones,
     *          reducing the verifier's MSM size significantly.
     */
    class VerificationKey : public InterleavedPrecomputedCommitments<Commitment> {
      public:
        using DataType = typename Codec::DataType;

        uint64_t log_circuit_size = 0;
        uint64_t num_public_inputs = 0;
        uint64_t pub_inputs_offset = 0;

        VerificationKey() = default;

        /**
         * @brief Construct VK from precomputed data by committing to interleaved polynomials.
         * @details Uses commit_interleaved to create 8 interleaved commitments from the 31 precomputed polynomials.
         *
         * PrecomputedEntities ordering (indices into RefArray):
         *   0: q_m, 1: q_c, 2: q_l, 3: q_r, 4: q_o, 5: q_4, 6: q_busread, 7: q_lookup,
         *   8: q_arith, 9: q_delta_range, 10: q_elliptic, 11: q_memory, 12: q_nnf,
         *   13: q_poseidon2_external, 14: q_poseidon2_internal,
         *   15: sigma_1, 16: sigma_2, 17: sigma_3, 18: sigma_4,
         *   19: id_1, 20: id_2, 21: id_3, 22: id_4,
         *   23: table_1, 24: table_2, 25: table_3, 26: table_4,
         *   27: lagrange_first, 28: lagrange_last, 29: lagrange_ecc_op, 30: databus_id
         */
        template <typename PrecomputedData>
        explicit VerificationKey(const PrecomputedData& precomputed)
            : log_circuit_size(numeric::get_msb(precomputed.metadata.dyadic_size))
            , num_public_inputs(precomputed.metadata.num_public_inputs)
            , pub_inputs_offset(precomputed.metadata.pub_inputs_offset)
        {
            // Need 4x the polynomial size for interleaved commitments
            bb::CommitmentKey<Curve> ck(precomputed.metadata.dyadic_size * INTERLEAVING_BATCH_SIZE);

            auto& polys = precomputed.polynomials;

            // S₁: [q_m(0), q_c(1), q_l(2), q_r(3)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[0]),
                                                                  PolynomialSpan<const FF>(polys[1]),
                                                                  PolynomialSpan<const FF>(polys[2]),
                                                                  PolynomialSpan<const FF>(polys[3]) };
                this->interleaved_selectors_1 =
                    ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₂: [q_o(4), q_4(5), q_busread(6), q_lookup(7)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[4]),
                                                                  PolynomialSpan<const FF>(polys[5]),
                                                                  PolynomialSpan<const FF>(polys[6]),
                                                                  PolynomialSpan<const FF>(polys[7]) };
                this->interleaved_selectors_2 =
                    ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₃: [q_arith(8), q_delta_range(9), q_elliptic(10), q_memory(11)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[8]),
                                                                  PolynomialSpan<const FF>(polys[9]),
                                                                  PolynomialSpan<const FF>(polys[10]),
                                                                  PolynomialSpan<const FF>(polys[11]) };
                this->interleaved_selectors_3 =
                    ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₄: [q_nnf(12), q_poseidon2_external(13), q_poseidon2_internal(14), ZERO]
            {
                std::array<PolynomialSpan<const FF>, 3> batch = { PolynomialSpan<const FF>(polys[12]),
                                                                  PolynomialSpan<const FF>(polys[13]),
                                                                  PolynomialSpan<const FF>(polys[14]) };
                this->interleaved_selectors_4 =
                    ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₅: [sigma_1(15), sigma_2(16), sigma_3(17), sigma_4(18)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[15]),
                                                                  PolynomialSpan<const FF>(polys[16]),
                                                                  PolynomialSpan<const FF>(polys[17]),
                                                                  PolynomialSpan<const FF>(polys[18]) };
                this->interleaved_sigmas = ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₆: [id_1(19), id_2(20), id_3(21), id_4(22)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[19]),
                                                                  PolynomialSpan<const FF>(polys[20]),
                                                                  PolynomialSpan<const FF>(polys[21]),
                                                                  PolynomialSpan<const FF>(polys[22]) };
                this->interleaved_ids = ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₇: [table_1(23), table_2(24), table_3(25), table_4(26)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[23]),
                                                                  PolynomialSpan<const FF>(polys[24]),
                                                                  PolynomialSpan<const FF>(polys[25]),
                                                                  PolynomialSpan<const FF>(polys[26]) };
                this->interleaved_tables = ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }

            // S₈: [lagrange_first(27), lagrange_last(28), lagrange_ecc_op(29), databus_id(30)]
            {
                std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys[27]),
                                                                  PolynomialSpan<const FF>(polys[28]),
                                                                  PolynomialSpan<const FF>(polys[29]),
                                                                  PolynomialSpan<const FF>(polys[30]) };
                this->interleaved_lagrange = ck.template commit_interleaved<INTERLEAVING_BATCH_SIZE>(std::span(batch));
            }
        }

        /**
         * @brief Compute VK hash.
         */
        FF hash() const
        {
            auto elements = to_field_elements();
            return HashFunction::hash(elements);
        }

        /**
         * @brief Compute VK hash with origin tagging for transcript.
         */
        template <typename Transcript> FF hash_with_origin_tagging(Transcript& transcript) const
        {
            auto elements = to_field_elements();
            transcript.add_to_hash_buffer("vk_data", elements);
            return HashFunction::hash(elements);
        }

        /**
         * @brief Serialize VK to field elements.
         */
        std::vector<DataType> to_field_elements() const
        {
            std::vector<DataType> elements;

            auto serialize = [&elements](const auto& input) {
                std::vector<DataType> input_fields = Codec::serialize_to_fields(input);
                elements.insert(elements.end(), input_fields.begin(), input_fields.end());
            };

            serialize(this->log_circuit_size);
            serialize(this->num_public_inputs);
            serialize(this->pub_inputs_offset);

            for (const Commitment& commitment : this->get_all()) {
                serialize(commitment);
            }

            return elements;
        }
    };

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
