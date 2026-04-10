#pragma once

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <filesystem>
#include <optional>
#include <span>
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

    straus_plookup_table() = default;
    straus_plookup_table(Builder* context,
                         const AffineElement& base_point,
                         const AffineElement& offset_generator,
                         size_t table_bits);

    /**
     * @brief Construct from a precomputed base-point-multiples table, adding the offset_generator.
     *
     * Accepts a precomputed vector of { j * base_point } for j in [0, 2^table_bits), typically sourced
     * from load_cached_base_multiples(). The offset_generator is added to each entry to produce the
     * final native_table. This skips the EC scalar multiplications in the primary constructor.
     */
    straus_plookup_table(Builder* context,
                         const std::vector<AffineElement>& base_multiples,
                         const AffineElement& offset_generator,
                         size_t table_bits);

    cycle_group<Builder> read(const field_t& index);

    const std::vector<AffineElement>& get_native_table() const { return native_table; }

    /**
     * @brief Load { j * base_points[i] } for all i, j from a disk cache if available.
     *
     * Reads a cache file produced by grumpkin_straus_table_gen. On a cache miss (file missing, wrong
     * size, or header mismatch) falls back to computing the multiples on-the-fly.
     *
     * @param cache_offset  Index into the cache file to start reading from. Use this when the cache
     *                      was generated for a larger set of points (e.g. all 32768 SRS points) but only
     *                      a suffix is needed (e.g. points [1..32767]).
     * @param cache_path    Path to the cache file. Defaults to the standard path for
     *                      (cache_offset + num_points, table_bits).
     */
    static std::vector<std::vector<AffineElement>> load_cached_base_multiples(
        std::span<AffineElement const> base_points,
        size_t table_bits,
        size_t cache_offset = 0,
        std::optional<std::filesystem::path> cache_path = std::nullopt);

    /** Returns the default cache directory (~/.bb-crs or $CRS_PATH). */
    static std::filesystem::path default_cache_dir();

    /** Returns the default cache path for the given (num_points, table_bits). */
    static std::filesystem::path default_cache_path(size_t num_points, size_t table_bits);

  private:
    // Shared finalization: batch-normalize projective_points, build native_table, create and register
    // the BasicTable in the builder, and mark the tag as constant. Used by both constructors.
    void finalize(std::vector<Element>& projective_points, size_t table_size);

    Builder* _context = nullptr;
    plookup::BasicTable* _table = nullptr;   // pointer into builder's lookup_tables deque
    std::vector<AffineElement> native_table; // precomputed table entries for witness generation
    OriginTag tag;
};

} // namespace bb::stdlib
