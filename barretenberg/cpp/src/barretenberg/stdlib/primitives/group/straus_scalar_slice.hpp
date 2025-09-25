// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <optional>
#include <vector>

namespace bb::stdlib {

// Forward declarations
template <typename Builder> class cycle_group;
template <typename Builder> class cycle_scalar;

/**
 * @brief straus_scalar_slices decomposes an input scalar into bit-slices of size `table_bits`.
 * Used in `batch_mul`, which implements the Straus multiscalar multiplication algorithm.
 *
 */
template <typename Builder> class straus_scalar_slices {
  public:
    using field_t = stdlib::field_t<Builder>;

    straus_scalar_slices(Builder* context, const cycle_scalar<Builder>& scalars, size_t table_bits);
    field_t operator[](size_t index);
    size_t _table_bits;
    std::vector<field_t> slices;
    std::vector<uint64_t> slices_native;

  private:
    static std::pair<std::vector<field_t>, std::vector<uint64_t>> compute_scalar_slices(Builder* context,
                                                                                        const field_t& scalar,
                                                                                        size_t num_bits,
                                                                                        size_t table_bits);
};

} // namespace bb::stdlib
