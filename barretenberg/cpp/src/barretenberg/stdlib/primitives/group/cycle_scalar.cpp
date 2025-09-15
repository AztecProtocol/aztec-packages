// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./cycle_scalar.hpp"
#include "./cycle_group.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

template <typename Builder>
cycle_scalar<Builder>::cycle_scalar(const field_t& _lo, const field_t& _hi)
    : lo(_lo)
    , hi(_hi)
{}

template <typename Builder> cycle_scalar<Builder>::cycle_scalar(const field_t& in)
{
    const uint256_t value(in.get_value());
    const auto [lo_v, hi_v] = decompose_into_lo_hi(value);
    constexpr uint256_t shift = uint256_t(1) << LO_BITS;
    if (in.is_constant()) {
        lo = lo_v;
        hi = hi_v;
    } else {
        lo = witness_t<Builder>(in.get_context(), lo_v);
        hi = witness_t<Builder>(in.get_context(), hi_v);
        (lo + hi * shift).assert_equal(in);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1022): ensure lo and hi are in bb::fr modulus not
        // bb::fq modulus otherwise we could have two representations for in
        validate_scalar_is_in_field();
    }
    // We need to manually propagate the origin tag
    lo.set_origin_tag(in.get_origin_tag());
    hi.set_origin_tag(in.get_origin_tag());
}

template <typename Builder> cycle_scalar<Builder>::cycle_scalar(const ScalarField& in)
{
    const uint256_t value(in);
    const auto [lo_v, hi_v] = decompose_into_lo_hi(value);
    lo = lo_v;
    hi = hi_v;
}

template <typename Builder>
cycle_scalar<Builder> cycle_scalar<Builder>::from_witness(Builder* context, const ScalarField& value)
{
    const uint256_t value_u256(value);
    const auto [lo_v, hi_v] = decompose_into_lo_hi(value_u256);
    field_t lo = witness_t<Builder>(context, lo_v);
    field_t hi = witness_t<Builder>(context, hi_v);
    lo.set_free_witness_tag();
    hi.set_free_witness_tag();
    return cycle_scalar(lo, hi);
}

/**
 * @brief Use when we want to multiply a group element by a string of bits of known size.
 *        N.B. using this constructor method will make our scalar multiplication methods not perform primality tests.
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
    field_t lo = witness_t<Builder>(context, lo_v);
    field_t hi = witness_t<Builder>(context, hi_v);
    lo.set_free_witness_tag();
    hi.set_free_witness_tag();
    cycle_scalar result{ lo, hi, num_bits, true, false };
    return result;
}

/**
 * @brief Use when we want to multiply a group element by a string of bits of known size.
 *        N.B. using this constructor method will make our scalar multiplication methods not perform primality tests.
 *
 * @tparam Builder
 * @param context
 * @param value
 * @param num_bits
 * @return cycle_scalar<Builder>
 */
template <typename Builder>
cycle_scalar<Builder> cycle_scalar<Builder>::create_from_bn254_scalar(const field_t& in, const bool skip_primality_test)
{
    const uint256_t value_u256(in.get_value());
    const auto [lo_v, hi_v] = decompose_into_lo_hi(value_u256);
    if (in.is_constant()) {
        cycle_scalar result{ field_t(lo_v), field_t(hi_v), NUM_BITS, false, true };
        return result;
    }
    field_t lo = witness_t<Builder>(in.get_context(), lo_v);
    field_t hi = witness_t<Builder>(in.get_context(), hi_v);
    lo.add_two(hi * (uint256_t(1) << LO_BITS), -in).assert_equal(0);

    // We need to manually propagate the origin tag
    lo.set_origin_tag(in.get_origin_tag());
    hi.set_origin_tag(in.get_origin_tag());

    cycle_scalar result{ lo, hi, NUM_BITS, skip_primality_test, true };
    return result;
}
/**
 * @brief Construct a new cycle scalar from a bigfield _value, over the same ScalarField Field. If  _value is a witness,
 * we add constraints to ensure the conversion is correct by reconstructing a bigfield from the limbs of the
 * cycle_scalar and checking equality with the initial _value.
 *
 * @tparam Builder
 * @param _value
 * @todo (https://github.com/AztecProtocol/barretenberg/issues/1016): Optimize this method
 */
template <typename Builder> cycle_scalar<Builder>::cycle_scalar(BigScalarField& scalar)
{
    auto* ctx = get_context() ? get_context() : scalar.get_context();

    if (scalar.is_constant()) {
        const uint256_t value((scalar.get_value() % uint512_t(ScalarField::modulus)).lo);
        const auto [value_lo, value_hi] = decompose_into_lo_hi(value);

        lo = value_lo;
        hi = value_hi;
        // N.B. to be able to call assert equal, these cannot be constants
    } else {
        // To efficiently convert a bigfield into a cycle scalar,
        // we are going to explicitly rely on the fact that `scalar.lo` and `scalar.hi`
        // are implicitly range-constrained to be 128 bits when they are converted into 4-bit lookup window slices

        // First check: can the scalar actually fit into LO_BITS + HI_BITS?
        // If it can, we can tolerate the scalar being > ScalarField::modulus, because performing a scalar mul
        // implicilty performs a modular reduction
        // If not, call `self_reduce` to cut enougn modulus multiples until the above condition is met
        if (scalar.get_maximum_value() >= (uint512_t(1) << (LO_BITS + HI_BITS))) {
            scalar.self_reduce();
        }

        field_t limb0 = scalar.binary_basis_limbs[0].element;
        field_t limb1 = scalar.binary_basis_limbs[1].element;
        field_t limb2 = scalar.binary_basis_limbs[2].element;
        field_t limb3 = scalar.binary_basis_limbs[3].element;

        // The general plan is as follows:
        // 1. ensure limb0 contains no more than BigScalarField::NUM_LIMB_BITS
        // 2. define limb1_lo = limb1.slice(0, LO_BITS - BigScalarField::NUM_LIMB_BITS)
        // 3. define limb1_hi = limb1.slice(LO_BITS - BigScalarField::NUM_LIMB_BITS, <whatever maximum bound of limb1
        // is>)
        // 4. construct *this.lo out of limb0 and limb1_lo
        // 5. construct *this.hi out of limb1_hi, limb2 and limb3
        // This is a lot of logic, but very cheap on constraints.
        // For fresh bignums that have come out of a MUL operation,
        // the only "expensive" part is a size (LO_BITS - BigScalarField::NUM_LIMB_BITS) range check

        // to convert into a cycle_scalar, we need to convert 4*68 bit limbs into 2*128 bit limbs
        // we also need to ensure that the number of bits in cycle_scalar is < LO_BITS + HI_BITS
        // note: we do not need to validate that the scalar is within the field modulus
        // because performing a scalar multiplication implicitly performs a modular reduction (ecc group is
        // multiplicative modulo BigField::modulus)

        uint256_t limb1_max = scalar.binary_basis_limbs[1].maximum_value;

        // Ensure that limb0 only contains at most NUM_LIMB_BITS. If it exceeds this value, slice of the excess and add
        // it into limb1
        if (scalar.binary_basis_limbs[0].maximum_value > BigScalarField::DEFAULT_MAXIMUM_LIMB) {
            const uint256_t limb = limb0.get_value();
            const uint256_t lo_v = limb.slice(0, BigScalarField::NUM_LIMB_BITS);
            const uint256_t hi_v = limb >> BigScalarField::NUM_LIMB_BITS;
            field_t lo = field_t::from_witness(ctx, lo_v);
            field_t hi = field_t::from_witness(ctx, hi_v);

            uint256_t hi_max = (scalar.binary_basis_limbs[0].maximum_value >> BigScalarField::NUM_LIMB_BITS);
            const uint64_t hi_bits = hi_max.get_msb() + 1;
            lo.create_range_constraint(BigScalarField::NUM_LIMB_BITS);
            hi.create_range_constraint(static_cast<size_t>(hi_bits));
            limb0.assert_equal(lo + hi * BigScalarField::shift_1);

            limb1 += hi;
            limb1_max += hi_max;
            limb0 = lo;
        }

        // sanity check that limb[1] is the limb that contributs both to *this.lo and *this.hi
        BB_ASSERT_GT(BigScalarField::NUM_LIMB_BITS * 2, LO_BITS);
        BB_ASSERT_LT(BigScalarField::NUM_LIMB_BITS, LO_BITS);

        // limb1 is the tricky one as it contributs to both *this.lo and *this.hi
        // By this point, we know that limb1 fits in the range `1 << BigScalarField::NUM_LIMB_BITS to  (1 <<
        // BigScalarField::NUM_LIMB_BITS) + limb1_max.get_maximum_value() we need to slice this limb into 2. The first
        // is LO_BITS - BigScalarField::NUM_LIMB_BITS (which reprsents its contribution to *this.lo) and the second
        // represents the limbs contribution to *this.hi Step 1: compute the max bit sizes of both slices
        const size_t lo_bits_in_limb_1 = LO_BITS - BigScalarField::NUM_LIMB_BITS;
        const size_t hi_bits_in_limb_1 = (static_cast<size_t>(limb1_max.get_msb()) + 1) - lo_bits_in_limb_1;

        // Step 2: compute the witness values of both slices
        const uint256_t limb_1 = limb1.get_value();
        const uint256_t limb_1_hi_multiplicand = (uint256_t(1) << lo_bits_in_limb_1);
        const uint256_t limb_1_hi_v = limb_1 >> lo_bits_in_limb_1;
        const uint256_t limb_1_lo_v = limb_1 - (limb_1_hi_v << lo_bits_in_limb_1);

        // Step 3: instantiate both slices as witnesses and validate their sum equals limb1
        field_t limb_1_lo = field_t::from_witness(ctx, limb_1_lo_v);
        field_t limb_1_hi = field_t::from_witness(ctx, limb_1_hi_v);

        // We need to propagate the origin tag to the chunks of limb1
        limb_1_lo.set_origin_tag(limb1.get_origin_tag());
        limb_1_hi.set_origin_tag(limb1.get_origin_tag());
        limb1.assert_equal(limb_1_hi * limb_1_hi_multiplicand + limb_1_lo);

        // Step 4: apply range constraints to validate both slices represent the expected contributions to *this.lo and
        // *this,hi
        limb_1_lo.create_range_constraint(lo_bits_in_limb_1);
        limb_1_hi.create_range_constraint(hi_bits_in_limb_1);

        // construct *this.lo out of:
        // a. `limb0` (the first NUM_LIMB_BITS bits of scalar)
        // b. `limb_1_lo` (the first LO_BITS - NUM_LIMB_BITS) of limb1
        lo = limb0 + (limb_1_lo * BigScalarField::shift_1);

        const uint256_t limb_2_shift = uint256_t(1) << (BigScalarField::NUM_LIMB_BITS - lo_bits_in_limb_1);
        const uint256_t limb_3_shift =
            uint256_t(1) << ((BigScalarField::NUM_LIMB_BITS - lo_bits_in_limb_1) + BigScalarField::NUM_LIMB_BITS);

        // construct *this.hi out of limb2, limb3 and the remaining term from limb1 not contributing to `lo`
        hi = limb_1_hi.add_two(limb2 * limb_2_shift, limb3 * limb_3_shift);
    }
    // We need to manually propagate the origin tag
    lo.set_origin_tag(scalar.get_origin_tag());
    hi.set_origin_tag(scalar.get_origin_tag());
};

template <typename Builder> bool cycle_scalar<Builder>::is_constant() const
{
    return (lo.is_constant() && hi.is_constant());
}

/**
 * @brief Checks that a cycle_scalar value is smaller than a prime field modulus when evaluated over the INTEGERS
 * N.B. The prime we check can be either the SNARK curve group order or the circuit's embedded curve group order
 * (i.e. BN254 or Grumpkin)
 * For a canonical scalar mul, we check against the embedded curve (i.e. the curve
 * cycle_group implements).
 * HOWEVER: for Pedersen hashes and Pedersen commitments, the hashed/committed data will be
 * native circuit field elements i.e. for a BN254 snark, cycle_group = Grumpkin and we will be committing/hashing
 * BN254::ScalarField values *NOT* Grumpkin::ScalarFIeld values.
 * TLDR: whether the input scalar has to be < BN254::ScalarField or < Grumpkin::ScalarField is context-dependent.
 *
 * @tparam Builder
 */
template <typename Builder> void cycle_scalar<Builder>::validate_scalar_is_in_field() const
{
    using FF = typename field_t::native;
    constexpr bool IS_ULTRA = Builder::CIRCUIT_TYPE == CircuitType::ULTRA;

    // AUDITTODO: Investigate using field_t::split_at here per Sergei's suggestion
    if (!is_constant() && !skip_primality_test()) {
        // Check that scalar.hi * 2^LO_BITS + scalar.lo < cycle_group_modulus when evaluated over the integers
        const uint256_t cycle_group_modulus =
            use_bn254_scalar_field_for_primality_test() ? FF::modulus : ScalarField::modulus;
        const auto [r_lo, r_hi] = decompose_into_lo_hi(cycle_group_modulus);

        bool need_borrow = uint256_t(lo.get_value()) > r_lo;
        field_t borrow = lo.is_constant() ? need_borrow : field_t::from_witness(get_context(), need_borrow);

        // directly call `create_new_range_constraint` to avoid creating an arithmetic gate
        if (!lo.is_constant()) {
            // We need to manually propagate the origin tag
            borrow.set_origin_tag(lo.get_origin_tag());
            if constexpr (IS_ULTRA) {
                get_context()->create_new_range_constraint(borrow.get_witness_index(), 1, "borrow");
            } else {
                borrow.assert_equal(borrow * borrow);
            }
        }
        // Hi range check = r_hi - y_hi - borrow
        // Lo range check = r_lo - y_lo + borrow * 2^{126}
        field_t hi_diff = (-hi + r_hi) - borrow;
        field_t lo_diff = (-lo + r_lo) + (borrow * (uint256_t(1) << LO_BITS));

        hi_diff.create_range_constraint(HI_BITS);
        lo_diff.create_range_constraint(LO_BITS);
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
