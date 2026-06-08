// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./straus_lookup_table.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/duplicate_provenance.hpp"

namespace bb::stdlib {

namespace {

// BOOMERANG_DUPLICATE_PROVENANCE: See
// barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md.
enum class StrausTableProvenanceKind : uint64_t {
    TABLE_IDENTITY = 0,
};

enum class PointCoordinateSlot : uint64_t { X = 0, Y = 1 };
enum class StrausInfinityIdentityKind : uint64_t { CONSTANT_FLAG = 0, DERIVED_FROM_BASE_POINT = 1 };
enum class MsmFieldIdentityKind : uint64_t { CONSTANT = 0, WITNESS_AFFINE = 1 };

inline DuplicateProvenanceLocalId msm_table_local_id(std::initializer_list<uint64_t> identities)
{
    return duplicate_provenance_local_id(identities);
}

inline void append_msm_identity(DuplicateProvenanceLocalId& identities, uint64_t identity)
{
    append_duplicate_provenance_identity(identities, identity);
}

inline void append_msm_field(DuplicateProvenanceLocalId& identities, const bb::fr& value)
{
    const uint256_t value_uint256(value);
    for (const uint64_t limb : value_uint256.data) {
        append_msm_identity(identities, limb);
    }
}

// Affine identity of a field_t for provenance keying: the raw underlying witness index (read without normalizing,
// so no gate is added) plus the affine multiplicative/additive constants. Two field_t's that the circuit
// would treat as equal once normalized share this identity; two field_t's that share a raw witness but differ in
// affine constants represent different values and get different identities. Constants include their full field value.
template <typename Builder> inline DuplicateProvenanceLocalId field_affine_identity(const field_t<Builder>& f)
{
    DuplicateProvenanceLocalId identities;
    if (f.is_constant()) {
        append_msm_identity(identities, static_cast<uint64_t>(MsmFieldIdentityKind::CONSTANT));
        append_msm_field(identities, f.get_value());
        return identities;
    }
    append_msm_identity(identities, static_cast<uint64_t>(MsmFieldIdentityKind::WITNESS_AFFINE));
    append_msm_identity(identities,
                        static_cast<uint64_t>(f.get_context()->real_variable_index[f.get_raw_witness_index()]));
    append_msm_field(identities, f.multiplicative_constant);
    append_msm_field(identities, f.additive_constant);
    return identities;
}

} // namespace

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
    , _table_bits(table_bits)
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
    field_t modded_x =
        field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.x(), base_point.x());
    field_t modded_y =
        field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.y(), base_point.y());
    // The modded point is never at infinity since we fallback to Group::one when the base point is infinity.
    // Use the private 4-arg constructor to avoid auto-detection gates.
    cycle_group<Builder> modded_base_point(
        modded_x, modded_y, /*is_infinity=*/bool_t<Builder>(modded_x.get_context(), false), /*assert_on_curve=*/false);
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

        // base_point == offset_generator collapses the first table add into a degenerate G + G ecc_add gate;
        // the non-doubling relation is identically zero when operands match, so is satisfied by any result coordinates.
        BB_ASSERT(base_point.get_value() != offset_generator.get_value(),
                  "straus_lookup_table case-1: base_point must not coincide with offset_generator");

        modded_base_point = cycle_group<Builder>::from_constant_witness(_context, modded_base_point.get_value());
        point_table[0] = cycle_group<Builder>::from_constant_witness(_context, offset_generator.get_value());
        for (size_t i = 1; i < table_size; ++i) {
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, get_hint(i - 1));
        }
    } else {
        // Case 2: Point is non-constant witness so the table is derived via unconditional additions. We check the
        // x_coordinates of all summand pairs are distinct via a batched product check to avoid individual modular
        // inversions.
        field_t coordinate_check_product = 1;
        point_table[0] = offset_generator;
        for (size_t i = 1; i < table_size; ++i) {
            const field_t x_diff = point_table[i - 1].x() - modded_base_point.x();
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

    // Provenance key inputs for the ROM cells. The point table is a deterministic function of the base point and the
    // offset generator: point_table[0] = offset_generator and point_table[i] = point_table[i-1] + modded_base_point,
    // where modded_base_point = conditional_assign(base_point.is_point_at_infinity(), one, base_point). For a fixed set
    // of input witnesses every cell point_table[i] is the unique output of this chain of ecc_add gates, so two straus
    // tables built from the SAME base point and offset generator (by affine witness identity) have constraint-forced
    // equal cells at every slot i. We key on the affine identities of the four input coordinates (never on coordinate
    // values) plus the slot index and the coordinate (x/y). The infinity edge: the chain also depends on
    // base_point.is_point_at_infinity(); when that flag is constant we include the flag value. When it is a witness it
    // is, in every construction path that produces one, derived deterministically from the base point's own coordinates
    // (cycle_group's 2-arg constructor sets _is_infinity = (5y^2 + x^3)_is_zero, and add/sub results derive it from
    // their inputs), so including the base coordinates' affine identities is a sound proxy: two tables share the
    // infinity term only when they already share the coordinate identities the flag is derived from. This is the same
    // structural assumption the legacy straus overlay makes when it reconstructs the table chain.
    const auto base_x_id = field_affine_identity(base_point.x());
    const auto base_y_id = field_affine_identity(base_point.y());
    const auto offset_x_id = field_affine_identity(offset_generator.x());
    const auto offset_y_id = field_affine_identity(offset_generator.y());
    DuplicateProvenanceLocalId infinity_id;
    if (base_point.is_point_at_infinity().is_constant()) {
        infinity_id = msm_table_local_id({ static_cast<uint64_t>(StrausInfinityIdentityKind::CONSTANT_FLAG),
                                           base_point.is_point_at_infinity().get_value() ? UINT64_C(1) : UINT64_C(0) });
    } else {
        infinity_id =
            msm_table_local_id({ static_cast<uint64_t>(StrausInfinityIdentityKind::DERIVED_FROM_BASE_POINT) });
        append_duplicate_provenance_identity(infinity_id, base_x_id);
        append_duplicate_provenance_identity(infinity_id, base_y_id);
    }
    provenance_table_id = msm_table_local_id({ static_cast<uint64_t>(StrausTableProvenanceKind::TABLE_IDENTITY) });
    append_duplicate_provenance_identity(provenance_table_id, base_x_id);
    append_duplicate_provenance_identity(provenance_table_id, base_y_id);
    append_duplicate_provenance_identity(provenance_table_id, offset_x_id);
    append_duplicate_provenance_identity(provenance_table_id, offset_y_id);
    append_duplicate_provenance_identity(provenance_table_id, infinity_id);

    // Construct a ROM array containing the point table
    rom_id = context->create_ROM_array(table_size);
    for (size_t i = 0; i < table_size; ++i) {
        // Convert any constant points to witnesses constrained to equal the constant value for use in ROM array
        if (point_table[i].is_constant()) {
            const auto element = point_table[i].get_value();
            point_table[i] = cycle_group<Builder>::from_constant_witness(_context, element);
        }
        std::array<uint32_t, 2> coordinate_indices = { point_table[i].x().get_witness_index(),
                                                       point_table[i].y().get_witness_index() };
        context->set_ROM_element_pair(rom_id, i, coordinate_indices);

        // Tag the ROM cell coordinate witnesses. Cell i's x and y are not forced equal to each other, so they get
        // distinct slot words; the slot index i distinguishes cells of one table (they are distinct points).
        const auto cell_key = [&](uint64_t coord) {
            auto local_id = provenance_table_id;
            append_duplicate_provenance_identity(local_id, static_cast<uint64_t>(i));
            append_duplicate_provenance_identity(local_id, coord);
            return Builder::make_duplicate_provenance(DuplicateProvenanceCategory::MSM_TABLE, std::move(local_id));
        };
        _context->tag_duplicate_provenance(coordinate_indices[0],
                                           cell_key(static_cast<uint64_t>(PointCoordinateSlot::X)));
        _context->tag_duplicate_provenance(coordinate_indices[1],
                                           cell_key(static_cast<uint64_t>(PointCoordinateSlot::Y)));
    }
}

/**
 * @brief Given an `_index` witness, return `straus_lookup_table[index]`
 * @details Performs a ROM read which costs one gate. If `_index` is constant, we convert it to a witness constrained to
 * equal the constant value.
 *
 * @note The caller must enforce that _index < 2^table_bits, _index is not constrained in this function
 *
 * @tparam Builder
 * @param _index
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> straus_lookup_table<Builder>::read(const field_t& _index)
{
    BB_ASSERT_LT(uint256_t(_index.get_value()).get_msb(), _table_bits, "straus_lookup_table read index out of bounds");

    field_t index(_index);
    // A ROM array index must be a witness; we convert constants to a witness constrained to equal the constant value
    if (index.is_constant()) {
        index = field_t::from_witness(_context, _index.get_value());
        index.assert_equal(_index.get_value());
    }
    const uint32_t index_witness = index.get_witness_index();
    auto [x_idx, y_idx] = _context->read_ROM_array_pair(rom_id, index_witness);
    field_t x = field_t::from_witness_index(_context, x_idx);
    field_t y = field_t::from_witness_index(_context, y_idx);
    // Merge tag of table with tag of index
    x.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
    y.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));

    // Tag the read-output coordinate witnesses with an MSM_TABLE provenance key. The ROM consistency argument forces
    // every read of array `rom_id` at a fixed index witness to equal the same ROM cell. Key on the read-index witness
    // identity (or its existing provenance), never on the current index value or coordinate values.
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
        auto local_id = provenance_table_id;
        append_duplicate_provenance_identity(local_id, index_identity);
        append_duplicate_provenance_identity(local_id, coord);
        return Builder::make_duplicate_provenance(DuplicateProvenanceCategory::MSM_TABLE, std::move(local_id));
    };
    _context->tag_duplicate_provenance(x_idx, coord_key(static_cast<uint64_t>(PointCoordinateSlot::X)));
    _context->tag_duplicate_provenance(y_idx, coord_key(static_cast<uint64_t>(PointCoordinateSlot::Y)));

    // The result is known to not be the point at infinity due to the use of offset generators in the table.
    // Use the private 4-arg constructor to avoid auto-detection gates.
    return cycle_group<Builder>(x, y, /*is_infinity=*/bool_t<Builder>(_context, false), /*assert_on_curve=*/false);
}

template class straus_lookup_table<bb::UltraCircuitBuilder>;
template class straus_lookup_table<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
