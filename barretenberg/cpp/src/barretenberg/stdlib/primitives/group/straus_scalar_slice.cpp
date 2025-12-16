// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./straus_scalar_slice.hpp"
#include "./cycle_scalar.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"

namespace bb::stdlib {

/**
 * @brief Construct a new straus scalar slice::straus scalar slice object
 *
 * @details As part of slicing algoirthm, we also perform a primality test on the inut scalar.
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
    using FF = typename Builder::FF;
    using witness_t = stdlib::witness_t<Builder>;

    constexpr bool IS_ULTRA = Builder::CIRCUIT_TYPE == CircuitType::ULTRA;

    // convert an input cycle_scalar object into a vector of slices, each containing `table_bits` bits.
    // this also performs an implicit range check on the input slices
    const auto slice_scalar = [&](const field_t& scalar, const size_t num_bits) {
        // we record the scalar slices both as field_t circuit elements and u64 values
        // (u64 values are used to index arrays and we don't want to repeatedly cast a stdlib value to a numeric
        // primitive as this gets expensive when repeated enough times)
        std::pair<std::vector<field_t>, std::vector<uint64_t>> result;
        result.first.reserve(static_cast<size_t>(1ULL) << table_bits);
        result.second.reserve(static_cast<size_t>(1ULL) << table_bits);

        if (num_bits == 0) {
            return result;
        }
        if (scalar.is_constant()) {
            const size_t num_slices = (num_bits + table_bits - 1) / table_bits;
            const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
            uint256_t raw_value = scalar.get_value();
            for (size_t i = 0; i < num_slices; ++i) {
                uint64_t slice_v = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
                result.first.push_back(field_t(slice_v));
                result.second.push_back(slice_v);
                raw_value = raw_value >> table_bits;
            }

            return result;
        }
        uint256_t raw_value = scalar.get_value();
        const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
        const size_t num_slices = (num_bits + table_bits - 1) / table_bits;
        for (size_t i = 0; i < num_slices; ++i) {
            uint64_t slice_v = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
            result.second.push_back(slice_v);
            raw_value = raw_value >> table_bits;
        }

        if constexpr (IS_ULTRA) {
            const auto slice_indices =
                context->decompose_into_default_range(scalar.get_normalized_witness_index(),
                                                      num_bits,
                                                      table_bits,
                                                      "straus_scalar_slice decompose_into_default_range");
            for (auto& idx : slice_indices) {
                result.first.emplace_back(field_t::from_witness_index(context, idx));
            }
        } else {
            for (size_t i = 0; i < num_slices; ++i) {
                uint64_t slice_v = result.second[i];
                field_t slice(witness_t(context, slice_v));

                context->create_range_constraint(
                    slice.get_witness_index(), table_bits, "straus_scalar_slice create_range_constraint");

                result.first.push_back(slice);
            }
            std::vector<field_t> linear_elements;
            FF scaling_factor = 1;
            for (size_t i = 0; i < num_slices; ++i) {
                linear_elements.emplace_back(result.first[i] * scaling_factor);
                scaling_factor += scaling_factor;
            }
            field_t::accumulate(linear_elements).assert_equal(scalar);
        }
        return result;
    };

    const size_t lo_bits =
        scalar.num_bits() > cycle_scalar<Builder>::LO_BITS ? cycle_scalar<Builder>::LO_BITS : scalar.num_bits();
    const size_t hi_bits =
        scalar.num_bits() > cycle_scalar<Builder>::LO_BITS ? scalar.num_bits() - cycle_scalar<Builder>::LO_BITS : 0;
    auto hi_slices = slice_scalar(scalar.hi, hi_bits);
    auto lo_slices = slice_scalar(scalar.lo, lo_bits);

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
