#include "./straus_plookup_table.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

/**
 * @brief Compute native table entries and BasicTable column data without touching the circuit builder.
 *
 * @details This is the parallelizable part of table construction. It builds:
 *   - native_table: affine points { offset_generator + i * base_point } for i in [0, table_size)
 *   - basic_table:  a BasicTable with columns populated but table_index NOT yet assigned
 *
 * @param base_point Constant base point
 * @param offset_generator Offset to prevent point-at-infinity edge cases
 * @param table_bits Number of bits per table (table has 1 << table_bits entries)
 * @return PrecomputedData Contains native_table and basic_table (without table_index)
 */
template <typename Builder>
typename straus_plookup_table<Builder>::PrecomputedData straus_plookup_table<Builder>::build_precomputed_data(
    const AffineElement& base_point, const AffineElement& offset_generator, size_t table_bits)
{
    const size_t table_size = 1UL << table_bits;

    // Compute native table entries using projective coordinates, then batch-normalize
    std::vector<Element> projective_points(table_size);
    projective_points[0] = Element(offset_generator);
    Element base_proj(base_point);
    for (size_t i = 1; i < table_size; ++i) {
        projective_points[i] = projective_points[i - 1] + base_proj;
    }
    Element::batch_normalize(projective_points.data(), table_size);

    PrecomputedData result;
    result.native_table.resize(table_size);
    for (size_t i = 0; i < table_size; ++i) {
        result.native_table[i] = AffineElement(projective_points[i].x, projective_points[i].y);
    }

    // Populate BasicTable columns (table_index is NOT set here — that requires the builder)
    result.basic_table.id = plookup::BasicTableId::STRAUS_EC_POINT;
    result.basic_table.use_twin_keys = false;
    result.basic_table.column_1_step_size = bb::fr(0);
    result.basic_table.column_2_step_size = bb::fr(0);
    result.basic_table.column_3_step_size = bb::fr(0);
    result.basic_table.get_values_from_key = nullptr;

    result.basic_table.column_1.resize(table_size);
    result.basic_table.column_2.resize(table_size);
    result.basic_table.column_3.resize(table_size);
    for (size_t i = 0; i < table_size; ++i) {
        result.basic_table.column_1[i] = bb::fr(i);
        result.basic_table.column_2[i] = result.native_table[i].x;
        result.basic_table.column_3[i] = result.native_table[i].y;
    }

    return result;
}

/**
 * @brief Construct from precomputed data — serial Phase 2, only touches the circuit builder.
 *
 * @details Assigns table_index and pushes the BasicTable into the builder's lookup_tables deque.
 * Must be called serially (builder is not thread-safe).
 *
 * @param context The circuit builder
 * @param data Precomputed native table + BasicTable columns
 */
template <typename Builder>
straus_plookup_table<Builder>::straus_plookup_table(Builder* context, PrecomputedData data)
    : _context(context)
    , native_table(std::move(data.native_table))
{
    // Assign table_index and push into the builder's lookup_tables deque (serial, builder is not thread-safe)
    data.basic_table.table_index = context->get_num_lookup_tables();
    auto& tables = context->get_lookup_tables();
    tables.emplace_back(std::move(data.basic_table));
    _table = &tables.back();

    // This table is built entirely from native constants, so the tag is pure constant.
    tag = OriginTag::constant();
}

/**
 * @brief Construct a plookup-based Straus lookup table for a constant base point.
 *
 * @details Creates a BasicTable with (1 << table_bits) entries of the form:
 *   { offset_generator + i * base_point } for i in [0, 1 << table_bits)
 *
 * The table is pushed directly into the builder's lookup_tables deque. Table data becomes part of the
 * proving polynomial (zero gate cost). Each subsequent read costs exactly 1 lookup gate.
 *
 * @param context The circuit builder
 * @param base_point Constant base point (must not be a witness)
 * @param offset_generator Offset to prevent point-at-infinity edge cases
 * @param table_bits Number of bits per table (table has 1 << table_bits entries)
 */
template <typename Builder>
straus_plookup_table<Builder>::straus_plookup_table(Builder* context,
                                                    const AffineElement& base_point,
                                                    const AffineElement& offset_generator,
                                                    size_t table_bits)
    : straus_plookup_table(context, build_precomputed_data(base_point, offset_generator, table_bits))
{}

/**
 * @brief Read from the plookup table at the given index.
 *
 * @details Creates a single lookup gate that constrains: (index, x, y) is a valid row in this table.
 * The index's own witness is reused as wire_1 of the gate (not a new variable), so the gate directly
 * constrains the scalar slice to a valid (x, y) point — matching the pattern of
 * create_gates_from_plookup_accumulators where key_a_index is reused in the first lookup gate.
 *
 * @param _index The lookup index (witness or constant field element, typically a 4-bit scalar slice)
 * @return cycle_group<Builder> The point at native_table[index]
 */
template <typename Builder> cycle_group<Builder> straus_plookup_table<Builder>::read(const field_t& _index)
{
    // A plookup gate key must be a witness; convert constants to a witness constrained to the constant value
    // (mirrors the same pattern in straus_lookup_table::read and create_gates_from_plookup_accumulators).
    field_t index(_index);
    if (index.is_constant()) {
        index = field_t::from_witness(_context, _index.get_value());
        index.assert_equal(_index.get_value());
    }

    // Get native index value and look up the corresponding point
    auto native_index = static_cast<size_t>(uint256_t(index.get_value()));
    BB_ASSERT(native_index < native_table.size());
    const auto& point = native_table[native_index];

    // Create witnesses for x and y outputs
    auto x_idx = _context->add_variable(point.x);
    auto y_idx = _context->add_variable(point.y);

    // Record lookup entry in the table's lookup_gates (needed for read_counts construction)
    plookup::BasicTable::LookupEntry entry;
    entry.key = { uint256_t(native_index), 0 };
    entry.value = { point.x, point.y };
    _table->lookup_gates.emplace_back(entry);

    // Write lookup gate reusing the index's own witness index as the key (wire_1).
    // This matches the pattern in create_gates_from_plookup_accumulators where key_a_index is reused
    // in the first (and here only) lookup gate, ensuring the key is the actual scalar slice witness.
    auto& block = _context->blocks.lookup;
    block.populate_wires(index.get_witness_index(), x_idx, y_idx, _context->zero_idx());
    block.set_gate_selector(1);
    block.q_3().emplace_back(bb::fr(_table->table_index)); // table identifier
    block.q_2().emplace_back(0);                           // column_1 step size (0 = standalone lookup)
    block.q_m().emplace_back(0);                           // column_2 step size
    block.q_c().emplace_back(0);                           // column_3 step size
    block.q_1().emplace_back(0);
    block.q_4().emplace_back(0);

    _context->check_selector_length_consistency();
    _context->increment_num_gates();

    // Wrap output witnesses in field_t and propagate origin tag from the index
    field_t x = field_t::from_witness_index(_context, x_idx);
    field_t y = field_t::from_witness_index(_context, y_idx);
    OriginTag merged_tag(tag, index.get_origin_tag());
    x.set_origin_tag(merged_tag);
    y.set_origin_tag(merged_tag);

    // Result is never at infinity due to offset generator in every table entry
    return cycle_group<Builder>(x, y, /*is_infinity=*/bool_t(_context, false), /*assert_on_curve=*/false);
}

template class straus_plookup_table<bb::UltraCircuitBuilder>;
template class straus_plookup_table<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
