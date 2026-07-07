#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/generated/relations/perms_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/gadgets/keccakf1600.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {
using C = Column;

namespace {

// Mapping 2-dimensional array indices of state inputs to columns.
constexpr std::array<std::array<C, 5>, 5> STATE_IN_COLS = {
    {
        {
            C::keccakf1600_state_in_00,
            C::keccakf1600_state_in_01,
            C::keccakf1600_state_in_02,
            C::keccakf1600_state_in_03,
            C::keccakf1600_state_in_04,
        },
        {
            C::keccakf1600_state_in_10,
            C::keccakf1600_state_in_11,
            C::keccakf1600_state_in_12,
            C::keccakf1600_state_in_13,
            C::keccakf1600_state_in_14,
        },
        {
            C::keccakf1600_state_in_20,
            C::keccakf1600_state_in_21,
            C::keccakf1600_state_in_22,
            C::keccakf1600_state_in_23,
            C::keccakf1600_state_in_24,
        },
        {
            C::keccakf1600_state_in_30,
            C::keccakf1600_state_in_31,
            C::keccakf1600_state_in_32,
            C::keccakf1600_state_in_33,
            C::keccakf1600_state_in_34,
        },
        {
            C::keccakf1600_state_in_40,
            C::keccakf1600_state_in_41,
            C::keccakf1600_state_in_42,
            C::keccakf1600_state_in_43,
            C::keccakf1600_state_in_44,
        },
    },
};

// Mapping 2-dimensional array indices of theta xor intermediate value columns.
constexpr std::array<std::array<C, 4>, 5> THETA_XOR_COLS = {
    {
        {
            C::keccakf1600_theta_xor_01,
            C::keccakf1600_theta_xor_02,
            C::keccakf1600_theta_xor_03,
            C::keccakf1600_theta_xor_row_0,
        },
        {
            C::keccakf1600_theta_xor_11,
            C::keccakf1600_theta_xor_12,
            C::keccakf1600_theta_xor_13,
            C::keccakf1600_theta_xor_row_1,
        },
        {
            C::keccakf1600_theta_xor_21,
            C::keccakf1600_theta_xor_22,
            C::keccakf1600_theta_xor_23,
            C::keccakf1600_theta_xor_row_2,
        },
        {
            C::keccakf1600_theta_xor_31,
            C::keccakf1600_theta_xor_32,
            C::keccakf1600_theta_xor_33,
            C::keccakf1600_theta_xor_row_3,
        },
        {
            C::keccakf1600_theta_xor_41,
            C::keccakf1600_theta_xor_42,
            C::keccakf1600_theta_xor_43,
            C::keccakf1600_theta_xor_row_4,
        },
    },
};

// Mapping indices of theta_xor_row_rotl1 to their columns.
constexpr std::array<C, 5> THETA_XOR_ROW_ROTL1_COLS = {
    {
        C::keccakf1600_theta_xor_row_rotl1_0,
        C::keccakf1600_theta_xor_row_rotl1_1,
        C::keccakf1600_theta_xor_row_rotl1_2,
        C::keccakf1600_theta_xor_row_rotl1_3,
        C::keccakf1600_theta_xor_row_rotl1_4,
    },
};

// Mapping indices of theta_xor_row_msb to their columns.
constexpr std::array<C, 5> THETA_XOR_ROW_MSB_COLS = {
    {
        C::keccakf1600_theta_xor_row_msb_0,
        C::keccakf1600_theta_xor_row_msb_1,
        C::keccakf1600_theta_xor_row_msb_2,
        C::keccakf1600_theta_xor_row_msb_3,
        C::keccakf1600_theta_xor_row_msb_4,
    },
};

// Mapping indices of theta_combined_xor to their columns.
constexpr std::array<C, 5> THETA_COMBINED_XOR_COLS = {
    {
        C::keccakf1600_theta_combined_xor_0_,
        C::keccakf1600_theta_combined_xor_1_,
        C::keccakf1600_theta_combined_xor_2_,
        C::keccakf1600_theta_combined_xor_3_,
        C::keccakf1600_theta_combined_xor_4_,
    },
};

// Mapping indices of state_theta to their columns.
constexpr std::array<std::array<C, 5>, 5> STATE_THETA_COLS = {
    {
        {
            C::keccakf1600_state_theta_00,
            C::keccakf1600_state_theta_01,
            C::keccakf1600_state_theta_02,
            C::keccakf1600_state_theta_03,
            C::keccakf1600_state_theta_04,
        },
        {
            C::keccakf1600_state_theta_10,
            C::keccakf1600_state_theta_11,
            C::keccakf1600_state_theta_12,
            C::keccakf1600_state_theta_13,
            C::keccakf1600_state_theta_14,
        },
        {
            C::keccakf1600_state_theta_20,
            C::keccakf1600_state_theta_21,
            C::keccakf1600_state_theta_22,
            C::keccakf1600_state_theta_23,
            C::keccakf1600_state_theta_24,
        },
        {
            C::keccakf1600_state_theta_30,
            C::keccakf1600_state_theta_31,
            C::keccakf1600_state_theta_32,
            C::keccakf1600_state_theta_33,
            C::keccakf1600_state_theta_34,
        },
        {
            C::keccakf1600_state_theta_40,
            C::keccakf1600_state_theta_41,
            C::keccakf1600_state_theta_42,
            C::keccakf1600_state_theta_43,
            C::keccakf1600_state_theta_44,
        },
    },
};

// Mapping flattened indices to the range-checked limb column for each rotation.
// For rot <= 32: hi is range-checked. For rot > 32: low is range-checked.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> STATE_THETA_LIMB_COLS = {
    {
        C::keccakf1600_state_theta_low_01, // [0,1] rot=36 >32
        C::keccakf1600_state_theta_hi_02,  // [0,2] rot=3  <=32
        C::keccakf1600_state_theta_low_03, // [0,3] rot=41 >32
        C::keccakf1600_state_theta_hi_04,  // [0,4] rot=18 <=32
        C::keccakf1600_state_theta_hi_10,  // [1,0] rot=1  <=32
        C::keccakf1600_state_theta_low_11, // [1,1] rot=44 >32
        C::keccakf1600_state_theta_hi_12,  // [1,2] rot=10 <=32
        C::keccakf1600_state_theta_low_13, // [1,3] rot=45 >32
        C::keccakf1600_state_theta_hi_14,  // [1,4] rot=2  <=32
        C::keccakf1600_state_theta_low_20, // [2,0] rot=62 >32
        C::keccakf1600_state_theta_hi_21,  // [2,1] rot=6  <=32
        C::keccakf1600_state_theta_low_22, // [2,2] rot=43 >32
        C::keccakf1600_state_theta_hi_23,  // [2,3] rot=15 <=32
        C::keccakf1600_state_theta_low_24, // [2,4] rot=61 >32
        C::keccakf1600_state_theta_hi_30,  // [3,0] rot=28 <=32
        C::keccakf1600_state_theta_low_31, // [3,1] rot=55 >32
        C::keccakf1600_state_theta_hi_32,  // [3,2] rot=25 <=32
        C::keccakf1600_state_theta_hi_33,  // [3,3] rot=21 <=32
        C::keccakf1600_state_theta_low_34, // [3,4] rot=56 >32
        C::keccakf1600_state_theta_hi_40,  // [4,0] rot=27 <=32
        C::keccakf1600_state_theta_hi_41,  // [4,1] rot=20 <=32
        C::keccakf1600_state_theta_low_42, // [4,2] rot=39 >32
        C::keccakf1600_state_theta_hi_43,  // [4,3] rot=8  <=32
        C::keccakf1600_state_theta_hi_44,  // [4,4] rot=14 <=32
    },
};

// Mapping indices of state_rho to their columns.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> STATE_RHO_COLS = {
    {
        C::keccakf1600_state_rho_01, C::keccakf1600_state_rho_02, C::keccakf1600_state_rho_03,
        C::keccakf1600_state_rho_04, C::keccakf1600_state_rho_10, C::keccakf1600_state_rho_11,
        C::keccakf1600_state_rho_12, C::keccakf1600_state_rho_13, C::keccakf1600_state_rho_14,
        C::keccakf1600_state_rho_20, C::keccakf1600_state_rho_21, C::keccakf1600_state_rho_22,
        C::keccakf1600_state_rho_23, C::keccakf1600_state_rho_24, C::keccakf1600_state_rho_30,
        C::keccakf1600_state_rho_31, C::keccakf1600_state_rho_32, C::keccakf1600_state_rho_33,
        C::keccakf1600_state_rho_34, C::keccakf1600_state_rho_40, C::keccakf1600_state_rho_41,
        C::keccakf1600_state_rho_42, C::keccakf1600_state_rho_43, C::keccakf1600_state_rho_44,
    },
};

// Mapping indices of rho rotation constants and the corresponding constant columns.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> RHO_ROTATION_LEN_COLS = {
    {
        C::keccakf1600_rot_64_min_len_01, C::keccakf1600_rot_len_02,        C::keccakf1600_rot_64_min_len_03,
        C::keccakf1600_rot_len_04,        C::keccakf1600_rot_len_10,        C::keccakf1600_rot_64_min_len_11,
        C::keccakf1600_rot_len_12,        C::keccakf1600_rot_64_min_len_13, C::keccakf1600_rot_len_14,
        C::keccakf1600_rot_64_min_len_20, C::keccakf1600_rot_len_21,        C::keccakf1600_rot_64_min_len_22,
        C::keccakf1600_rot_len_23,        C::keccakf1600_rot_64_min_len_24, C::keccakf1600_rot_len_30,
        C::keccakf1600_rot_64_min_len_31, C::keccakf1600_rot_len_32,        C::keccakf1600_rot_len_33,
        C::keccakf1600_rot_64_min_len_34, C::keccakf1600_rot_len_40,        C::keccakf1600_rot_len_41,
        C::keccakf1600_rot_64_min_len_42, C::keccakf1600_rot_len_43,        C::keccakf1600_rot_len_44,
    },
};

// Mapping indices of "pi not" values to their columns
constexpr std::array<std::array<C, 5>, 5> STATE_PI_NOT_COLS = {
    {
        {
            C::keccakf1600_state_pi_not_00,
            C::keccakf1600_state_pi_not_01,
            C::keccakf1600_state_pi_not_02,
            C::keccakf1600_state_pi_not_03,
            C::keccakf1600_state_pi_not_04,
        },
        {
            C::keccakf1600_state_pi_not_10,
            C::keccakf1600_state_pi_not_11,
            C::keccakf1600_state_pi_not_12,
            C::keccakf1600_state_pi_not_13,
            C::keccakf1600_state_pi_not_14,
        },
        {
            C::keccakf1600_state_pi_not_20,
            C::keccakf1600_state_pi_not_21,
            C::keccakf1600_state_pi_not_22,
            C::keccakf1600_state_pi_not_23,
            C::keccakf1600_state_pi_not_24,
        },
        {
            C::keccakf1600_state_pi_not_30,
            C::keccakf1600_state_pi_not_31,
            C::keccakf1600_state_pi_not_32,
            C::keccakf1600_state_pi_not_33,
            C::keccakf1600_state_pi_not_34,
        },
        {
            C::keccakf1600_state_pi_not_40,
            C::keccakf1600_state_pi_not_41,
            C::keccakf1600_state_pi_not_42,
            C::keccakf1600_state_pi_not_43,
            C::keccakf1600_state_pi_not_44,
        },
    },
};

// Mapping indices of "pi and" values to their columns
constexpr std::array<std::array<C, 5>, 5> STATE_PI_AND_COLS = {
    {
        {
            C::keccakf1600_state_pi_and_00,
            C::keccakf1600_state_pi_and_01,
            C::keccakf1600_state_pi_and_02,
            C::keccakf1600_state_pi_and_03,
            C::keccakf1600_state_pi_and_04,
        },
        {
            C::keccakf1600_state_pi_and_10,
            C::keccakf1600_state_pi_and_11,
            C::keccakf1600_state_pi_and_12,
            C::keccakf1600_state_pi_and_13,
            C::keccakf1600_state_pi_and_14,
        },
        {
            C::keccakf1600_state_pi_and_20,
            C::keccakf1600_state_pi_and_21,
            C::keccakf1600_state_pi_and_22,
            C::keccakf1600_state_pi_and_23,
            C::keccakf1600_state_pi_and_24,
        },
        {
            C::keccakf1600_state_pi_and_30,
            C::keccakf1600_state_pi_and_31,
            C::keccakf1600_state_pi_and_32,
            C::keccakf1600_state_pi_and_33,
            C::keccakf1600_state_pi_and_34,
        },
        {
            C::keccakf1600_state_pi_and_40,
            C::keccakf1600_state_pi_and_41,
            C::keccakf1600_state_pi_and_42,
            C::keccakf1600_state_pi_and_43,
            C::keccakf1600_state_pi_and_44,
        },
    },
};

// Mapping indices of chi values to their columns
constexpr std::array<std::array<C, 5>, 5> STATE_CHI_COLS = {
    {
        {
            C::keccakf1600_state_chi_00,
            C::keccakf1600_state_chi_01,
            C::keccakf1600_state_chi_02,
            C::keccakf1600_state_chi_03,
            C::keccakf1600_state_chi_04,
        },
        {
            C::keccakf1600_state_chi_10,
            C::keccakf1600_state_chi_11,
            C::keccakf1600_state_chi_12,
            C::keccakf1600_state_chi_13,
            C::keccakf1600_state_chi_14,
        },
        {
            C::keccakf1600_state_chi_20,
            C::keccakf1600_state_chi_21,
            C::keccakf1600_state_chi_22,
            C::keccakf1600_state_chi_23,
            C::keccakf1600_state_chi_24,
        },
        {
            C::keccakf1600_state_chi_30,
            C::keccakf1600_state_chi_31,
            C::keccakf1600_state_chi_32,
            C::keccakf1600_state_chi_33,
            C::keccakf1600_state_chi_34,
        },
        {
            C::keccakf1600_state_chi_40,
            C::keccakf1600_state_chi_41,
            C::keccakf1600_state_chi_42,
            C::keccakf1600_state_chi_43,
            C::keccakf1600_state_chi_44,
        },
    },
};

// Mapping 1-dimensional array indices of read/write memory slice values to columns.
constexpr std::array<C, AVM_KECCAKF1600_STATE_SIZE> MEM_VAL_COLS = {
    {
        C::keccak_memory_val_0_,  C::keccak_memory_val_1_,  C::keccak_memory_val_2_,  C::keccak_memory_val_3_,
        C::keccak_memory_val_4_,  C::keccak_memory_val_5_,  C::keccak_memory_val_6_,  C::keccak_memory_val_7_,
        C::keccak_memory_val_8_,  C::keccak_memory_val_9_,  C::keccak_memory_val_10_, C::keccak_memory_val_11_,
        C::keccak_memory_val_12_, C::keccak_memory_val_13_, C::keccak_memory_val_14_, C::keccak_memory_val_15_,
        C::keccak_memory_val_16_, C::keccak_memory_val_17_, C::keccak_memory_val_18_, C::keccak_memory_val_19_,
        C::keccak_memory_val_20_, C::keccak_memory_val_21_, C::keccak_memory_val_22_, C::keccak_memory_val_23_,
        C::keccak_memory_val_24_,
    },
};

/**
 * @brief Return the field inverse of @p index from a static cache of precomputed inverses.
 *
 * Indices 0..AVM_KECCAKF1600_STATE_SIZE are supported. The inverse of 0 is 0
 * (batch_invert convention).
 */
const FF& get_precomputed_inverse(size_t index)
{
    static const std::array<FF, AVM_KECCAKF1600_STATE_SIZE + 1> precomputed_inverses = []() {
        std::array<FF, AVM_KECCAKF1600_STATE_SIZE + 1> inverses;
        for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE + 1; i++) {
            inverses.at(i) = FF(i);
        }
        FF::batch_invert(inverses);
        return inverses;
    }();

    return precomputed_inverses.at(index);
}

} // namespace

/**
 * @brief Populate a single memory-slice (read or write) for one event.
 *
 * Generates one row per state word. On a read with a tag error, stops at the first
 * offending word. Uses the "triangle" pattern: row i sets val[0]..val[N-1-i] with
 * slice values shifted by i.
 *
 * @param event The keccakf1600 event containing memory values and error info.
 * @param write Whether this is a write slice (true) or read slice (false).
 * @param row   Current row index (updated in-place).
 * @param trace Trace to populate.
 */
void KeccakF1600TraceBuilder::process_single_slice(const simulation::KeccakF1600Event& event,
                                                   bool write,
                                                   uint32_t& row,
                                                   TraceContainer& trace)
{
    std::array<bool, AVM_KECCAKF1600_STATE_SIZE> single_tag_errors;
    single_tag_errors.fill(false);
    std::array<MemoryTag, AVM_KECCAKF1600_STATE_SIZE> tags;
    tags.fill(MemoryTag::U64);

    // The effective number of rows to populate. In case of a tag error, we only populate
    // the rows up to where the tag error occurred.
    size_t num_rows = AVM_KECCAKF1600_STATE_SIZE;

    // The relevant state and read/write memory values depending on read/write boolean.
    std::array<FF, AVM_KECCAKF1600_STATE_SIZE> slice_ff;
    if (write) {
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 5; j++) {
                // Standard Keccak layout: memory[(5 * j) + i] = A[i][j].
                slice_ff[(5 * j) + i] = event.rounds[AVM_KECCAKF1600_NUM_ROUNDS - 1].state_chi[i][j];
            }
        }
        slice_ff[0] = event.rounds[AVM_KECCAKF1600_NUM_ROUNDS - 1].state_iota_00;
    } else {
        // While reading we need to check the tag for each slice value.
        for (size_t k = 0; k < AVM_KECCAKF1600_STATE_SIZE; k++) {
            const auto& mem_val = event.src_mem_values[k];
            slice_ff[k] = mem_val.as_ff();
            tags[k] = mem_val.get_tag();
            if (tags[k] != MemoryTag::U64) {
                single_tag_errors.at(k) = true;
                num_rows = k + 1;
                break;
            }
        }
    }

    std::array<bool, AVM_KECCAKF1600_STATE_SIZE> tag_errors;
    tag_errors.fill(single_tag_errors.at(num_rows - 1));

    MemoryAddress addr = write ? event.dst_addr : event.src_addr;

    for (size_t i = 0; i < num_rows; i++) {

        trace.set(
            row,
            { {
                { C::keccak_memory_sel, 1 },
                { C::keccak_memory_clk, event.execution_clk },
                { C::keccak_memory_ctr, i + 1 },
                { C::keccak_memory_state_size_min_ctr_inv,
                  get_precomputed_inverse(AVM_KECCAKF1600_STATE_SIZE - i - 1) },
                { C::keccak_memory_start_read, (i == 0 && !write) ? 1 : 0 },
                { C::keccak_memory_start_write, (i == 0 && write) ? 1 : 0 },
                { C::keccak_memory_ctr_end, i == AVM_KECCAKF1600_STATE_SIZE - 1 ? 1 : 0 },
                { C::keccak_memory_end, (i == AVM_KECCAKF1600_STATE_SIZE - 1) || single_tag_errors.at(i) ? 1 : 0 },
                { C::keccak_memory_rw, write ? 1 : 0 },
                { C::keccak_memory_addr, addr + i },
                { C::keccak_memory_space_id, event.space_id },
                { C::keccak_memory_tag, static_cast<uint8_t>(tags[i]) },
                { C::keccak_memory_tag_min_u64_inv, // No need to batch invert for an exception case.
                  single_tag_errors.at(i)
                      ? (FF(static_cast<uint8_t>(tags[i])) - FF(static_cast<uint8_t>(MemoryTag::U64))).invert()
                      : 0 },
                { C::keccak_memory_single_tag_error, single_tag_errors.at(i) ? 1 : 0 },
                { C::keccak_memory_tag_error, tag_errors.at(i) ? 1 : 0 },
            } });

        // We get a "triangle" when shifting values to their columns from val_0_ bottom-up.
        for (size_t j = i; j < num_rows; j++) {
            trace.set(MEM_VAL_COLS.at(j - i), row, slice_ff[j]);
        }

        row++;
    }
}

/**
 * @brief Populate the keccakf1600 sub-trace from permutation events.
 *
 * For each event, generates 24 rows (one per round) on the happy path, or a single row
 * when an error (out-of-range or tag error) occurred.
 *
 * @param events Container of KeccakF1600Event produced by simulation.
 * @param trace  Trace to populate.
 */
void KeccakF1600TraceBuilder::process_permutation(
    const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events, TraceContainer& trace)
{
    constexpr MemoryAddress HIGHEST_SLICE_ADDRESS = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 1;

    uint32_t row = 1;
    for (const auto& event : events) {
        const bool out_of_range = event.src_out_of_range || event.dst_out_of_range;
        const bool error = out_of_range || event.tag_error;

        for (size_t round_idx = 0; round_idx == 0 || (!error && round_idx < AVM_KECCAKF1600_NUM_ROUNDS); round_idx++) {
            const auto& round_data = event.rounds[round_idx];

            // Setting the selector, xor operation id, and operation id, round, round cst
            trace.set(row,
                      { {
                          { C::keccakf1600_sel, 1 },
                          { C::keccakf1600_clk, event.execution_clk },
                          { C::keccakf1600_bitwise_xor_op_id, static_cast<uint8_t>(BitwiseOperation::XOR) },
                          { C::keccakf1600_bitwise_and_op_id, static_cast<uint8_t>(BitwiseOperation::AND) },
                          { C::keccakf1600_tag_u64, static_cast<uint8_t>(MemoryTag::U64) },
                          { C::keccakf1600_round, round_idx + 1 }, // round is 1-indexed
                          { C::keccakf1600_round_cst, simulation::keccak_round_constants[round_idx] },
                      } });

            // Setting the rotation length constants
            // If the constant is <= 32, we set it in the column.
            // Otherwise, we set 64 - constant.
            for (size_t k = 1; k < 25; k++) {
                const size_t i = k / 5;
                const size_t j = k % 5;
                const auto rotation_len = simulation::keccak_rotation_len[i][j];
                const auto value = rotation_len <= 32 ? rotation_len : 64 - rotation_len;
                trace.set(RHO_ROTATION_LEN_COLS.at(k - 1), row, value);
            }

            // Selectors start and last.
            // src_address required on first row
            if (round_idx == 0) {
                trace.set(
                    row,
                    { {
                        { C::keccakf1600_start, 1 },
                        { C::keccakf1600_highest_slice_address, HIGHEST_SLICE_ADDRESS },
                        { C::keccakf1600_src_addr, event.src_addr },
                        { C::keccakf1600_src_out_of_range_error, event.src_out_of_range ? 1 : 0 },
                        { C::keccakf1600_dst_out_of_range_error, event.dst_out_of_range ? 1 : 0 },
                        { C::keccakf1600_tag_error, event.tag_error ? 1 : 0 },
                        { C::keccakf1600_sel_slice_read, out_of_range ? 0 : 1 },
                        { C::keccakf1600_error, error ? 1 : 0 },
                        { C::keccakf1600_end, error ? 1 : 0 }, // We set end at the initial row when there is an error.
                                                               // Note that the loop will stop after the initial round.
                    } });

            } else if (round_idx == AVM_KECCAKF1600_NUM_ROUNDS - 1) {
                trace.set(row,
                          { {
                              { C::keccakf1600_end, 1 },
                              { C::keccakf1600_sel_slice_write, error ? 0 : 1 },
                          } });
            };

            // dst_address, sel_no_error, space_id are required at every row as we propagate
            // for the slice memory write lookup.
            trace.set(row,
                      { {
                          { C::keccakf1600_dst_addr, event.dst_addr },
                          { C::keccakf1600_sel_no_error, error ? 0 : 1 },
                          { C::keccakf1600_space_id, event.space_id },
                      } });

            // When no out-of-range value occured but a tag value error, we
            // need to set the initial state values in the first round.
            if (!out_of_range && event.tag_error && round_idx == 0) {
                for (size_t k = 0; k < AVM_KECCAKF1600_STATE_SIZE; k++) {
                    const size_t i = k % 5; // Keccak layout: memory[k] = A[k%5][k/5]
                    const size_t j = k / 5;
                    // In simulation we set src_mem_values[i][j] to be the memory value when
                    // tag is U64, otherwise we set it to zero.
                    trace.set(STATE_IN_COLS[i][j], row, event.src_mem_values[k]);
                }
            }

            // When there is no error we set state values completely.
            if (!error) {
                // Setting state inputs in their corresponding colums
                for (size_t i = 0; i < 5; i++) {
                    for (size_t j = 0; j < 5; j++) {
                        trace.set(STATE_IN_COLS[i][j], row, round_data.state[i][j]);
                    }
                }

                // Setting theta xor values to their corresponding columns
                for (size_t i = 0; i < 5; i++) {
                    for (size_t j = 0; j < 4; j++) {
                        trace.set(THETA_XOR_COLS[i][j], row, round_data.theta_xor[i][j]);
                    }
                }

                // Setting theta xor final values left rotated by 1 and the msb values.
                // Setting theta_combined_xor values
                for (size_t i = 0; i < 5; i++) {
                    const auto theta_xor_row_rotl1 = round_data.theta_xor_row_rotl1[i];
                    const auto theta_xor_row_msb = theta_xor_row_rotl1 & 1; // lsb of the rotated value

                    trace.set(row,
                              { {
                                  { THETA_XOR_ROW_ROTL1_COLS[i], theta_xor_row_rotl1 },
                                  { THETA_XOR_ROW_MSB_COLS[i], theta_xor_row_msb },
                                  { THETA_COMBINED_XOR_COLS[i], round_data.theta_combined_xor[i] },
                              } });
                }

                // Setting state_theta values
                for (size_t i = 0; i < 5; i++) {
                    for (size_t j = 0; j < 5; j++) {
                        trace.set(STATE_THETA_COLS[i][j], row, round_data.state_theta[i][j]);
                    }
                }

                // Setting the range-checked limb and state_rho values.
                // For rot <= 32: keep hi = state_theta >> (64 - rot).
                // For rot > 32: keep low = state_theta & ((1 << (64 - rot)) - 1).
                for (size_t k = 1; k < 25; k++) {
                    const size_t i = k / 5;
                    const size_t j = k % 5;
                    const auto rotation_len = simulation::keccak_rotation_len[i][j];
                    const size_t low_num_bits = 64 - rotation_len;
                    const auto state_theta_val = round_data.state_theta[i][j];
                    const auto range_checked_limb = rotation_len <= 32
                                                        ? state_theta_val >> low_num_bits                 // hi
                                                        : state_theta_val & ((1ULL << low_num_bits) - 1); // low

                    trace.set(row,
                              { {
                                  { STATE_THETA_LIMB_COLS[k - 1], range_checked_limb },
                                  { STATE_RHO_COLS[k - 1], round_data.state_rho[i][j] },
                              } });
                }

                // Setting "pi not", "pi and", and "chi" values
                for (size_t i = 0; i < 5; i++) {
                    for (size_t j = 0; j < 5; j++) {
                        trace.set(row,
                                  { {
                                      { STATE_PI_NOT_COLS[i][j], round_data.state_pi_not[i][j] },
                                      { STATE_PI_AND_COLS[i][j], round_data.state_pi_and[i][j] },
                                      { STATE_CHI_COLS[i][j], round_data.state_chi[i][j] },
                                  } });
                    }
                }

                // Setting iota_00
                trace.set(C::keccakf1600_state_iota_00, row, round_data.state_iota_00);
            }
            row++;
        }
    }
}

/**
 * @brief Populate the keccak_memory sub-trace for read/write memory slices.
 *
 * Skips events with out-of-range errors entirely. For tag-error events only the read slice
 * is populated (up to the offending index). For success events both read and write slices
 * are populated (25 rows each).
 *
 * @param events Container of KeccakF1600Event produced by simulation.
 * @param trace  Trace to populate.
 */
void KeccakF1600TraceBuilder::process_memory_slices(
    const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events, TraceContainer& trace)
{
    uint32_t row = 1;
    for (const auto& event : events) {
        // Skip the event if there is an out of range error.
        // Namely, in this case the lookups to the memory slice are inactive.
        if (!event.src_out_of_range && !event.dst_out_of_range) {
            process_single_slice(event, /* write */ false, row, trace);

            // Write to memory slice is only active if there is no tag error.
            if (!event.tag_error) {
                process_single_slice(event, /* write */ true, row, trace);
            }
        }
    }
}

const InteractionDefinition KeccakF1600TraceBuilder::interactions =
    InteractionDefinition()
        // Theta XOR values
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_simd_01_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_simd_21_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_41_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_simd_02_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_simd_22_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_42_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_simd_03_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_simd_23_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_43_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_row_simd_0_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_row_simd_2_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_xor_row_4_settings>(C::bitwise_sel)
        // Theta XOR combined values
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_combined_xor_simd_0_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_combined_xor_simd_2_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_combined_xor_4_settings>(C::bitwise_sel)
        // State Theta final values
        // state_theta: 12 SIMD-64 pairs (claimed via bitwise.sel_simd_64) + 1 scalar (lane 44).
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_00_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_02_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_04_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_11_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_13_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_20_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_22_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_24_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_31_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_33_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_40_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_simd_42_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_theta_44_settings>(C::bitwise_sel)
        // Range check on some state theta limbs
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_01_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_02_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_03_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_04_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_10_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_11_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_12_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_13_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_14_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_20_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_21_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_22_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_23_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_24_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_30_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_31_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_32_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_33_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_34_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_40_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_41_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_42_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_43_range_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_theta_limb_44_range_settings>(C::range_check_sel)
        // "pi and" values
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_00_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_02_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_04_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_11_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_13_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_20_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_22_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_24_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_31_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_33_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_40_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_simd_42_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_pi_and_44_settings>(C::bitwise_sel)
        // chi values
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_00_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_02_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_04_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_11_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_13_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_20_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_22_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_24_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_31_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_33_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_40_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_simd_42_settings>()
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_chi_44_settings>(C::bitwise_sel)
        // iota_00
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_state_iota_00_settings>(C::bitwise_sel)
        // round constants lookup
        .add<InteractionType::LookupIntoIndexedByRow, lookup_keccakf1600_round_cst_settings>()
        // Memory slices permutations
        .add<InteractionType::Permutation, perm_keccakf1600_read_to_slice_settings>()
        .add<InteractionType::Permutation, perm_keccakf1600_write_to_slice_settings>()
        // GT checks for slice memory ranges.
        // GT checks are de-duplicated and therefore we can't use the interaction builder
        // LookupIntoDynamicTableSequential.
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_src_out_of_range_toggle_settings>(C::gt_sel)
        .add<InteractionType::LookupGeneric, lookup_keccakf1600_dst_out_of_range_toggle_settings>(C::gt_sel);

} // namespace bb::avm2::tracegen
