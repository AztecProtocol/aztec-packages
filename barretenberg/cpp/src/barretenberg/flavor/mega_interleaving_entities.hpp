// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/flavor_macros.hpp"
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
        interleaved_masking,            // W₁₂: masking chunks - unshiftable
        interleaved_wires,              // W₁:  [w_l, w_r, w_o, 0] - shiftable
        interleaved_w_4,                // W₈:  [w_4, 0, 0, 0] - shiftable
        interleaved_z_perm)             // W₁₁: [z_perm, 0, 0, 0] - shiftable

    auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
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
// Interleaving constants (BS-dependent)
// ============================================================

template <size_t BS> struct MegaInterleavingConstants {
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = (BS == 1) ? 0 : 8;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = (BS == 1) ? 0 : 11;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = (BS == 1) ? 0 : 3;
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

// BS=4, ZK (adds interleaved_masking)
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
        interleaved_masking = "INTERLEAVED_MASKING";
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
// Lagrange basis computation
// ============================================================

/**
 * @brief Compute Lagrange basis evaluations for interleaving.
 * @details For k=2 (batch_size=4): L₀(u₀,u₁) = (1-u₀)(1-u₁), L₁ = u₀(1-u₁), L₂ = (1-u₀)u₁, L₃ = u₀·u₁
 */
template <size_t BS, typename FF>
static std::array<FF, BS> compute_mega_lagrange_basis(const FF& u0, const FF& u1)
    requires(BS == 4)
{
    auto one_minus_u0 = FF(1) - u0;
    auto one_minus_u1 = FF(1) - u1;
    return { one_minus_u0 * one_minus_u1, u0 * one_minus_u1, one_minus_u0 * u1, u0 * u1 };
}

// ============================================================
// Group accessors (for interleaved PCS, BS > 1 only)
// ============================================================

/**
 * @brief Return interleaved groups of pointers into entities for PCS batching.
 * @details Defines the mapping from individual polynomials/evaluations to interleaved groups.
 *          Works for both ProverPolynomials (DataType=Polynomial) and AllValues (DataType=FF).
 *          Order: 8 precomputed groups (P₁-P₈) + 11 witness groups (W₁-W₁₁).
 *          Shiftable groups (W₁, W₈, W₁₁) are placed at the end for REPEATED_COMMITMENTS.
 *
 * @tparam IsConst If true, returns const pointers (for read-only access).
 *                 If false, returns mutable pointers (for clearing after consumption).
 */
template <bool IsConst, typename Entities> static auto get_mega_unshifted_groups(Entities& e)
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

template <typename Entities> static auto get_mega_to_be_shifted_groups(Entities& e)
{
    using T = std::decay_t<decltype(e.w_l)>;
    using Group = std::vector<T const*>;
    return std::vector<Group>{
        { &e.w_l, &e.w_r, &e.w_o, nullptr },
        { &e.w_4, nullptr, nullptr, nullptr },
        { &e.z_perm, nullptr, nullptr, nullptr },
    };
}

template <typename Entities> static auto get_mega_shifted_groups(Entities& e)
{
    using T = std::decay_t<decltype(e.w_l)>;
    using Group = std::vector<T const*>;
    return std::vector<Group>{
        { &e.w_l_shift, &e.w_r_shift, &e.w_o_shift, nullptr },
        { &e.w_4_shift, nullptr, nullptr, nullptr },
        { &e.z_perm_shift, nullptr, nullptr, nullptr },
    };
}

} // namespace bb
