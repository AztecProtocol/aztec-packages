#include "barretenberg/vm2/tracegen/range_check_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"

namespace bb::avm2::tracegen {

namespace {

enum class IsLte {
    IS_LTE_U16 = 0,
    IS_LTE_U32,
    IS_LTE_U48,
    IS_LTE_U64,
    IS_LTE_U80,
    IS_LTE_U96,
    IS_LTE_U112,
    IS_LTE_U128,
};

bool uses_register(uint8_t reg_index, IsLte is_lte)
{
    return reg_index >= static_cast<uint8_t>(is_lte);
}

} // namespace

void RangeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::RangeCheckEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        uint256_t value_u256 = uint256_t::from_uint128(event.value);
        uint8_t num_bits = 0;

        std::array<uint16_t, 7> fixed_slice_registers; // u16_r0...6
        // Enum representing which of is_lte_u* holds true.
        // Only one can be chosen/true for a given range check.
        // The highest X is chosen such that "value is lte X" holds true.
        IsLte is_lte = IsLte::IS_LTE_U16;
        uint16_t dynamic_slice_register = 0; // same as u16_r7
        uint16_t dynamic_bits = 0;

        // Split the value into 16-bit chunks
        for (size_t i = 0; i < 8; i++) {
            // The most significant 16-bits have to be placed in the dynamic slice register
            if (event.num_bits <= 16) {
                dynamic_slice_register = static_cast<uint16_t>(value_u256);
                // Set is_lte based on on how many 16 bit chunks have already been processed
                // For example, if this is the 0th, then IS_LTE_U16 is set
                // If this is the first, then IS_LTE_U32 is set, ...
                // TODO(dbanks12): is this more or less intuitive then the bit magic from before?
                is_lte = IsLte(i);
                dynamic_bits = event.num_bits;
                break;
            }
            // We have more chunks of 16-bits to operate on, so set the ith fixed register
            fixed_slice_registers[i] = static_cast<uint16_t>(value_u256);
            num_bits -= 16;
            value_u256 >>= 16;
        }

        auto dynamic_diff = static_cast<uint16_t>((1 << dynamic_bits) - dynamic_slice_register - 1);

        trace.set(row,
                  { {
                      { C::range_check_sel_rng_chk, 1 },
                      { C::range_check_value, value_u256 },
                      { C::range_check_rng_chk_bits, num_bits },
                      { C::range_check_is_lte_u16, is_lte == IsLte::IS_LTE_U16 ? 1 : 0 },
                      { C::range_check_is_lte_u32, is_lte == IsLte::IS_LTE_U32 ? 1 : 0 },
                      { C::range_check_is_lte_u48, is_lte == IsLte::IS_LTE_U48 ? 1 : 0 },
                      { C::range_check_is_lte_u64, is_lte == IsLte::IS_LTE_U64 ? 1 : 0 },
                      { C::range_check_is_lte_u80, is_lte == IsLte::IS_LTE_U80 ? 1 : 0 },
                      { C::range_check_is_lte_u96, is_lte == IsLte::IS_LTE_U96 ? 1 : 0 },
                      { C::range_check_is_lte_u112, is_lte == IsLte::IS_LTE_U112 ? 1 : 0 },
                      { C::range_check_is_lte_u128, is_lte == IsLte::IS_LTE_U128 ? 1 : 0 },
                      { C::range_check_u16_r0, fixed_slice_registers[0] },
                      { C::range_check_u16_r1, fixed_slice_registers[1] },
                      { C::range_check_u16_r2, fixed_slice_registers[2] },
                      { C::range_check_u16_r3, fixed_slice_registers[3] },
                      { C::range_check_u16_r4, fixed_slice_registers[4] },
                      { C::range_check_u16_r5, fixed_slice_registers[5] },
                      { C::range_check_u16_r6, fixed_slice_registers[6] },
                      { C::range_check_u16_r7, dynamic_slice_register },
                      { C::range_check_dyn_rng_chk_bits, dynamic_bits },
                      { C::range_check_dyn_rng_chk_pow_2, 1 << dynamic_bits },
                      { C::range_check_dyn_diff, dynamic_diff },

                      { C::range_check_sel_r0_16_bit_rng_lookup, uses_register(0, is_lte) },
                      { C::range_check_sel_r1_16_bit_rng_lookup, uses_register(1, is_lte) },
                      { C::range_check_sel_r2_16_bit_rng_lookup, uses_register(2, is_lte) },
                      { C::range_check_sel_r3_16_bit_rng_lookup, uses_register(3, is_lte) },
                      { C::range_check_sel_r4_16_bit_rng_lookup, uses_register(4, is_lte) },
                      { C::range_check_sel_r5_16_bit_rng_lookup, uses_register(5, is_lte) },
                      { C::range_check_sel_r6_16_bit_rng_lookup, uses_register(6, is_lte) },
                  } });

        row++;
    }
}

} // namespace bb::avm2::tracegen
