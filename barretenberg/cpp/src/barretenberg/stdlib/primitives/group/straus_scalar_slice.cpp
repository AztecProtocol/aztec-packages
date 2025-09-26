// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./straus_scalar_slice.hpp"
#include "./cycle_scalar.hpp"
#include "barretenberg/numeric/general/general.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"

namespace bb::stdlib {

/**
 * @brief Convert an input cycle_scalar field element into a vector of bit-slices
 * @details Each slice contains `table_bits` bits. Also performs an implicit range check on the input slices via
 * decompose_into_default_range
 *
 * @tparam Builder
 * @param context The circuit builder
 * @param scalar The field element to decompose
 * @param num_bits Number of bits in the scalar
 * @param table_bits Number of bits per slice
 * @return pair of stdlib slices and native slices
 */
template <typename Builder>
std::pair<std::vector<field_t<Builder>>, std::vector<uint64_t>> straus_scalar_slices<Builder>::compute_scalar_slices(
    Builder* context, const field_t& scalar, const size_t num_bits, const size_t table_bits)
{
    using field_ct = stdlib::field_t<Builder>;
    const size_t num_slices = numeric::ceil_div(num_bits, table_bits);

    // We record the scalar slices both as field_t circuit elements and u64 values. (u64 values are used to index
    // arrays and we don't want to repeatedly cast a stdlib value to a numeric primitive as this gets expensive when
    // done repeatedly)
    std::vector<field_ct> stdlib_slices;
    std::vector<uint64_t> native_slices;
    stdlib_slices.reserve(num_slices);
    native_slices.reserve(num_slices);

    if (num_bits == 0) {
        return { stdlib_slices, native_slices };
    }
    // Case 1: If the scalar is constant, compute the slices natively
    if (scalar.is_constant()) {
        const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
        uint256_t raw_value = scalar.get_value();
        for (size_t i = 0; i < num_slices; ++i) {
            uint64_t slice_value = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
            stdlib_slices.push_back(field_ct(slice_value)); // constants equal to slice_value
            native_slices.push_back(slice_value);
            raw_value = raw_value >> table_bits;
        }
        return { stdlib_slices, native_slices };
    }

    // Case 2: If the scalar is non-constant, perform the decomposition in-circuit
    const auto slice_indices =
        context->decompose_into_default_range(scalar.get_normalized_witness_index(),
                                              num_bits,
                                              table_bits,
                                              "straus_scalar_slice decompose_into_default_range");
    for (auto const& idx : slice_indices) {
        const auto slice = field_ct::from_witness_index(context, idx);
        stdlib_slices.push_back(slice);
        native_slices.push_back(static_cast<uint64_t>(slice.get_value()));
    }
    return { stdlib_slices, native_slices };
}

/**
 * @brief Construct straus_scalar_slices from an input cycle_scalar and specified table_bits
 * @details Performs an in-circuit decomposition of the input cycle_scalar into bit-slices of size `table_bits`.
 *
 * @tparam Builder
 * @param context
 * @param scalar
 * @param table_bits
 */
template <typename Builder>
straus_scalar_slices<Builder>::straus_scalar_slices(Builder* context,
                                                    const cycle_scalar<Builder>& scalar,
                                                    const size_t table_bits)
    : _table_bits(table_bits)
{
    constexpr size_t LO_BITS = cycle_scalar<Builder>::LO_BITS;
    const size_t lo_bits = scalar.num_bits() > LO_BITS ? LO_BITS : scalar.num_bits();
    const size_t hi_bits = scalar.num_bits() > LO_BITS ? scalar.num_bits() - LO_BITS : 0;
    auto hi_slices = compute_scalar_slices(context, scalar.hi, hi_bits, table_bits);
    auto lo_slices = compute_scalar_slices(context, scalar.lo, lo_bits, table_bits);

    std::copy(lo_slices.first.begin(), lo_slices.first.end(), std::back_inserter(slices));
    std::copy(hi_slices.first.begin(), hi_slices.first.end(), std::back_inserter(slices));
    std::copy(lo_slices.second.begin(), lo_slices.second.end(), std::back_inserter(slices_native));
    std::copy(hi_slices.second.begin(), hi_slices.second.end(), std::back_inserter(slices_native));

    const auto tag = scalar.get_origin_tag();
    for (auto& element : slices) {
        // All slices need to have the same origin tag
        element.set_origin_tag(tag);
    }
}

/**
 * @brief Return a bit-slice associated with round `index`.
 *
 * @details In Straus algorithm, `index` is a known parameter, so no need for expensive lookup tables
 *
 * @tparam Builder
 * @param index
 * @return field_t<Builder>
 */
template <typename Builder> field_t<Builder> straus_scalar_slices<Builder>::operator[](size_t index)
{
    BB_ASSERT_LT(index, slices.size(), "Straus scalar slice index out of bounds!");
    return slices[index];
}

template class straus_scalar_slices<bb::UltraCircuitBuilder>;
template class straus_scalar_slices<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
