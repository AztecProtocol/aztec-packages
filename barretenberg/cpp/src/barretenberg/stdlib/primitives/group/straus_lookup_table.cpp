// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./straus_lookup_table.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

/**
 * @brief Compute the output points generated when computing the Straus lookup table
 * @details When performing an MSM, we first compute all the witness values as Element types (with a Z-coordinate),
 *          and then we batch-convert the points into affine representation `AffineElement`
 *          This avoids the need to compute a modular inversion for every group operation,
 *          which dramatically cuts witness generation times
 *
 * @tparam Builder
 * @param base_point
 * @param offset_generator
 * @param table_bits
 * @return std::vector<typename straus_lookup_table<Builder>::Element>
 */
template <typename Builder>
std::vector<typename straus_lookup_table<Builder>::Element> straus_lookup_table<Builder>::compute_native_table(
    const Element& base_point, const Element& offset_generator, size_t table_bits)
{
    const size_t table_size = 1UL << table_bits;
    std::vector<Element> hints;
    hints.emplace_back(offset_generator);
    for (size_t i = 1; i < table_size; ++i) {
        hints.emplace_back(hints[i - 1] + base_point);
    }
    return hints;
}

/**
 * @brief Construct a new straus lookup table object
 * @details Table is a length `N = 1 << table_bits` ROM-array containing the points:
 * { [G] + 0.[P], [G] + 1.[P], ..., [G] + (N - 1).[P] }
 *
 * @tparam Builder
 * @param context
 * @param base_point
 * @param offset_generator
 * @param table_bits
 */
template <typename Builder>
straus_lookup_table<Builder>::straus_lookup_table(Builder* context,
                                                  const cycle_group<Builder>& base_point,
                                                  const cycle_group<Builder>& offset_generator,
                                                  size_t table_bits,
                                                  std::optional<std::span<AffineElement>> hints)
    : _context(context)
    , tag(OriginTag(base_point.get_origin_tag(), offset_generator.get_origin_tag()))
{
    const size_t table_size = 1UL << table_bits;
    std::vector<cycle_group<Builder>> point_table;
    point_table.resize(table_size);

    // We want to support the case where input points are points at infinity.
    // If base point is at infinity, we want every point in the table to just be `generator_point`.
    // We achieve this via the following:
    // 1: We create a "work_point" that is base_point if not at infinity, else it is set (arbitrarily) to "one"
    // 2: When computing the point table, we use "work_point" in additions instead of the "base_point" (to prevent
    //    x-coordinate collisions in honest case) 3: When assigning to the point table, we conditionally assign either
    //    the output of the point addition (if not at infinity) or the generator point (if at infinity)
    // 3: If point at infinity, conditionally (re)assign each entry in the table to be equal to the offset
    //    generator so that the final table is genuninely correct in all cases. (Otherwise, the table is unchanged
    //    from step 2)
    cycle_group<Builder> fallback_point(Group::affine_one);
    field_t modded_x = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.x, base_point.x);
    field_t modded_y = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.y, base_point.y);
    cycle_group<Builder> modded_base_point(modded_x, modded_y, false);
    // We assume that the native hints (if present) do not account for the point at infinity edge case in the same way
    // as above (i.e. replacing with "one") so we avoid using any provided hints in this case. (N.B. No efficiency is
    // lost here since native addition with the point at infinity is nearly free).
    const bool hints_available = hints.has_value() && !base_point.is_point_at_infinity().get_value();
    auto get_hint = [&](size_t i) -> std::optional<AffineElement> {
        if (!hints_available) {
            return std::nullopt;
        }
        BB_ASSERT_LT(i, hints.value().size(), "Invalid hint index");
        return std::optional<AffineElement>(hints.value()[i]);
    };

    if (base_point.is_constant() && !base_point.is_point_at_infinity().get_value()) {
        // Case 1: if the input point is constant, it is cheaper to fix the point as a witness and then derive the
        // table, than it is to derive the table and fix its witnesses to be constant! (due to group additions = 1 gate,
        // and fixing x/y coords to be constant = 2 gates)
        modded_base_point = cycle_group<Builder>::from_constant_witness(_context, modded_base_point.get_value());
        point_table[0] = cycle_group<Builder>::from_constant_witness(_context, offset_generator.get_value());
        for (size_t i = 1; i < table_size; ++i) {
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, get_hint(i - 1));
        }
    } else {
        // Case 2: Point is non-constant so the table is derived via unconditional additions. We check the x_coordinates
        // of all summand pairs are distinct via a batched product check to avoid individual modular inversions.
        field_t coordinate_check_product = 1;
        point_table[0] = offset_generator;
        for (size_t i = 1; i < table_size; ++i) {
            const field_t x_diff = point_table[i - 1].x - modded_base_point.x;
            coordinate_check_product *= x_diff;
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, get_hint(i - 1));
        }
        coordinate_check_product.assert_is_not_zero("straus_lookup_table x-coordinate collision");

        // If the input base point was the point at infinity, the correct point table simply contains the offset
        // generator at every entry. However, since we replaced the point at infinity with "one" when computing the
        // table (see explanation above), we must conditionally correct the table entries here.
        for (size_t i = 1; i < table_size; ++i) {
            point_table[i] = cycle_group<Builder>::conditional_assign(
                base_point.is_point_at_infinity(), offset_generator, point_table[i]);
        }
    }

    // Construct a ROM array containing the point table
    rom_id = context->create_ROM_array(table_size);
    for (size_t i = 0; i < table_size; ++i) {
        // Convert any constant points to witnesses constrained to equal the constant value for use in ROM array
        if (point_table[i].is_constant()) {
            const auto element = point_table[i].get_value();
            point_table[i] = cycle_group<Builder>::from_constant_witness(_context, element);
        }
        std::array<uint32_t, 2> coordinate_indices = { point_table[i].x.get_witness_index(),
                                                       point_table[i].y.get_witness_index() };
        context->set_ROM_element_pair(rom_id, i, coordinate_indices);
    }
}

/**
 * @brief Given an `_index` witness, return `straus_lookup_table[index]`
 * @details Performs a ROM read which costs one gate. If `_index` is constant, we convert it to a witness constrained to
 * equal the constant value.
 *
 * @tparam Builder
 * @param _index
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> straus_lookup_table<Builder>::read(const field_t& _index)
{
    field_t index(_index);
    // A ROM array index must be a witness; we convert constants to a witness constrained to equal the constant value
    if (index.is_constant()) {
        index = field_t::from_witness(_context, _index.get_value());
        index.assert_equal(_index.get_value());
    }
    auto [x_idx, y_idx] = _context->read_ROM_array_pair(rom_id, index.get_witness_index());
    field_t x = field_t::from_witness_index(_context, x_idx);
    field_t y = field_t::from_witness_index(_context, y_idx);
    // Merge tag of table with tag of index
    x.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
    y.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));

    // The result is known to not be the point at infinity due to the use of offset generators in the table
    return cycle_group<Builder>(x, y, /*is_infinity=*/false);
}

template class straus_lookup_table<bb::UltraCircuitBuilder>;
template class straus_lookup_table<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
