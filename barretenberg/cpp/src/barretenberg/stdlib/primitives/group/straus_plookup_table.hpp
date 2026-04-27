#pragma once

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <vector>

namespace bb::stdlib {

// Forward declaration
template <typename Builder> class cycle_group;

/**
 * @brief straus_plookup_table computes a plookup-based lookup table of size 1 << table_bits
 *
 * @details For a CONSTANT base_point [P] and offset_generator point [G], where N = 1 << table_bits,
 * the following is computed:
 *
 * { [G] + 0.[P], [G] + 1.[P], ..., [G] + (N - 1).[P] }
 *
 * Unlike straus_lookup_table (which uses ROM tables), this class creates plookup BasicTable entries.
 * Plookup tables have zero construction cost (table data is part of the proving polynomial) and each
 * read costs exactly 1 lookup gate with no finalization overhead. This makes them significantly cheaper
 * than ROM tables for fixed/constant base points.
 *
 * @note This class requires the base point to be a circuit constant (not a witness). For witness base
 * points, use straus_lookup_table instead.
 *
 * @note The offset generator [G] prevents point-at-infinity edge cases, same as in straus_lookup_table.
 */
template <typename Builder> class straus_plookup_table {
  public:
    using field_t = stdlib::field_t<Builder>;
    using bool_t = stdlib::bool_t<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;

    /**
     * @brief Precomputed data for two-phase construction. Contains all data computed without builder access.
     */
    struct PrecomputedData {
        std::vector<AffineElement> native_table;
        plookup::BasicTable basic_table; // columns populated; table_index is NOT yet assigned
    };

    straus_plookup_table() = default;
    straus_plookup_table(Builder* context,
                         const AffineElement& base_point,
                         const AffineElement& offset_generator,
                         size_t table_bits);
    // Construct from precomputed data — only performs builder registration (serial phase)
    straus_plookup_table(Builder* context, PrecomputedData data);

    // Compute native table + BasicTable columns without touching the builder (parallelizable)
    static PrecomputedData build_precomputed_data(const AffineElement& base_point,
                                                  const AffineElement& offset_generator,
                                                  size_t table_bits);

    cycle_group<Builder> read(const field_t& index);

    const std::vector<AffineElement>& get_native_table() const { return native_table; }

  private:
    Builder* _context = nullptr;
    plookup::BasicTable* _table = nullptr;   // pointer into builder's lookup_tables deque
    std::vector<AffineElement> native_table; // precomputed table entries for witness generation
    OriginTag tag;
};

} // namespace bb::stdlib
