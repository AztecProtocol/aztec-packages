// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/duplicate_provenance.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <optional>
#include <vector>

namespace bb::stdlib {

// Forward declaration
template <typename Builder> class cycle_group;

/**
 * @brief straus_lookup_table computes a lookup table of size 1 << table_bits
 *
 * @details for an input base_point [P] and offset_generator point [G], where N = 1 << table_bits, the following is
 * computed:
 *
 * { [G] + 0.[P], [G] + 1.[P], ..., [G] + (N - 1).[P] }
 *
 * The point [G] is used to ensure that we do not have to handle the point at infinity associated with 0.[P].
 *
 * For an HONEST Prover, the probability of [G] and [P] colliding is equivalent to solving the dlog problem.
 * This allows us to partially ignore the incomplete addition formula edge-cases for short Weierstrass curves.
 *
 * When adding group elements in `batch_mul`, we can constrain+assert the x-coordinates of the operand points do not
 * match. An honest prover will never trigger the case where x-coordinates match due to the above. Validating
 * x-coordinates do not match is much cheaper than evaluating the full complete addition formulae for short
 * Weierstrass curves.
 *
 * @note For the case of fixed-base scalar multipliation, all input points are defined at circuit compile.
 * We can ensure that all Provers cannot create point collisions between the base points and offset generators.
 * For this restricted case we can skip the x-coordiante collision checks when performing group operations.
 *
 * @note straus_lookup_table uses Ultra ROM tables if available. If not, we use simple conditional assignment
 * constraints and restrict the table size to be 1 bit.
 */
template <typename Builder> class straus_lookup_table {
  public:
    using field_t = stdlib::field_t<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;

    static std::vector<Element> compute_native_table(const Element& base_point,
                                                     const Element& offset_generator,
                                                     size_t table_bits);

    straus_lookup_table() = default;
    straus_lookup_table(Builder* context,
                        const cycle_group<Builder>& base_point,
                        const cycle_group<Builder>& offset_generator,
                        size_t table_bits,
                        std::optional<std::span<AffineElement>> hints = std::nullopt);
    cycle_group<Builder> read(const field_t& index);

  private:
    Builder* _context;
    size_t rom_id = 0; // Ultra ROM array ID
    size_t _table_bits = 0;
    // BOOMERANG_DUPLICATE_PROVENANCE: See
    // barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md.
    OriginTag tag;
    DuplicateProvenanceLocalId provenance_table_id;
};

} // namespace bb::stdlib
