// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <array>
#include <barretenberg/common/assert.hpp>
#include <barretenberg/ecc/curves/bn254/fr.hpp>
#include <barretenberg/numeric/general/general.hpp>
#include <cstddef>
#include <cstdint>

namespace bb::plookup {
/**
 * @brief Parameters definitions for our fixed-base-scalar-multiplication lookup tables
 * @details  We split each 254-bit scalar mul into two scalar muls of size BITS_PER_LO_SCALAR, BITS_PER_HI_SCALAR. This
 * enables us to efficiently decompose our input scalar multiplier into two chunks of a known size (i.e. we get free
 * BITS_PER_LO_SCALAR, BITS_PER_HI_SCALAR range checks as part of the lookup table subroutine). This in turn allows us
 * to perform a primality test more efficiently, i.e. check that input scalar < prime modulus when evaluated over the
 * integers. (The primality check requires us to split the input into high / low bit chunks so getting this for free as
 * part of the lookup algorithm is nice!).
 */
struct FixedBaseParams {
    static constexpr size_t BITS_PER_TABLE = 9;
    static constexpr size_t BITS_ON_CURVE = 254;

    static constexpr size_t BITS_PER_LO_SCALAR = 128;
    static constexpr size_t BITS_PER_HI_SCALAR = BITS_ON_CURVE - BITS_PER_LO_SCALAR;
    // Max table size (Note: the last lookup table might be smaller if BITS_PER_TABLE does not neatly divide
    // BITS_PER_LO_SCALAR)
    static constexpr size_t MAX_TABLE_SIZE = (1UL) << BITS_PER_TABLE;
    // We create four Multitables, two for each supported base point (one for the LO_SCALAR, one for the HI_SCALAR)
    static constexpr size_t NUM_FIXED_BASE_MULTI_TABLES = 4;
    static constexpr size_t NUM_TABLES_PER_LO_MULTITABLE = numeric::ceil_div(BITS_PER_LO_SCALAR, BITS_PER_TABLE);
    static constexpr size_t NUM_TABLES_PER_HI_MULTITABLE = numeric::ceil_div(BITS_PER_HI_SCALAR, BITS_PER_TABLE);
    static constexpr size_t MAX_NUM_TABLES_IN_MULTITABLE =
        std::max(NUM_TABLES_PER_LO_MULTITABLE, NUM_TABLES_PER_HI_MULTITABLE);

    // Step sizes for BasicTable columns in fixed-base scalar multiplication
    // Column 1 contains the index, so step size varies with table size
    // Columns 2 and 3 (x, y coordinates) do not utilize the typical accumulator pattern --> step size is 0
    static inline const bb::fr COLUMN_2_STEP_SIZE = bb::fr(0);
    static inline const bb::fr COLUMN_3_STEP_SIZE = bb::fr(0);

    /**
     * @brief Returns the number of scalar mul bits we are traversing in multitable with the given index.
     *
     * @param multitable_index Ranges from 0 to NUM_FIXED_BASE_MULTI_TABLES - 1
     * @return constexpr size_t
     */
    template <size_t multitable_index> static constexpr size_t get_num_bits_of_multi_table()
    {
        static_assert(multitable_index < NUM_FIXED_BASE_MULTI_TABLES);
        // Even indices (0, 2) are LO_SCALAR tables, odd indices (1, 3) are HI_SCALAR tables
        return (multitable_index % 2 == 0) ? BITS_PER_LO_SCALAR : BITS_PER_HI_SCALAR;
    }
};
} // namespace bb::plookup
