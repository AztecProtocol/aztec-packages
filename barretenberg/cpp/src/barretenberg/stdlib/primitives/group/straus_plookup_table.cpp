#include "./straus_plookup_table.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

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
    : _context(context)
{
    const size_t table_size = 1UL << table_bits;

    // Compute native table entries as { offset_generator + i * base_point } via chained addition.
    std::vector<Element> projective_points(table_size);
    projective_points[0] = Element(offset_generator);
    Element base_proj(base_point);
    for (size_t i = 1; i < table_size; ++i) {
        projective_points[i] = projective_points[i - 1] + base_proj;
    }
    finalize(projective_points, table_size);
}

/**
 * @brief Shared finalization logic for both constructors.
 *
 * Takes a filled vector of projective table entries and:
 *   1. batch-normalizes them to affine,
 *   2. builds the native_table for witness generation,
 *   3. creates a BasicTable, populates its columns, and pushes it into the builder's lookup_tables deque,
 *   4. sets the tag to constant
 */
template <typename Builder>
void straus_plookup_table<Builder>::finalize(std::vector<Element>& projective_points, size_t table_size)
{
    Element::batch_normalize(projective_points.data(), table_size);

    native_table.resize(table_size);
    for (size_t i = 0; i < table_size; ++i) {
        native_table[i] = AffineElement(projective_points[i].x, projective_points[i].y);
    }

    plookup::BasicTable table;
    table.id = plookup::BasicTableId::STRAUS_EC_POINT;
    table.use_twin_keys = false;
    table.column_1_step_size = bb::fr(0);
    table.column_2_step_size = bb::fr(0);
    table.column_3_step_size = bb::fr(0);
    table.get_values_from_key = nullptr;

    table.column_1.resize(table_size);
    table.column_2.resize(table_size);
    table.column_3.resize(table_size);
    for (size_t i = 0; i < table_size; ++i) {
        table.column_1[i] = bb::fr(i);
        table.column_2[i] = native_table[i].x;
        table.column_3[i] = native_table[i].y;
    }

    table.table_index = _context->get_num_lookup_tables();
    auto& tables = _context->get_lookup_tables();
    tables.emplace_back(std::move(table));
    _table = &tables.back();

    tag = OriginTag::constant();
}

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

/**
 * @brief Construct from a precomputed base-point-multiples table, adding the offset_generator.
 *
 * @details Accepts precomputed { j * base_point } for j in [0, 2^table_bits) from load_cached_base_multiples and
 * combines them with the offset_generator to produce the final native table:
 *   native_table[j] = offset_generator + j * base_point
 * The projective-to-affine conversion and EC additions are done here in batch, just as in the primary
 * constructor, but the per-point scalar multiples are sourced from the cache instead of recomputed.
 */
template <typename Builder>
straus_plookup_table<Builder>::straus_plookup_table(Builder* context,
                                                    const std::vector<AffineElement>& base_multiples,
                                                    const AffineElement& offset_generator,
                                                    size_t table_bits)
    : _context(context)
{
    const size_t table_size = static_cast<size_t>(1) << table_bits;
    BB_ASSERT(base_multiples.size() == table_size);

    // Fill projective_points[j] = offset_generator + base_multiples[j] (where base_multiples[j] = j * base_point).
    std::vector<Element> projective_points(table_size);
    projective_points[0] = Element(offset_generator); // j=0: offset_generator + 0*P = offset_generator
    for (size_t j = 1; j < table_size; ++j) {
        projective_points[j] = Element(offset_generator) + Element(base_multiples[j]);
    }
    finalize(projective_points, table_size);
}

template <typename Builder> std::filesystem::path straus_plookup_table<Builder>::default_cache_dir()
{
    return bb::srs::bb_crs_path();
}

template <typename Builder>
std::filesystem::path straus_plookup_table<Builder>::default_cache_path(size_t num_points, size_t table_bits)
{
    return default_cache_dir() / "straus_tables" /
           ("num_points_" + std::to_string(num_points) + "_bitsize_" + std::to_string(table_bits) + ".dat");
}

/**
 * @brief Load { j * base_points[i] } for all i, j from a disk cache if available.
 *
 * On a cache miss (file missing, wrong size, or header mismatch) falls back to computing the multiples
 * on-the-fly. The write path lives in the grumpkin_straus_table_gen tool, not here.
 */
template <typename Builder>
std::vector<std::vector<typename straus_plookup_table<Builder>::AffineElement>> straus_plookup_table<
    Builder>::load_cached_base_multiples(std::span<AffineElement const> base_points,
                                         size_t table_bits,
                                         size_t cache_offset,
                                         std::optional<std::filesystem::path> cache_path)
{
    const size_t num_points = base_points.size();
    const size_t total_points = cache_offset + num_points;
    const size_t table_size = static_cast<size_t>(1) << table_bits;

    // Sanity check: grumpkin_straus_table_gen only generates up to 2^CONST_ECCVM_LOG_N points
    BB_ASSERT(total_points <= (1ULL << CONST_ECCVM_LOG_N));

    // Cache file layout: 32-byte header (4 × uint64_t: num_points, table_bits, table_size, reserved)
    // followed by num_points × table_size AffineElement entries.
    constexpr size_t header_size = 4 * sizeof(uint64_t);

    std::filesystem::path path = cache_path.has_value() ? *cache_path : default_cache_path(total_points, table_bits);

    // Try to read the cache file.
    const size_t expected_file_size = header_size + (total_points * table_size * sizeof(AffineElement));
    if (get_file_size(path.string()) == expected_file_size) {
        const size_t slice_byte_offset = header_size + (cache_offset * table_size * sizeof(AffineElement));
        const size_t read_size = slice_byte_offset + (num_points * table_size * sizeof(AffineElement));
        auto raw = read_file(path.string(), read_size);

        size_t hdr_offset = 0;
        auto read_u64 = [&]() {
            uint64_t v = from_buffer<uint64_t>(raw, hdr_offset);
            hdr_offset += sizeof(uint64_t);
            return v;
        };
        if (read_u64() == static_cast<uint64_t>(total_points) && read_u64() == static_cast<uint64_t>(table_bits) &&
            read_u64() == static_cast<uint64_t>(table_size)) {
            std::vector<std::vector<AffineElement>> tables(num_points, std::vector<AffineElement>(table_size));
            parallel_for_range(num_points, [&](size_t start, size_t end) {
                for (size_t i = start; i < end; ++i) {
                    for (size_t j = 0; j < table_size; ++j) {
                        size_t byte_off = slice_byte_offset + ((i * table_size + j) * sizeof(AffineElement));
                        tables[i][j] = from_buffer<AffineElement>(raw, byte_off);
                    }
                }
            });
            vinfo("straus plookup table cache hit: ", path.string(), " [offset=", cache_offset, "]");
            return tables;
        }
        vinfo("straus table cache header mismatch, ignoring");
    }

    // Cache miss: compute { j * base_points[i] } on-the-fly.
    vinfo("straus plookup table cache miss at ", path.string(), ", computing ", num_points, " tables on-the-fly");
    std::vector<std::vector<AffineElement>> tables(num_points, std::vector<AffineElement>(table_size));
    parallel_for_range(num_points, [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            std::vector<Element> proj(table_size);
            proj[0] = Curve::Group::point_at_infinity;
            Element base_proj(base_points[i]);
            for (size_t j = 1; j < table_size; ++j) {
                proj[j] = proj[j - 1] + base_proj;
            }
            Element::batch_normalize(proj.data(), table_size);
            for (size_t j = 0; j < table_size; ++j) {
                tables[i][j] = AffineElement(proj[j].x, proj[j].y);
            }
        }
    });
    return tables;
}

template class straus_plookup_table<bb::UltraCircuitBuilder>;
template class straus_plookup_table<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
