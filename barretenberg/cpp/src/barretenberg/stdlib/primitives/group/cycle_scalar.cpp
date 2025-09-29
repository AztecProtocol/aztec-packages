// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./cycle_scalar.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/field/field_utils.hpp"

namespace bb::stdlib {

template <typename Builder>
cycle_scalar<Builder>::cycle_scalar(const field_t& _lo, const field_t& _hi)
    : lo(_lo)
    , hi(_hi)
{}

/**
 * @brief Construct a circuit-constant cycle scalar from a value in the Grumpkin scalar field
 *
 * @tparam Builder
 * @param in
 */
template <typename Builder> cycle_scalar<Builder>::cycle_scalar(const ScalarField& in)
{
    const uint256_t value(in);
    const auto [lo_v, hi_v] = decompose_into_lo_hi_u256(value);
    lo = lo_v;
    hi = hi_v;
}

/**
 * @brief Construct a cycle scalar from a witness value in the Grumpkin scalar field
 * @note Sets the free witness tag on the two limbs since they are not constrained in any way
 *
 * @tparam Builder
 * @param context
 * @param value
 * @return cycle_scalar<Builder>
 */
template <typename Builder>
cycle_scalar<Builder> cycle_scalar<Builder>::from_witness(Builder* context, const ScalarField& value)
{
    const uint256_t value_u256(value);
    const auto [lo_v, hi_v] = decompose_into_lo_hi_u256(value_u256);
    field_t lo = witness_t<Builder>(context, lo_v);
    field_t hi = witness_t<Builder>(context, hi_v);
    lo.set_free_witness_tag();
    hi.set_free_witness_tag();
    return cycle_scalar(lo, hi);
}

/**
 * @brief Construct a cycle scalar from a uint256_t witness bitstring
 * @details Used when we want to multiply a group element by a string of bits of known size, e.g. for Schnorr
 * signatures.
 * @note This constructor method will make our scalar multiplication methods not perform primality tests.
 *
 * @tparam Builder
 * @param context
 * @param value
 * @return cycle_scalar<Builder>
 */
template <typename Builder>
cycle_scalar<Builder> cycle_scalar<Builder>::from_u256_witness(Builder* context, const uint256_t& bitstring)
{
    const size_t num_bits = 256;
    const uint256_t lo_v = bitstring.slice(0, LO_BITS);
    const uint256_t hi_v = bitstring.slice(LO_BITS, num_bits);
    auto lo = field_t::from_witness(context, lo_v);
    auto hi = field_t::from_witness(context, hi_v);
    return cycle_scalar{
        lo, hi, num_bits, /*skip_primality_test=*/true, /*use_bn254_scalar_field_for_primality_test=*/false
    };
}

/**
 * @brief Construct a cycle scalar (grumpkin scalar field element) from a bn254 scalar field element
 * @details This method ensures that the input is constrained to be less than the bn254 scalar field modulus to ensure
 * unique representation in the grumpkin scalar field.
 *
 * @tparam Builder
 * @param in a field_t representing a bn254 scalar field element
 * @return cycle_scalar<Builder> a cycle_scalar representing the same value in the grumpkin scalar field
 */
template <typename Builder> cycle_scalar<Builder> cycle_scalar<Builder>::create_from_bn254_scalar(const field_t& in)
{
    // Use split_unique with skip_range_constraints=true since the range constraints are implicit
    // in the lookup arguments used in scalar multiplication and thus do not need to be applied here.
    auto [lo, hi] = split_unique(in, LO_BITS, /*skip_range_constraints=*/true);
    // AUDITTODO: we skip the primality test in the constructor here since its done in split_unique. Eventually
    // the skip_primality_test logic will be removed entirely and constraints will always be applied immediately on
    // construction.
    return cycle_scalar{
        lo, hi, NUM_BITS, /*skip_primality_test=*/true, /*use_bn254_scalar_field_for_primality_test=*/true
    };
}

/**
 * @brief Construct a new cycle scalar from a bigfield scalar
 * @details Construct the two cycle scalar limbs from the four limbs of a bigfield scalar as in the diagram below. Range
 * constraints are applied as necessary to ensure the construction is unique:
 *
 *  BigScalarField (four 68-bit limbs):
 *  +----------+----------+----------+----------+
 *  |  limb0   |  limb1   |  limb2   |  limb3   |
 *  +----------+----------+----------+----------+
 *                  |
 *  +----------+----+-----+----------+----------+
 *  |  limb0   | lo | hi  |  limb2   |  limb3   |
 *  +----------+----+-----+----------+----------+
 *                  |
 *  +---------------+---------------------------+
 *  |      lo       |        hi                 |
 *  |   (128 bits)  |    (126 bits)             |
 *  +---------------|---------------------------+
 *
 * The main steps of the algorithm are:
 * 1. If necessary, self-reduce the bigfield scalar until it fits in LO_BITS + HI_BITS
 * 2. Ensure limb0 fits in NUM_LIMB_BITS (if not, slice off excess and add to limb1)
 * 3. Slice limb1 into two parts: limb1_lo (LO_BITS - NUM_LIMB_BITS bits), and limb1_hi (the remaining high bits)
 * 4. Construct lo out of limb0 and limb1_lo
 * 5. Construct hi out of limb1_hi, limb2 and limb3
 *
 * @note To efficiently convert a bigfield into a cycle scalar we rely on the fact that `scalar.lo` and `scalar.hi` are
 * implicitly range-constrained to be respectively 128 and 126 bits when they are further decomposed into slices for the
 * batch mul algorithm.
 *
 * @tparam Builder
 * @param scalar Note: passed by non-const reference since we may call self_reduce on it
 */
template <typename Builder> cycle_scalar<Builder>::cycle_scalar(BigScalarField& scalar)
{
    constexpr uint64_t NUM_LIMB_BITS = BigScalarField::NUM_LIMB_BITS;

    if (scalar.is_constant()) {
        const uint256_t value((scalar.get_value() % uint512_t(ScalarField::modulus)).lo);
        const auto [value_lo, value_hi] = decompose_into_lo_hi_u256(value);

        lo = value_lo;
        hi = value_hi;
        lo.set_origin_tag(scalar.get_origin_tag());
        hi.set_origin_tag(scalar.get_origin_tag());
        return;
    }

    // Step 1: Ensure the bigfield scalar fits into LO_BITS + HI_BITS by reducing if necessary. Note: we can tolerate
    // the scalar being > ScalarField::modulus, because performing a scalar mul implicitly performs a modular reduction.
    if (scalar.get_maximum_value() >= (uint512_t(1) << (LO_BITS + HI_BITS))) {
        scalar.self_reduce();
    }

    field_t limb0 = scalar.binary_basis_limbs[0].element;
    field_t limb1 = scalar.binary_basis_limbs[1].element;
    field_t limb2 = scalar.binary_basis_limbs[2].element;
    field_t limb3 = scalar.binary_basis_limbs[3].element;

    uint256_t limb1_max = scalar.binary_basis_limbs[1].maximum_value;

    // Step 2: Ensure that limb0 only contains at most NUM_LIMB_BITS. If not, slice off the excess and add it into limb1
    uint256_t limb0_max = scalar.binary_basis_limbs[0].maximum_value;
    if (limb0_max > BigScalarField::DEFAULT_MAXIMUM_LIMB) {

        // Split limb0 into lo (NUM_LIMB_BITS) and hi (remaining bits) slices. Note that no_wrap_split_at enforces range
        // constraints of NUM_LIMB_BITS and (limb0_max_bits - NUM_LIMB_BITS) respectively on the slices.
        const auto limb0_max_bits = static_cast<size_t>(limb0_max.get_msb() + 1);
        auto [limb0_lo, limb0_hi] = limb0.no_wrap_split_at(NUM_LIMB_BITS, limb0_max_bits);

        // Move the high bits from limb0 into limb1
        limb0 = limb0_lo;
        limb1 += limb0_hi;
        uint256_t limb0_hi_max = limb0_max >> NUM_LIMB_BITS;
        limb1_max += limb0_hi_max;
    }

    // Sanity check that limb1 is the limb that contributes both to *this.lo and *this.hi
    BB_ASSERT_GT(NUM_LIMB_BITS * 2, LO_BITS);
    BB_ASSERT_LT(NUM_LIMB_BITS, LO_BITS);

    // Step 3: limb1 contributes to both *this.lo and *this.hi. Compute the values of the two limb1 slices
    const size_t lo_bits_in_limb_1 = LO_BITS - NUM_LIMB_BITS;
    const auto limb1_max_bits = static_cast<size_t>(limb1_max.get_msb() + 1);
    auto [limb1_lo, limb1_hi] = limb1.no_wrap_split_at(lo_bits_in_limb_1, limb1_max_bits);

    // Propagate the origin tag to the chunks of limb1
    limb1_lo.set_origin_tag(limb1.get_origin_tag());
    limb1_hi.set_origin_tag(limb1.get_origin_tag());

    // Step 4: Construct *this.lo out of limb0 and limb1_lo
    lo = limb0 + (limb1_lo * BigScalarField::shift_1);

    // Step 5: Construct *this.hi out of limb1_hi, limb2 and limb3
    const uint256_t limb_2_shift = uint256_t(1) << ((2 * NUM_LIMB_BITS) - LO_BITS);
    const uint256_t limb_3_shift = uint256_t(1) << ((3 * NUM_LIMB_BITS) - LO_BITS);
    hi = limb1_hi.add_two(limb2 * limb_2_shift, limb3 * limb_3_shift);

    // Manually propagate the origin tag of the scalar to the lo/hi limbs
    lo.set_origin_tag(scalar.get_origin_tag());
    hi.set_origin_tag(scalar.get_origin_tag());
};

template <typename Builder> bool cycle_scalar<Builder>::is_constant() const
{
    return (lo.is_constant() && hi.is_constant());
}

/**
 * @brief Validates that the scalar (lo + hi * 2^LO_BITS) is less than the appropriate field modulus
 * @details Checks against either bn254 scalar field or grumpkin scalar field based on internal flags. If
 * _skip_primality_test is true, no validation is performed.
 * @note: Implies (lo + hi * 2^LO_BITS) < field_modulus as integers when combined with appropriate range constraints on
 * lo and hi.
 *
 * @tparam Builder
 */
template <typename Builder> void cycle_scalar<Builder>::validate_scalar_is_in_field() const
{
    if (!_skip_primality_test) {
        const uint256_t& field_modulus =
            _use_bn254_scalar_field_for_primality_test ? field_t::native::modulus : ScalarField::modulus;
        validate_split_in_field(lo, hi, LO_BITS, field_modulus);
    }
}

template <typename Builder> typename cycle_scalar<Builder>::ScalarField cycle_scalar<Builder>::get_value() const
{
    uint256_t lo_v(lo.get_value());
    uint256_t hi_v(hi.get_value());
    return ScalarField(lo_v + (hi_v << LO_BITS));
}

template class cycle_scalar<bb::UltraCircuitBuilder>;
template class cycle_scalar<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
