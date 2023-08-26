#pragma once

#include <cstddef>
#include <cstdint>

namespace plookup {
struct FixedBaseParams {
    static constexpr size_t BITS_PER_TABLE = 9;
    static constexpr size_t BITS_ON_CURVE = 254;
    static constexpr size_t BITS_PER_LO_SCALAR = 128;
    static constexpr size_t BITS_PER_HI_SCALAR = BITS_ON_CURVE - BITS_PER_LO_SCALAR;
    static constexpr size_t MAX_TABLE_SIZE = (1UL) << BITS_PER_TABLE;
    static constexpr size_t MAX_NUM_TABLES_IN_MULTITABLE =
        (BITS_PER_LO_SCALAR / BITS_PER_TABLE) + (BITS_PER_LO_SCALAR % BITS_PER_TABLE == 0 ? 0 : 1);
    static constexpr size_t NUM_FIXED_BASE_MULTI_TABLES = 4;
    static constexpr size_t NUM_TABLES_PER_LO_MULTITABLE =
        (BITS_PER_LO_SCALAR / BITS_PER_TABLE) + ((BITS_PER_LO_SCALAR % BITS_PER_TABLE == 0) ? 0 : 1);
    static constexpr size_t NUM_TABLES_PER_HI_MULTITABLE =
        (BITS_PER_LO_SCALAR / BITS_PER_TABLE) + ((BITS_PER_LO_SCALAR % BITS_PER_TABLE == 0) ? 0 : 1);
    static constexpr size_t NUM_BASIC_TABLES_PER_BASE_POINT =
        (NUM_TABLES_PER_LO_MULTITABLE + NUM_TABLES_PER_HI_MULTITABLE);
    static constexpr size_t NUM_FIXED_BASE_BASIC_TABLES = NUM_BASIC_TABLES_PER_BASE_POINT * 2;

    template <size_t num_bits> inline static constexpr size_t get_num_tables_per_multi_table() noexcept
    {
        return (num_bits / BITS_PER_TABLE) + ((num_bits % BITS_PER_TABLE == 0) ? 0 : 1);
    }
    static constexpr size_t get_num_bits_of_multi_table(const size_t multitable_index)
    {
        const bool is_lo_multi_table = (multitable_index & 1) == 0;
        return is_lo_multi_table ? BITS_PER_LO_SCALAR : BITS_PER_HI_SCALAR;
    }
};
} // namespace plookup