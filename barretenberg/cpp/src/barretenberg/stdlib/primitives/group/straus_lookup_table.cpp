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
std::vector<typename straus_lookup_table<Builder>::Element> straus_lookup_table<
    Builder>::compute_straus_lookup_table_hints(const Element& base_point,
                                                const Element& offset_generator,
                                                size_t table_bits)
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
 * @brief Construct a new straus lookup table::straus lookup table object
 *
 * @details Constructs a `table_bits` lookup table.
 *
 * If Builder is not ULTRA, `table_bits = 1`
 * If Builder is ULTRA, ROM table is used as lookup table
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
    : _table_bits(table_bits)
    , _context(context)
    , tag(OriginTag(base_point.get_origin_tag(), offset_generator.get_origin_tag()))
{
    constexpr bool IS_ULTRA = Builder::CIRCUIT_TYPE == CircuitType::ULTRA;

    const size_t table_size = 1UL << table_bits;
    point_table.resize(table_size);
    point_table[0] = offset_generator;

    // We want to support the case where input points are points at infinity.
    // If base point is at infinity, we want every point in the table to just be `generator_point`.
    // We achieve this via the following:
    // 1: We create a "work_point" that is base_point if not at infinity, otherwise is just 1
    // 2: When computing the point table, we use "work_point" in additions instead of the "base_point" (to prevent
    //    x-coordinate collisions in honest case) 3: When assigning to the point table, we conditionally assign either
    //    the output of the point addition (if not at infinity) or the generator point (if at infinity)
    // Note: if `base_point.is_point_at_infinity()` is constant, these conditional assigns produce zero gate overhead
    cycle_group<Builder> fallback_point(Group::affine_one);
    field_t modded_x = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.x, base_point.x);
    field_t modded_y = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.y, base_point.y);
    cycle_group<Builder> modded_base_point(modded_x, modded_y, false);
    // We assume that the native hints (if present) do not account for the point at infinity edge case in the same way
    // as above (i.e. replacing with "one") so we avoid using any provided hints in this case. (N.B. No efficiency is
    // lost here since native addition with the point at infinity is nearly free).
    const bool hint_available = hints.has_value() && !base_point.is_point_at_infinity().get_value();

    // if the input point is constant, it is cheaper to fix the point as a witness and then derive the table, than it is
    // to derive the table and fix its witnesses to be constant! (due to group additions = 1 gate, and fixing x/y coords
    // to be constant = 2 gates)
    if (base_point.is_constant() && !base_point.is_point_at_infinity().get_value()) {
        modded_base_point = cycle_group<Builder>::from_constant_witness(_context, modded_base_point.get_value());
        point_table[0] = cycle_group<Builder>::from_constant_witness(_context, offset_generator.get_value());
        for (size_t i = 1; i < table_size; ++i) {
            std::optional<AffineElement> hint =
                hint_available ? std::optional<AffineElement>(hints.value()[i - 1]) : std::nullopt;
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, hint);
        }
    } else {
        std::vector<std::tuple<field_t, field_t>> x_coordinate_checks;
        // ensure all of the ecc add gates are lined up so that we can pay 1 gate per add and not 2
        for (size_t i = 1; i < table_size; ++i) {
            std::optional<AffineElement> hint =
                hint_available ? std::optional<AffineElement>(hints.value()[i - 1]) : std::nullopt;
            x_coordinate_checks.emplace_back(point_table[i - 1].x, modded_base_point.x);
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, hint);
        }

        // batch the x-coordinate checks together
        // because `assert_is_not_zero` witness generation needs a modular inversion (expensive)
        field_t coordinate_check_product = 1;
        for (auto& [x1, x2] : x_coordinate_checks) {
            auto x_diff = x2 - x1;
            coordinate_check_product *= x_diff;
        }
        coordinate_check_product.assert_is_not_zero("straus_lookup_table x-coordinate collision");

        for (size_t i = 1; i < table_size; ++i) {
            point_table[i] = cycle_group<Builder>::conditional_assign(
                base_point.is_point_at_infinity(), offset_generator, point_table[i]);
        }
    }
    if constexpr (IS_ULTRA) {
        rom_id = context->create_ROM_array(table_size);
        for (size_t i = 0; i < table_size; ++i) {
            if (point_table[i].is_constant()) {
                auto element = point_table[i].get_value();
                point_table[i] = cycle_group<Builder>::from_constant_witness(_context, element);
                point_table[i].x.assert_equal(element.x);
                point_table[i].y.assert_equal(element.y);
            }
            context->set_ROM_element_pair(
                rom_id,
                i,
                std::array<uint32_t, 2>{ point_table[i].x.get_witness_index(), point_table[i].y.get_witness_index() });
        }
    } else {
        BB_ASSERT_EQ(table_bits, 1U);
    }
}

/**
 * @brief Given an `_index` witness, return `straus_lookup_table[index]`
 *
 * @tparam Builder
 * @param _index
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> straus_lookup_table<Builder>::read(const field_t& _index)
{
    constexpr bool IS_ULTRA = Builder::CIRCUIT_TYPE == CircuitType::ULTRA;

    if constexpr (IS_ULTRA) {
        field_t index(_index);
        if (index.is_constant()) {
            using witness_t = stdlib::witness_t<Builder>;
            index = witness_t(_context, _index.get_value());
            index.assert_equal(_index.get_value());
        }
        auto output_indices = _context->read_ROM_array_pair(rom_id, index.get_witness_index());
        field_t x = field_t::from_witness_index(_context, output_indices[0]);
        field_t y = field_t::from_witness_index(_context, output_indices[1]);
        // Merge tag of table with tag of index
        x.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
        y.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
        return cycle_group<Builder>(x, y, /*is_infinity=*/false);
    }
    field_t x = _index * (point_table[1].x - point_table[0].x) + point_table[0].x;
    field_t y = _index * (point_table[1].y - point_table[0].y) + point_table[0].y;

    // Merge tag of table with tag of index
    x.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
    y.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
    return cycle_group<Builder>(x, y, /*is_infinity=*/false);
}

template class straus_lookup_table<bb::UltraCircuitBuilder>;
template class straus_lookup_table<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
