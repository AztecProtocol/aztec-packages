#include "./straus_plookup_table.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/duplicate_provenance.hpp"

namespace bb::stdlib {

namespace {

enum class PointCoordinateSlot : uint64_t { X = 0, Y = 1 };

// BOOMERANG_DUPLICATE_PROVENANCE: See
// barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md.
inline DuplicateProvenanceLocalId msm_table_local_id(std::initializer_list<uint64_t> identities)
{
    return duplicate_provenance_local_id(identities);
}

} // namespace

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
    _table = context->register_basic_lookup_table(std::move(data.basic_table));

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
 * @details Creates a single lookup gate constraining (index, x, y) to a valid row in this table.
 * The index witness is reused as the lookup key so the scalar slice is directly constrained.
 *
 * @param _index The lookup index (witness or constant, typically a scalar slice)
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

    // Create a standalone lookup gate constraining (index, x, y) to a valid table row.
    plookup::BasicTable::LookupEntry entry;
    entry.key = { uint256_t(native_index), 0 };
    entry.value = { point.x, point.y };
    const uint32_t index_witness = index.get_witness_index();
    _context->create_lookup_gate(index_witness, x_idx, y_idx, *_table, entry);

    // Tag the read-output coordinate witnesses with an MSM_TABLE provenance key. The lookup gate forces the triple
    // (index, x, y) to be a row of table `_table->table_index`, so two reads of the same table whose index witnesses
    // are the same real variable are constrained to the same row and are therefore forced equal. We key on the table
    // index and the real variable index of the read-index witness (resolved at tag time), never on the slot value or
    // the coordinate values: two reads whose index witnesses merely hold the same value but are distinct variables are
    // NOT forced equal, so they receive distinct keys. The x and y coordinates are not forced equal to each other, so
    // they get distinct slot words. `index_witness` was already materialized for the lookup gate above, so reading it
    // here adds no gate.
    const auto index_identity = [&]() {
        const uint32_t real_index = _context->real_variable_index[index_witness];
        const auto& provenance = _context->get_duplicate_provenance();
        auto provenance_it = provenance.find(real_index);
        if (provenance_it != provenance.end()) {
            return _context->get_duplicate_provenance_interned_identity(provenance_it->second);
        }
        return msm_table_local_id({ DUPLICATE_PROVENANCE_RAW_IDENTITY_TAG, static_cast<uint64_t>(real_index) });
    }();
    const auto coord_key = [&](uint64_t coord) {
        auto local_id = msm_table_local_id({ static_cast<uint64_t>(_table->table_index) });
        append_duplicate_provenance_identity(local_id, index_identity);
        append_duplicate_provenance_identity(local_id, coord);
        return Builder::make_duplicate_provenance(DuplicateProvenanceCategory::MSM_TABLE, std::move(local_id));
    };
    _context->tag_duplicate_provenance(x_idx, coord_key(static_cast<uint64_t>(PointCoordinateSlot::X)));
    _context->tag_duplicate_provenance(y_idx, coord_key(static_cast<uint64_t>(PointCoordinateSlot::Y)));

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
