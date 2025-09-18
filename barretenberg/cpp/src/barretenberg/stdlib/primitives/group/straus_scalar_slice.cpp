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
 * @brief Construct a new straus scalar slice::straus scalar slice object
 *
 * @details As part of slicing algorithm, we also perform a primality test on the input scalar.
 *
 * TODO(@zac-williamson) make the primality test configurable.
 * We may want to validate the input < BN254::Fr OR input < Grumpkin::Fr depending on context!
 *
 * @tparam Builder
 * @param context
 * @param scalar
 * @param table_bits
 */
template <typename Builder>
straus_scalar_slice<Builder>::straus_scalar_slice(Builder* context,
                                                  const cycle_scalar<Builder>& scalar,
                                                  const size_t table_bits)
    : _table_bits(table_bits)
{
    // convert an input cycle_scalar object into a vector of slices, each containing `table_bits` bits.
    // this also performs an implicit range check on the input slices
    const auto compute_scalar_slices =
        [&](const field_t& scalar, const size_t num_bits) -> std::pair<std::vector<field_t>, std::vector<uint64_t>> {
        const size_t num_slices = numeric::ceil_div(num_bits, table_bits);

        // we record the scalar slices both as field_t circuit elements and u64 values
        // (u64 values are used to index arrays and we don't want to repeatedly cast a stdlib value to a numeric
        // primitive as this gets expensive when repeated enough times)
        std::vector<field_t> stdlib_slices;
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
                stdlib_slices.push_back(field_t(slice_value)); // constants equal to slice_value
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
            const auto slice = field_t::from_witness_index(context, idx);
            stdlib_slices.push_back(slice);
            native_slices.push_back(static_cast<uint64_t>(slice.get_value()));
        }
        return { stdlib_slices, native_slices };
    };

    const size_t lo_bits =
        scalar.num_bits() > cycle_scalar<Builder>::LO_BITS ? cycle_scalar<Builder>::LO_BITS : scalar.num_bits();
    const size_t hi_bits =
        scalar.num_bits() > cycle_scalar<Builder>::LO_BITS ? scalar.num_bits() - cycle_scalar<Builder>::LO_BITS : 0;
    auto hi_slices = compute_scalar_slices(scalar.hi, hi_bits);
    auto lo_slices = compute_scalar_slices(scalar.lo, lo_bits);

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
template <typename Builder> field_t<Builder> straus_scalar_slice<Builder>::read(size_t index)
{
    BB_ASSERT_LT(index, slices.size(), "Straus scalar slice index out of bounds!");
    return slices[index];
}

template class straus_scalar_slice<bb::UltraCircuitBuilder>;
template class straus_scalar_slice<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
