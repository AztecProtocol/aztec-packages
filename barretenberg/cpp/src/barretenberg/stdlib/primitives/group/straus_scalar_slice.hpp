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
 * @brief straus_scalar_slice decomposes an input scalar into `table_bits` bit-slices.
 * Used in `batch_mul`, which ses the Straus multiscalar multiplication algorithm.
 *
 */
template <typename Builder> class straus_scalar_slice {
  public:
    using field_t = stdlib::field_t<Builder>;

    straus_scalar_slice(Builder* context, const cycle_scalar<Builder>& scalars, size_t table_bits);
    field_t read(size_t index);
    size_t _table_bits;
    std::vector<field_t> slices;
    std::vector<uint64_t> slices_native;
};

} // namespace bb::stdlib
