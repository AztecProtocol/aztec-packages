// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include <array>
#include <cstddef>
#include <string>
#include <vector>

namespace bb {

// ============================================================
// External entity specializations parameterized on BATCH_SIZE
// ============================================================
// These structs define interleaving-dependent data for MegaFlavor_<BS>.
// Each has explicit specializations for BS=1 (individual, the base case)
// and BS=4 (interleaved). To add a new batch size (e.g. BS=2), add
// specializations here.
//
// MegaFlavor_ delegates ALL batch-size-dependent logic here so that
// the flavor class itself is fully agnostic to BS.

/**
 * @brief ZK-specific masking entities, specialized per (DataType, BATCH_SIZE, HasZK).
 *
 * - (any BS, HasZK=false): empty
 * - (BS=1, HasZK=true):    single gemini_masking_poly
 * - (BS=4, HasZK=true):    4 masking chunks (committed as one interleaved group)
 */
template <typename DataType, size_t BS, bool HasZK> struct MegaMaskingEntities_;

// Non-ZK: always empty regardless of batch size
template <typename DataType, size_t BS> struct MegaMaskingEntities_<DataType, BS, false> {
    auto get_all() { return RefArray<DataType, 0>{}; }
    auto get_all() const { return RefArray<const DataType, 0>{}; }
    static auto get_labels() { return std::vector<std::string>{}; }
};

// BS=1, ZK: single Gemini masking polynomial
template <typename DataType> struct MegaMaskingEntities_<DataType, 1, true> {
    DEFINE_FLAVOR_MEMBERS(DataType, gemini_masking_poly)
};

// BS=2, ZK: 2 masking chunk polynomials
template <typename DataType> struct MegaMaskingEntities_<DataType, 2, true> {
    DEFINE_FLAVOR_MEMBERS(DataType, masking_chunk_0, masking_chunk_1)
};

// BS=4, ZK: 4 masking chunk polynomials
template <typename DataType> struct MegaMaskingEntities_<DataType, 4, true> {
    DEFINE_FLAVOR_MEMBERS(DataType, masking_chunk_0, masking_chunk_1, masking_chunk_2, masking_chunk_3)
};

/**
 * @brief Interleaved witness commitments, specialized per (DataType, BATCH_SIZE, HasZK).
 *
 * For BS=1: empty (individual commitments are stored in WitnessCommitments).
 * For BS=4: 11 (non-ZK) or 12 (ZK) interleaved witness commitments.
 *
 * Ordering: unshiftable groups first, then shiftable groups at the end.
 * This enables the REPEATED_COMMITMENTS optimization for shift deduplication.
 */
template <typename DataType, size_t BS, bool HasZK> class MegaInterleavedWitnessCommitments_;

// BS=1: empty (any HasZK)
template <typename DataType, bool HasZK> class MegaInterleavedWitnessCommitments_<DataType, 1, HasZK> {
  public:
    auto get_all() { return RefArray<DataType, 0>{}; }
    auto get_all() const { return RefArray<const DataType, 0>{}; }
    static auto get_labels() { return std::vector<std::string>{}; }
    auto get_shiftable() { return RefArray<DataType, 0>{}; }
    auto get_shiftable() const { return RefArray<const DataType, 0>{}; }
};

// BS=2, non-ZK: 15 interleaved witness commitments
template <typename DataType> class MegaInterleavedWitnessCommitments_<DataType, 2, false> {
  public:
    DEFINE_FLAVOR_MEMBERS(
        DataType,
        interleaved_ecc_op_wires_1,     // [ecc_op_wire_1, ecc_op_wire_2] - unshiftable
        interleaved_ecc_op_wires_2,     // [ecc_op_wire_3, ecc_op_wire_4] - unshiftable
        interleaved_calldata,           // [calldata, 0] - unshiftable
        interleaved_secondary_calldata, // [secondary_calldata, 0] - unshiftable
        interleaved_calldata_tags,      // [calldata_read_counts, calldata_read_tags] - unshiftable
        interleaved_scd_tags,           // [scd_read_counts, scd_read_tags] - unshiftable
        interleaved_return_data_tags,   // [return_data_read_tags, return_data_read_counts] - unshiftable
        interleaved_return_data,        // [return_data, 0] - unshiftable
        interleaved_lookup,             // [lookup_read_counts, lookup_read_tags] - unshiftable
        interleaved_inverses_1,         // [lookup_inverses, calldata_inverses] - unshiftable
        interleaved_inverses_2,         // [scd_inverses, return_data_inverses] - unshiftable
        interleaved_wires,              // [w_l, w_r] - shiftable
        interleaved_w_o,                // [w_o, 0] - shiftable
        interleaved_w_4,                // [w_4, 0] - shiftable
        interleaved_z_perm)             // [z_perm, 0] - shiftable

    auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_o, interleaved_w_4, interleaved_z_perm }; }
    auto get_shiftable() const
    {
        return RefArray{ interleaved_wires, interleaved_w_o, interleaved_w_4, interleaved_z_perm };
    }
    auto get_ecc_op_wires() { return RefArray{ interleaved_ecc_op_wires_1, interleaved_ecc_op_wires_2 }; }
};

// BS=2, ZK: 16 interleaved witness commitments (15 base + masking)
template <typename DataType> class MegaInterleavedWitnessCommitments_<DataType, 2, true> {
  public:
    DEFINE_FLAVOR_MEMBERS(
        DataType,
        interleaved_ecc_op_wires_1,     // [ecc_op_wire_1, ecc_op_wire_2] - unshiftable
        interleaved_ecc_op_wires_2,     // [ecc_op_wire_3, ecc_op_wire_4] - unshiftable
        interleaved_calldata,           // [calldata, 0] - unshiftable
        interleaved_secondary_calldata, // [secondary_calldata, 0] - unshiftable
        interleaved_calldata_tags,      // [calldata_read_counts, calldata_read_tags] - unshiftable
        interleaved_scd_tags,           // [scd_read_counts, scd_read_tags] - unshiftable
        interleaved_return_data_tags,   // [return_data_read_tags, return_data_read_counts] - unshiftable
        interleaved_return_data,        // [return_data, 0] - unshiftable
        interleaved_lookup,             // [lookup_read_counts, lookup_read_tags] - unshiftable
        interleaved_inverses_1,         // [lookup_inverses, calldata_inverses] - unshiftable
        interleaved_inverses_2,         // [scd_inverses, return_data_inverses] - unshiftable
        masking_commitment,             // masking chunks - unshiftable
        interleaved_wires,              // [w_l, w_r] - shiftable
        interleaved_w_o,                // [w_o, 0] - shiftable
        interleaved_w_4,                // [w_4, 0] - shiftable
        interleaved_z_perm)             // [z_perm, 0] - shiftable

    auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_o, interleaved_w_4, interleaved_z_perm }; }
    auto get_shiftable() const
    {
        return RefArray{ interleaved_wires, interleaved_w_o, interleaved_w_4, interleaved_z_perm };
    }
    auto get_ecc_op_wires() { return RefArray{ interleaved_ecc_op_wires_1, interleaved_ecc_op_wires_2 }; }
};

// BS=4, non-ZK: 11 interleaved witness commitments
template <typename DataType> class MegaInterleavedWitnessCommitments_<DataType, 4, false> {
  public:
    DEFINE_FLAVOR_MEMBERS(
        DataType,
        interleaved_ecc_op_wires,       // W₂:  [ecc_op_wire_1..4] - unshiftable
        interleaved_calldata,           // W₃:  [calldata, 0, 0, 0] - unshiftable
        interleaved_secondary_calldata, // W₄:  [secondary_calldata, 0, 0, 0] - unshiftable
        interleaved_databus_tags,       // W₅:  [cd_read_counts, cd_read_tags, scd_read_counts, scd_read_tags]
        interleaved_return_data_tags,   // W₆:  [rd_read_tags, rd_read_counts, 0, 0] - unshiftable
        interleaved_return_data,        // W₇:  [return_data, 0, 0, 0] - unshiftable
        interleaved_lookup,             // W₉:  [lookup_read_counts, lookup_read_tags, 0, 0]
        interleaved_inverses,           // W₁₀: all inverses - unshiftable
        interleaved_wires,              // W₁:  [w_l, w_r, w_o, 0] - shiftable
        interleaved_w_4,                // W₈:  [w_4, 0, 0, 0] - shiftable
        interleaved_z_perm)             // W₁₁: [z_perm, 0, 0, 0] - shiftable

    auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
    auto get_shiftable() const { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
    auto get_ecc_op_wires() { return RefArray{ interleaved_ecc_op_wires }; }
};

// BS=4, ZK: 12 interleaved witness commitments (11 base + masking)
template <typename DataType> class MegaInterleavedWitnessCommitments_<DataType, 4, true> {
  public:
    DEFINE_FLAVOR_MEMBERS(
        DataType,
        interleaved_ecc_op_wires,       // W₂:  [ecc_op_wire_1..4] - unshiftable
        interleaved_calldata,           // W₃:  [calldata, 0, 0, 0] - unshiftable
        interleaved_secondary_calldata, // W₄:  [secondary_calldata, 0, 0, 0] - unshiftable
        interleaved_databus_tags,       // W₅:  [cd_read_counts, cd_read_tags, scd_read_counts, scd_read_tags]
        interleaved_return_data_tags,   // W₆:  [rd_read_tags, rd_read_counts, 0, 0] - unshiftable
        interleaved_return_data,        // W₇:  [return_data, 0, 0, 0] - unshiftable
        interleaved_lookup,             // W₉:  [lookup_read_counts, lookup_read_tags, 0, 0]
        interleaved_inverses,           // W₁₀: all inverses - unshiftable
        masking_commitment,             // W₁₂: masking chunks - unshiftable
        interleaved_wires,              // W₁:  [w_l, w_r, w_o, 0] - shiftable
        interleaved_w_4,                // W₈:  [w_4, 0, 0, 0] - shiftable
        interleaved_z_perm)             // W₁₁: [z_perm, 0, 0, 0] - shiftable

    auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
    auto get_shiftable() const { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
    auto get_ecc_op_wires() { return RefArray{ interleaved_ecc_op_wires }; }
};

/**
 * @brief Interleaved precomputed commitments (8 total for BS=4, empty for BS=1).
 *
 * Groups are formed by sequential chunking of PrecomputedEntities (batch_size=4).
 * With 31 entities, the last group has only 3 polynomials (zero-padded).
 */
template <typename DataType_, size_t BS> class MegaInterleavedPrecomputedCommitments_;

// BS=1: empty
template <typename DataType_> class MegaInterleavedPrecomputedCommitments_<DataType_, 1> {
  public:
    using DataType = DataType_;
    auto get_all() { return RefArray<DataType, 0>{}; }
    auto get_all() const { return RefArray<const DataType, 0>{}; }
    static auto get_labels() { return std::vector<std::string>{}; }
    bool operator==(const MegaInterleavedPrecomputedCommitments_&) const = default;
};

// BS=2: 16 interleaved precomputed commitments
template <typename DataType_> class MegaInterleavedPrecomputedCommitments_<DataType_, 2> {
  public:
    using DataType = DataType_;
    DEFINE_FLAVOR_MEMBERS(DataType,
                          interleaved_precomputed_0,  // P₁:  [q_m, q_c]
                          interleaved_precomputed_1,  // P₂:  [q_l, q_r]
                          interleaved_precomputed_2,  // P₃:  [q_o, q_4]
                          interleaved_precomputed_3,  // P₄:  [q_busread, q_lookup]
                          interleaved_precomputed_4,  // P₅:  [q_arith, q_delta_range]
                          interleaved_precomputed_5,  // P₆:  [q_elliptic, q_memory]
                          interleaved_precomputed_6,  // P₇:  [q_nnf, q_poseidon2_external]
                          interleaved_precomputed_7,  // P₈:  [q_poseidon2_internal, sigma_1]
                          interleaved_precomputed_8,  // P₉:  [sigma_2, sigma_3]
                          interleaved_precomputed_9,  // P₁₀: [sigma_4, id_1]
                          interleaved_precomputed_10, // P₁₁: [id_2, id_3]
                          interleaved_precomputed_11, // P₁₂: [id_4, table_1]
                          interleaved_precomputed_12, // P₁₃: [table_2, table_3]
                          interleaved_precomputed_13, // P₁₄: [table_4, lagrange_first]
                          interleaved_precomputed_14, // P₁₅: [lagrange_last, lagrange_ecc_op]
                          interleaved_precomputed_15) // P₁₆: [databus_id, 0] (1 poly)
    bool operator==(const MegaInterleavedPrecomputedCommitments_&) const = default;
};

// BS=4: 8 interleaved precomputed commitments
template <typename DataType_> class MegaInterleavedPrecomputedCommitments_<DataType_, 4> {
  public:
    using DataType = DataType_;
    DEFINE_FLAVOR_MEMBERS(DataType,
                          interleaved_precomputed_0, // P₁: [q_m, q_c, q_l, q_r]
                          interleaved_precomputed_1, // P₂: [q_o, q_4, q_busread, q_lookup]
                          interleaved_precomputed_2, // P₃: [q_arith, q_delta_range, q_elliptic, q_memory]
                          interleaved_precomputed_3, // P₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, sigma_1]
                          interleaved_precomputed_4, // P₅: [sigma_2, sigma_3, sigma_4, id_1]
                          interleaved_precomputed_5, // P₆: [id_2, id_3, id_4, table_1]
                          interleaved_precomputed_6, // P₇: [table_2, table_3, table_4, lagrange_first]
                          interleaved_precomputed_7) // P₈: [lagrange_last, lagrange_ecc_op, databus_id] (3 polys)
    bool operator==(const MegaInterleavedPrecomputedCommitments_&) const = default;
};

// ============================================================
// VK precomputed type selector (BS-dependent)
// ============================================================

/**
 * @brief Selects the VK precomputed commitment type based on batch size.
 * BS=1: individual precomputed commitments (PrecomputedEntities<Commitment>).
 * BS>1: interleaved precomputed commitments.
 */
template <size_t BS, typename Commitment, typename PrecomputedEntitiesCommitment> struct VKPrecomputedType_ {
    using type = PrecomputedEntitiesCommitment; // BS=1 default
};
template <typename Commitment, typename PrecomputedEntitiesCommitment>
struct VKPrecomputedType_<2, Commitment, PrecomputedEntitiesCommitment> {
    using type = MegaInterleavedPrecomputedCommitments_<Commitment, 2>;
};
template <typename Commitment, typename PrecomputedEntitiesCommitment>
struct VKPrecomputedType_<4, Commitment, PrecomputedEntitiesCommitment> {
    using type = MegaInterleavedPrecomputedCommitments_<Commitment, 4>;
};

// ============================================================
// VerifierCommitments initialization (BS-dependent)
// ============================================================

/**
 * @brief Populates VerifierCommitments from VK and witness commitments.
 * BS=1: copies individual precomputed + witness commitments into AllEntities slots.
 * BS>1: no-op (verifier uses interleaved commitments directly for PCS).
 */
template <size_t BS> struct VerifierCommitmentsInit_;

template <> struct VerifierCommitmentsInit_<1> {
    template <typename Self, typename VK, typename WC>
    static void init(Self& self, const std::shared_ptr<VK>& verification_key, const std::optional<WC>& witness_comms)
    {
        for (auto [dest, src] : zip_view(self.get_precomputed(), verification_key->get_all())) {
            dest = src;
        }
        if (witness_comms.has_value()) {
            for (auto [dest, src] : zip_view(self.get_witness(), witness_comms->get_all())) {
                dest = src;
            }
            for (auto [dest, src] : zip_view(self.get_shifted(), witness_comms->get_to_be_shifted())) {
                dest = src;
            }
        }
    }
};

template <> struct VerifierCommitmentsInit_<2> {
    template <typename Self, typename VK, typename WC>
    static void init(Self&, const std::shared_ptr<VK>&, const std::optional<WC>&)
    {
        // For BS > 1: individual precomputed/witness slots are not populated from the VK
        // because the VK stores interleaved commitments. The verifier uses interleaved
        // commitments directly for PCS verification.
    }
};

template <> struct VerifierCommitmentsInit_<4> {
    template <typename Self, typename VK, typename WC>
    static void init(Self&, const std::shared_ptr<VK>&, const std::optional<WC>&)
    {
        // For BS > 1: individual precomputed/witness slots are not populated from the VK
        // because the VK stores interleaved commitments. The verifier uses interleaved
        // commitments directly for PCS verification.
    }
};

// ============================================================
// Interleaving constants (BS-dependent, fully specialized)
// ============================================================

template <size_t BS> struct InterleavingConstants_;

template <> struct InterleavingConstants_<1> {
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 0;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 0;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = 0;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 0;

    // For BS=1, PCS uses individual commitments directly.
    // original_start = NUM_PRECOMPUTED (shiftable polys start at beginning of witness block)
    // duplicate_start = NUM_PRECOMPUTED + NUM_WITNESS (shifted entities follow unshifted)
    static constexpr RepeatedCommitmentsData make_repeated_commitments(size_t num_precomputed,
                                                                       size_t num_unshifted,
                                                                       size_t num_shifted)
    {
        return RepeatedCommitmentsData(num_precomputed, num_unshifted, num_shifted);
    }

    static constexpr size_t final_pcs_msm_size(size_t num_unshifted, size_t log_n) { return num_unshifted + log_n + 2; }
};

template <> struct InterleavingConstants_<2> {
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 16;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 15;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 4;

    // For BS=2, PCS uses interleaved commitments. Shiftable groups are at the end.
    static constexpr RepeatedCommitmentsData make_repeated_commitments(size_t /*num_precomputed*/,
                                                                       size_t /*num_unshifted*/,
                                                                       size_t /*num_shifted*/)
    {
        return RepeatedCommitmentsData(NUM_ALL_INTERLEAVED_COMMITMENTS - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS,
                                       NUM_ALL_INTERLEAVED_COMMITMENTS,
                                       NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);
    }

    static constexpr size_t final_pcs_msm_size(size_t /*num_unshifted*/, size_t log_n)
    {
        constexpr size_t LOG_K = 1; // log2(2)
        return NUM_ALL_INTERLEAVED_COMMITMENTS + log_n + LOG_K + 2;
    }
};

template <> struct InterleavingConstants_<4> {
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 8;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 11;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 3;

    // For BS=4, PCS uses interleaved commitments. Shiftable groups are at the end.
    static constexpr RepeatedCommitmentsData make_repeated_commitments(size_t /*num_precomputed*/,
                                                                       size_t /*num_unshifted*/,
                                                                       size_t /*num_shifted*/)
    {
        return RepeatedCommitmentsData(NUM_ALL_INTERLEAVED_COMMITMENTS - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS,
                                       NUM_ALL_INTERLEAVED_COMMITMENTS,
                                       NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);
    }

    static constexpr size_t final_pcs_msm_size(size_t /*num_unshifted*/, size_t log_n)
    {
        constexpr size_t LOG_K = 2; // log2(4)
        return NUM_ALL_INTERLEAVED_COMMITMENTS + log_n + LOG_K + 2;
    }
};

// ============================================================
// Interleaved commitment labels (BS-dependent)
// ============================================================

/**
 * @brief Labels for interleaved witness commitments, specialized per (BS, HasZK).
 * For BS=1: empty. For BS=4: populates string fields for transcript labeling.
 */
template <size_t BS, bool HasZK>
class MegaInterleavedCommitmentLabels_ : public MegaInterleavedWitnessCommitments_<std::string, BS, HasZK> {
  public:
    MegaInterleavedCommitmentLabels_() = default;
};

// BS=2, non-ZK
template <>
class MegaInterleavedCommitmentLabels_<2, false> : public MegaInterleavedWitnessCommitments_<std::string, 2, false> {
  public:
    MegaInterleavedCommitmentLabels_()
    {
        interleaved_wires = "INTERLEAVED_WIRES";
        interleaved_ecc_op_wires_1 = "INTERLEAVED_ECC_OP_WIRES_1";
        interleaved_ecc_op_wires_2 = "INTERLEAVED_ECC_OP_WIRES_2";
        interleaved_calldata = "INTERLEAVED_CALLDATA";
        interleaved_secondary_calldata = "INTERLEAVED_SECONDARY_CALLDATA";
        interleaved_calldata_tags = "INTERLEAVED_CALLDATA_TAGS";
        interleaved_scd_tags = "INTERLEAVED_SCD_TAGS";
        interleaved_return_data_tags = "INTERLEAVED_RETURN_DATA_TAGS";
        interleaved_return_data = "INTERLEAVED_RETURN_DATA";
        interleaved_w_o = "INTERLEAVED_W_O";
        interleaved_w_4 = "INTERLEAVED_W_4";
        interleaved_lookup = "INTERLEAVED_LOOKUP";
        interleaved_inverses_1 = "INTERLEAVED_INVERSES_1";
        interleaved_inverses_2 = "INTERLEAVED_INVERSES_2";
        interleaved_z_perm = "INTERLEAVED_Z_PERM";
    }
};

// BS=2, ZK (adds masking_commitment)
template <>
class MegaInterleavedCommitmentLabels_<2, true> : public MegaInterleavedWitnessCommitments_<std::string, 2, true> {
  public:
    MegaInterleavedCommitmentLabels_()
    {
        interleaved_wires = "INTERLEAVED_WIRES";
        interleaved_ecc_op_wires_1 = "INTERLEAVED_ECC_OP_WIRES_1";
        interleaved_ecc_op_wires_2 = "INTERLEAVED_ECC_OP_WIRES_2";
        interleaved_calldata = "INTERLEAVED_CALLDATA";
        interleaved_secondary_calldata = "INTERLEAVED_SECONDARY_CALLDATA";
        interleaved_calldata_tags = "INTERLEAVED_CALLDATA_TAGS";
        interleaved_scd_tags = "INTERLEAVED_SCD_TAGS";
        interleaved_return_data_tags = "INTERLEAVED_RETURN_DATA_TAGS";
        interleaved_return_data = "INTERLEAVED_RETURN_DATA";
        interleaved_w_o = "INTERLEAVED_W_O";
        interleaved_w_4 = "INTERLEAVED_W_4";
        interleaved_lookup = "INTERLEAVED_LOOKUP";
        interleaved_inverses_1 = "INTERLEAVED_INVERSES_1";
        interleaved_inverses_2 = "INTERLEAVED_INVERSES_2";
        interleaved_z_perm = "INTERLEAVED_Z_PERM";
        masking_commitment = "Gemini:masking_poly_comm";
    }
};

// BS=4, non-ZK
template <>
class MegaInterleavedCommitmentLabels_<4, false> : public MegaInterleavedWitnessCommitments_<std::string, 4, false> {
  public:
    MegaInterleavedCommitmentLabels_()
    {
        interleaved_wires = "INTERLEAVED_WIRES";
        interleaved_ecc_op_wires = "INTERLEAVED_ECC_OP_WIRES";
        interleaved_calldata = "INTERLEAVED_CALLDATA";
        interleaved_secondary_calldata = "INTERLEAVED_SECONDARY_CALLDATA";
        interleaved_databus_tags = "INTERLEAVED_DATABUS_TAGS";
        interleaved_return_data_tags = "INTERLEAVED_RETURN_DATA_TAGS";
        interleaved_return_data = "INTERLEAVED_RETURN_DATA";
        interleaved_w_4 = "INTERLEAVED_W_4";
        interleaved_lookup = "INTERLEAVED_LOOKUP";
        interleaved_inverses = "INTERLEAVED_INVERSES";
        interleaved_z_perm = "INTERLEAVED_Z_PERM";
    }
};

// BS=4, ZK (adds masking_commitment)
template <>
class MegaInterleavedCommitmentLabels_<4, true> : public MegaInterleavedWitnessCommitments_<std::string, 4, true> {
  public:
    MegaInterleavedCommitmentLabels_()
    {
        interleaved_wires = "INTERLEAVED_WIRES";
        interleaved_ecc_op_wires = "INTERLEAVED_ECC_OP_WIRES";
        interleaved_calldata = "INTERLEAVED_CALLDATA";
        interleaved_secondary_calldata = "INTERLEAVED_SECONDARY_CALLDATA";
        interleaved_databus_tags = "INTERLEAVED_DATABUS_TAGS";
        interleaved_return_data_tags = "INTERLEAVED_RETURN_DATA_TAGS";
        interleaved_return_data = "INTERLEAVED_RETURN_DATA";
        interleaved_w_4 = "INTERLEAVED_W_4";
        interleaved_lookup = "INTERLEAVED_LOOKUP";
        interleaved_inverses = "INTERLEAVED_INVERSES";
        interleaved_z_perm = "INTERLEAVED_Z_PERM";
        masking_commitment = "Gemini:masking_poly_comm";
    }
};

/**
 * @brief Labels for interleaved precomputed commitments, specialized per BS.
 * For BS=1: empty. For BS=4: populates 8 label fields.
 */
template <size_t BS>
class MegaInterleavedPrecomputedLabels_ : public MegaInterleavedPrecomputedCommitments_<std::string, BS> {
  public:
    MegaInterleavedPrecomputedLabels_() = default;
};

// BS=2
template <> class MegaInterleavedPrecomputedLabels_<2> : public MegaInterleavedPrecomputedCommitments_<std::string, 2> {
  public:
    MegaInterleavedPrecomputedLabels_()
    {
        interleaved_precomputed_0 = "INTERLEAVED_PRECOMPUTED_0";
        interleaved_precomputed_1 = "INTERLEAVED_PRECOMPUTED_1";
        interleaved_precomputed_2 = "INTERLEAVED_PRECOMPUTED_2";
        interleaved_precomputed_3 = "INTERLEAVED_PRECOMPUTED_3";
        interleaved_precomputed_4 = "INTERLEAVED_PRECOMPUTED_4";
        interleaved_precomputed_5 = "INTERLEAVED_PRECOMPUTED_5";
        interleaved_precomputed_6 = "INTERLEAVED_PRECOMPUTED_6";
        interleaved_precomputed_7 = "INTERLEAVED_PRECOMPUTED_7";
        interleaved_precomputed_8 = "INTERLEAVED_PRECOMPUTED_8";
        interleaved_precomputed_9 = "INTERLEAVED_PRECOMPUTED_9";
        interleaved_precomputed_10 = "INTERLEAVED_PRECOMPUTED_10";
        interleaved_precomputed_11 = "INTERLEAVED_PRECOMPUTED_11";
        interleaved_precomputed_12 = "INTERLEAVED_PRECOMPUTED_12";
        interleaved_precomputed_13 = "INTERLEAVED_PRECOMPUTED_13";
        interleaved_precomputed_14 = "INTERLEAVED_PRECOMPUTED_14";
        interleaved_precomputed_15 = "INTERLEAVED_PRECOMPUTED_15";
    }
};

// BS=4
template <> class MegaInterleavedPrecomputedLabels_<4> : public MegaInterleavedPrecomputedCommitments_<std::string, 4> {
  public:
    MegaInterleavedPrecomputedLabels_()
    {
        interleaved_precomputed_0 = "INTERLEAVED_PRECOMPUTED_0";
        interleaved_precomputed_1 = "INTERLEAVED_PRECOMPUTED_1";
        interleaved_precomputed_2 = "INTERLEAVED_PRECOMPUTED_2";
        interleaved_precomputed_3 = "INTERLEAVED_PRECOMPUTED_3";
        interleaved_precomputed_4 = "INTERLEAVED_PRECOMPUTED_4";
        interleaved_precomputed_5 = "INTERLEAVED_PRECOMPUTED_5";
        interleaved_precomputed_6 = "INTERLEAVED_PRECOMPUTED_6";
        interleaved_precomputed_7 = "INTERLEAVED_PRECOMPUTED_7";
    }
};

// ============================================================
// Lagrange basis computation (unified for all BS)
// ============================================================

/**
 * @brief Compute Lagrange basis evaluations for interleaving.
 * @details BS=1: trivially {1} (no interleaving challenges needed).
 *          BS=4: L₀(u₀,u₁) = (1-u₀)(1-u₁), L₁ = u₀(1-u₁), L₂ = (1-u₀)u₁, L₃ = u₀·u₁
 */
template <size_t BS, typename FF>
static std::array<FF, BS> compute_lagrange_basis_impl([[maybe_unused]] std::span<const FF> interleaving_challenges)
{
    if constexpr (BS == 1) {
        return { FF(1) };
    } else if constexpr (BS == 2) {
        const auto& u = interleaving_challenges[0];
        return { FF(1) - u, u };
    } else {
        static_assert(BS == 4, "Only BS=1, BS=2, and BS=4 are currently supported");
        const auto& u0 = interleaving_challenges[0];
        const auto& u1 = interleaving_challenges[1];
        auto one_minus_u0 = FF(1) - u0;
        auto one_minus_u1 = FF(1) - u1;
        return { one_minus_u0 * one_minus_u1, u0 * one_minus_u1, one_minus_u0 * u1, u0 * u1 };
    }
}

// ============================================================
// ============================================================
// Group accessors (BS-dependent, fully specialized)
// ============================================================

/**
 * @brief BS-specialized group accessors for PCS batching.
 * BS=1: each polynomial forms its own group of size 1 (identity interleaving).
 * BS=4: explicit interleaved groups of 4, with shiftable groups at the end.
 */
template <size_t BS> struct GroupAccessors_;

// BS=1: groups of size 1, built from entity accessors
template <> struct GroupAccessors_<1> {
    template <bool IsConst, typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<IsConst, T const*, T*>;
        using Group = std::vector<Ptr>;

        auto unshifted = e.get_unshifted();
        std::vector<Group> groups;
        groups.reserve(unshifted.size());
        for (size_t i = 0; i < unshifted.size(); ++i) {
            groups.push_back(Group{ static_cast<Ptr>(&unshifted[i]) });
        }
        return groups;
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;

        auto to_be_shifted = e.get_to_be_shifted();
        std::vector<Group> groups;
        groups.reserve(to_be_shifted.size());
        for (size_t i = 0; i < to_be_shifted.size(); ++i) {
            groups.push_back(Group{ &to_be_shifted[i] });
        }
        return groups;
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;

        auto shifted = e.get_shifted();
        std::vector<Group> groups;
        groups.reserve(shifted.size());
        for (size_t i = 0; i < shifted.size(); ++i) {
            groups.push_back(Group{ &shifted[i] });
        }
        return groups;
    }
};

// BS=2: explicit interleaved groups of 2
template <> struct GroupAccessors_<2> {
    /**
     * @brief Return interleaved groups of pointers into entities for PCS batching.
     * @details Order: 16 precomputed groups (P₁-P₁₆) + 15 witness groups.
     *          Shiftable groups (wires, w_o, w_4, z_perm) are placed at the end for REPEATED_COMMITMENTS.
     */
    template <bool IsConst, typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<IsConst, T const*, T*>;
        using Group = std::vector<Ptr>;
        return std::vector<Group>{
            // P₁-P₁₆: precomputed (sequential pairs of PrecomputedEntities)
            { &e.q_m, &e.q_c },
            { &e.q_l, &e.q_r },
            { &e.q_o, &e.q_4 },
            { &e.q_busread, &e.q_lookup },
            { &e.q_arith, &e.q_delta_range },
            { &e.q_elliptic, &e.q_memory },
            { &e.q_nnf, &e.q_poseidon2_external },
            { &e.q_poseidon2_internal, &e.sigma_1 },
            { &e.sigma_2, &e.sigma_3 },
            { &e.sigma_4, &e.id_1 },
            { &e.id_2, &e.id_3 },
            { &e.id_4, &e.table_1 },
            { &e.table_2, &e.table_3 },
            { &e.table_4, &e.lagrange_first },
            { &e.lagrange_last, &e.lagrange_ecc_op },
            { &e.databus_id, nullptr },
            // Unshiftable witness groups
            { &e.ecc_op_wire_1, &e.ecc_op_wire_2 },
            { &e.ecc_op_wire_3, &e.ecc_op_wire_4 },
            { &e.calldata, nullptr },
            { &e.secondary_calldata, nullptr },
            { &e.calldata_read_counts, &e.calldata_read_tags },
            { &e.secondary_calldata_read_counts, &e.secondary_calldata_read_tags },
            { &e.return_data_read_tags, &e.return_data_read_counts },
            { &e.return_data, nullptr },
            { &e.lookup_read_counts, &e.lookup_read_tags },
            { &e.lookup_inverses, &e.calldata_inverses },
            { &e.secondary_calldata_inverses, &e.return_data_inverses },
            // Shiftable witness groups at end
            { &e.w_l, &e.w_r },
            { &e.w_o, nullptr },
            { &e.w_4, nullptr },
            { &e.z_perm, nullptr },
        };
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l, &e.w_r },
            { &e.w_o, nullptr },
            { &e.w_4, nullptr },
            { &e.z_perm, nullptr },
        };
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l_shift, &e.w_r_shift },
            { &e.w_o_shift, nullptr },
            { &e.w_4_shift, nullptr },
            { &e.z_perm_shift, nullptr },
        };
    }
};

// BS=4: explicit interleaved groups
template <> struct GroupAccessors_<4> {
    /**
     * @brief Return interleaved groups of pointers into entities for PCS batching.
     * @details Order: 8 precomputed groups (P₁-P₈) + 11 witness groups (W₁-W₁₁).
     *          Shiftable groups (W₁, W₈, W₁₁) are placed at the end for REPEATED_COMMITMENTS.
     */
    template <bool IsConst, typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<IsConst, T const*, T*>;
        using Group = std::vector<Ptr>;
        return std::vector<Group>{
            // P₁-P₈: precomputed (sequential chunks of PrecomputedEntities)
            { &e.q_m, &e.q_c, &e.q_l, &e.q_r },
            { &e.q_o, &e.q_4, &e.q_busread, &e.q_lookup },
            { &e.q_arith, &e.q_delta_range, &e.q_elliptic, &e.q_memory },
            { &e.q_nnf, &e.q_poseidon2_external, &e.q_poseidon2_internal, &e.sigma_1 },
            { &e.sigma_2, &e.sigma_3, &e.sigma_4, &e.id_1 },
            { &e.id_2, &e.id_3, &e.id_4, &e.table_1 },
            { &e.table_2, &e.table_3, &e.table_4, &e.lagrange_first },
            { &e.lagrange_last, &e.lagrange_ecc_op, &e.databus_id, nullptr },
            // W₂-W₁₀: unshiftable witness groups
            { &e.ecc_op_wire_1, &e.ecc_op_wire_2, &e.ecc_op_wire_3, &e.ecc_op_wire_4 },
            { &e.calldata, nullptr, nullptr, nullptr },
            { &e.secondary_calldata, nullptr, nullptr, nullptr },
            { &e.calldata_read_counts,
              &e.calldata_read_tags,
              &e.secondary_calldata_read_counts,
              &e.secondary_calldata_read_tags },
            { &e.return_data_read_tags, &e.return_data_read_counts, nullptr, nullptr },
            { &e.return_data, nullptr, nullptr, nullptr },
            { &e.lookup_read_counts, &e.lookup_read_tags, nullptr, nullptr },
            { &e.lookup_inverses, &e.calldata_inverses, &e.secondary_calldata_inverses, &e.return_data_inverses },
            // W₁, W₈, W₁₁: shiftable witness groups at end
            { &e.w_l, &e.w_r, &e.w_o, nullptr },
            { &e.w_4, nullptr, nullptr, nullptr },
            { &e.z_perm, nullptr, nullptr, nullptr },
        };
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l, &e.w_r, &e.w_o, nullptr },
            { &e.w_4, nullptr, nullptr, nullptr },
            { &e.z_perm, nullptr, nullptr, nullptr },
        };
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l_shift, &e.w_r_shift, &e.w_o_shift, nullptr },
            { &e.w_4_shift, nullptr, nullptr, nullptr },
            { &e.z_perm_shift, nullptr, nullptr, nullptr },
        };
    }
};

// ============================================================
// Oink round group descriptors (BS-dependent)
// ============================================================

/**
 * @brief Describes a single group to commit in an Oink round.
 * @details Contains pointers to the entity polynomials (group members) and a transcript label.
 *          For BS=1, each group has one entity. For BS>1, groups have up to BS entities (with nullptr padding).
 */
template <typename Ptr> struct OinkGroupDescriptor {
    std::vector<Ptr> entities;
    std::string label;
};

/**
 * @brief Per-round witness group descriptors for Oink, specialized per BS.
 * @details Returns vectors of OinkGroupDescriptor for each oink round:
 *   - wires: w_l/w_r/w_o + ecc_op wires + databus entities (before eta)
 *   - lookup_and_w4: lookup counts/tags + w_4 (after eta)
 *   - inverses: lookup_inverses + databus inverses (after beta/gamma)
 *   - z_perm: z_perm (after grand product)
 *
 * Tail groups for ZK are obtained by calling the same methods on masking_tail_data.tails.
 */
template <size_t BS> struct OinkWitnessRounds_;

template <> struct OinkWitnessRounds_<1> {
    template <typename Entities> static auto wires(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        std::vector<D> groups = {
            { { &e.w_l }, "W_L" },
            { { &e.w_r }, "W_R" },
            { { &e.w_o }, "W_O" },
            { { &e.ecc_op_wire_1 }, "ECC_OP_WIRE_1" },
            { { &e.ecc_op_wire_2 }, "ECC_OP_WIRE_2" },
            { { &e.ecc_op_wire_3 }, "ECC_OP_WIRE_3" },
            { { &e.ecc_op_wire_4 }, "ECC_OP_WIRE_4" },
            { { &e.calldata }, "CALLDATA" },
            { { &e.calldata_read_counts }, "CALLDATA_READ_COUNTS" },
            { { &e.calldata_read_tags }, "CALLDATA_READ_TAGS" },
            { { &e.secondary_calldata }, "SECONDARY_CALLDATA" },
            { { &e.secondary_calldata_read_counts }, "SECONDARY_CALLDATA_READ_COUNTS" },
            { { &e.secondary_calldata_read_tags }, "SECONDARY_CALLDATA_READ_TAGS" },
            { { &e.return_data }, "RETURN_DATA" },
            { { &e.return_data_read_counts }, "RETURN_DATA_READ_COUNTS" },
            { { &e.return_data_read_tags }, "RETURN_DATA_READ_TAGS" },
        };
        return groups;
    }

    template <typename Entities> static auto lookup_and_w4(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.lookup_read_counts }, "LOOKUP_READ_COUNTS" },
            { { &e.lookup_read_tags }, "LOOKUP_READ_TAGS" },
            { { &e.w_4 }, "W_4" },
        };
    }

    template <typename Entities> static auto inverses(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.lookup_inverses }, "LOOKUP_INVERSES" },
            { { &e.calldata_inverses }, "CALLDATA_INVERSES" },
            { { &e.secondary_calldata_inverses }, "SECONDARY_CALLDATA_INVERSES" },
            { { &e.return_data_inverses }, "RETURN_DATA_INVERSES" },
        };
    }

    template <typename Entities> static auto z_perm(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.z_perm }, "Z_PERM" },
        };
    }
};

template <> struct OinkWitnessRounds_<2> {
  private:
    template <typename E>
    using Ptr = std::conditional_t<std::is_const_v<E>,
                                   std::decay_t<decltype(std::declval<E&>().get_all()[0])> const*,
                                   std::decay_t<decltype(std::declval<E&>().get_all()[0])>*>;
    template <typename E> using D = OinkGroupDescriptor<Ptr<E>>;

  public:
    // Overloads for entity-level types (ProverPolynomials, MaskingTailData::tails)
    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto wires(E& e)
    {
        return std::vector<D<E>>{
            { { &e.w_l, &e.w_r }, "INTERLEAVED_WIRES" },
            { { &e.ecc_op_wire_1, &e.ecc_op_wire_2 }, "INTERLEAVED_ECC_OP_WIRES_1" },
            { { &e.ecc_op_wire_3, &e.ecc_op_wire_4 }, "INTERLEAVED_ECC_OP_WIRES_2" },
            { { &e.calldata, nullptr }, "INTERLEAVED_CALLDATA" },
            { { &e.secondary_calldata, nullptr }, "INTERLEAVED_SECONDARY_CALLDATA" },
            { { &e.calldata_read_counts, &e.calldata_read_tags }, "INTERLEAVED_CALLDATA_TAGS" },
            { { &e.secondary_calldata_read_counts, &e.secondary_calldata_read_tags }, "INTERLEAVED_SCD_TAGS" },
            { { &e.return_data_read_tags, &e.return_data_read_counts }, "INTERLEAVED_RETURN_DATA_TAGS" },
            { { &e.return_data, nullptr }, "INTERLEAVED_RETURN_DATA" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto lookup_and_w4(E& e)
    {
        return std::vector<D<E>>{
            { { &e.lookup_read_counts, &e.lookup_read_tags }, "INTERLEAVED_LOOKUP" },
            { { &e.w_o, nullptr }, "INTERLEAVED_W_O" },
            { { &e.w_4, nullptr }, "INTERLEAVED_W_4" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto inverses(E& e)
    {
        return std::vector<D<E>>{
            { { &e.lookup_inverses, &e.calldata_inverses }, "INTERLEAVED_INVERSES_1" },
            { { &e.secondary_calldata_inverses, &e.return_data_inverses }, "INTERLEAVED_INVERSES_2" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto z_perm(E& e)
    {
        return std::vector<D<E>>{
            { { &e.z_perm, nullptr }, "INTERLEAVED_Z_PERM" },
        };
    }

    // Overloads for commitment-level types (InterleavedWitnessCommitments)
    template <typename E>
        requires requires(E& e) { e.interleaved_wires; }
    static auto wires(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_wires }, "INTERLEAVED_WIRES" },
            { { &e.interleaved_ecc_op_wires_1 }, "INTERLEAVED_ECC_OP_WIRES_1" },
            { { &e.interleaved_ecc_op_wires_2 }, "INTERLEAVED_ECC_OP_WIRES_2" },
            { { &e.interleaved_calldata }, "INTERLEAVED_CALLDATA" },
            { { &e.interleaved_secondary_calldata }, "INTERLEAVED_SECONDARY_CALLDATA" },
            { { &e.interleaved_calldata_tags }, "INTERLEAVED_CALLDATA_TAGS" },
            { { &e.interleaved_scd_tags }, "INTERLEAVED_SCD_TAGS" },
            { { &e.interleaved_return_data_tags }, "INTERLEAVED_RETURN_DATA_TAGS" },
            { { &e.interleaved_return_data }, "INTERLEAVED_RETURN_DATA" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_w_4; }
    static auto lookup_and_w4(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_lookup }, "INTERLEAVED_LOOKUP" },
            { { &e.interleaved_w_o }, "INTERLEAVED_W_O" },
            { { &e.interleaved_w_4 }, "INTERLEAVED_W_4" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_inverses_1; }
    static auto inverses(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_inverses_1 }, "INTERLEAVED_INVERSES_1" },
            { { &e.interleaved_inverses_2 }, "INTERLEAVED_INVERSES_2" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_z_perm; }
    static auto z_perm(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_z_perm }, "INTERLEAVED_Z_PERM" },
        };
    }
};

template <> struct OinkWitnessRounds_<4> {
  private:
    template <typename E>
    using Ptr = std::conditional_t<std::is_const_v<E>,
                                   std::decay_t<decltype(std::declval<E&>().get_all()[0])> const*,
                                   std::decay_t<decltype(std::declval<E&>().get_all()[0])>*>;
    template <typename E> using D = OinkGroupDescriptor<Ptr<E>>;

  public:
    // Overloads for entity-level types (ProverPolynomials, MaskingTailData::tails)
    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto wires(E& e)
    {
        return std::vector<D<E>>{
            { { &e.w_l, &e.w_r, &e.w_o, nullptr }, "INTERLEAVED_WIRES" },
            { { &e.ecc_op_wire_1, &e.ecc_op_wire_2, &e.ecc_op_wire_3, &e.ecc_op_wire_4 }, "INTERLEAVED_ECC_OP_WIRES" },
            { { &e.calldata, nullptr, nullptr, nullptr }, "INTERLEAVED_CALLDATA" },
            { { &e.secondary_calldata, nullptr, nullptr, nullptr }, "INTERLEAVED_SECONDARY_CALLDATA" },
            { { &e.calldata_read_counts,
                &e.calldata_read_tags,
                &e.secondary_calldata_read_counts,
                &e.secondary_calldata_read_tags },
              "INTERLEAVED_DATABUS_TAGS" },
            { { &e.return_data_read_tags, &e.return_data_read_counts, nullptr, nullptr },
              "INTERLEAVED_RETURN_DATA_TAGS" },
            { { &e.return_data, nullptr, nullptr, nullptr }, "INTERLEAVED_RETURN_DATA" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto lookup_and_w4(E& e)
    {
        return std::vector<D<E>>{
            { { &e.w_4, nullptr, nullptr, nullptr }, "INTERLEAVED_W_4" },
            { { &e.lookup_read_counts, &e.lookup_read_tags, nullptr, nullptr }, "INTERLEAVED_LOOKUP" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto inverses(E& e)
    {
        return std::vector<D<E>>{
            { { &e.lookup_inverses, &e.calldata_inverses, &e.secondary_calldata_inverses, &e.return_data_inverses },
              "INTERLEAVED_INVERSES" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto z_perm(E& e)
    {
        return std::vector<D<E>>{
            { { &e.z_perm, nullptr, nullptr, nullptr }, "INTERLEAVED_Z_PERM" },
        };
    }

    // Overloads for commitment-level types (InterleavedWitnessCommitments)
    template <typename E>
        requires requires(E& e) { e.interleaved_wires; }
    static auto wires(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_wires }, "INTERLEAVED_WIRES" },
            { { &e.interleaved_ecc_op_wires }, "INTERLEAVED_ECC_OP_WIRES" },
            { { &e.interleaved_calldata }, "INTERLEAVED_CALLDATA" },
            { { &e.interleaved_secondary_calldata }, "INTERLEAVED_SECONDARY_CALLDATA" },
            { { &e.interleaved_databus_tags }, "INTERLEAVED_DATABUS_TAGS" },
            { { &e.interleaved_return_data_tags }, "INTERLEAVED_RETURN_DATA_TAGS" },
            { { &e.interleaved_return_data }, "INTERLEAVED_RETURN_DATA" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_w_4; }
    static auto lookup_and_w4(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_w_4 }, "INTERLEAVED_W_4" },
            { { &e.interleaved_lookup }, "INTERLEAVED_LOOKUP" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_inverses; }
    static auto inverses(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_inverses }, "INTERLEAVED_INVERSES" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_z_perm; }
    static auto z_perm(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_z_perm }, "INTERLEAVED_Z_PERM" },
        };
    }
};

} // namespace bb
