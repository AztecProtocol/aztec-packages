// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/bigfield/goblin_field.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace bb::stdlib::field_conversion {

template <typename Builder> using fr = field_t<Builder>;
template <typename Builder> using fq = bigfield<Builder, bb::Bn254FqParams>;
template <typename Builder> using bn254_element = element<Builder, fq<Builder>, fr<Builder>, curve::BN254::Group>;
template <typename Builder> using grumpkin_element = cycle_group<Builder>;

/**
 * @brief Check whether a point corresponds to (0, 0), the conventional representation of the point infinity.
 *
 * bn254: In the case of a bn254 point, the bigfield limbs (x_lo, x_hi, y_lo, y_hi) are range constrained, and their sum
 * is a non-negative integer not exceeding 2^138, i.e. it does not overflow the fq modulus, hence all limbs must be 0.
 *
 * Grumpkin: We are using the observation that (x^2 + 5 * y^2 = 0) has no non-trivial solutions in fr, since fr modulus
 * p == 2 mod 5, i.e. 5 is not a square mod p.
 *
 * @return
 */
template <typename Builder, typename T> bool_t<Builder> check_point_at_infinity(std::span<const fr<Builder>> fr_vec)
{
    if constexpr (IsAnyOf<T, bn254_element<Builder>>) {
        // Sum the limbs and check whether the sum is 0
        return (fr<Builder>::accumulate(std::vector<fr<Builder>>(fr_vec.begin(), fr_vec.end())).is_zero());
    } else {
        // Efficiently compute ((x^2 + 5 y^2) == 0)
        const fr<Builder> x_sqr = fr_vec[0].sqr();
        const fr<Builder> y = fr_vec[1];
        const fr<Builder> five_y = y * bb::fr(5);
        return (y.madd(five_y, x_sqr).is_zero());
    }
}

/**
 * @brief  A stdlib Transcript method needed to convert an `fr` challenge to a `bigfield` one. Assumes that `challenge`
 * is "short".
 *
 * @tparam T fr<Builder> or fq<Builder>
 * @param challenge a 128- or a 126- bit limb of a full challenge
 * @return T
 */
template <typename Builder, typename T> inline T convert_challenge(const fr<Builder>& challenge)
{
    if constexpr (std::is_same_v<T, fr<Builder>>) {
        return challenge;
    } else if constexpr (std::is_same_v<T, fq<Builder>>) {
        // Sanity check that the input challenge fits into the first 2 bigfield limbs.
        BB_ASSERT_LT(static_cast<uint256_t>(challenge.get_value()).get_msb(),
                     T::NUM_LIMB_BITS * 2,
                     "field_conversion: convert_challenge");
        Builder* builder = challenge.get_context();
        // All challenges must be circuit witnesses.
        ASSERT(builder);
        ASSERT(!challenge.is_constant());
        return T(challenge, fr<Builder>::from_witness_index(builder, builder->zero_idx));
    }
}

template <typename Builder>
inline std::vector<fr<Builder>> convert_goblin_fr_to_bn254_frs(const goblin_field<Builder>& input)
{
    return { input.limbs[0], input.limbs[1] };
}

template <typename Builder> inline std::vector<fr<Builder>> convert_grumpkin_fr_to_bn254_frs(const fq<Builder>& input)
{
    static constexpr uint64_t NUM_LIMB_BITS = fq<Builder>::NUM_LIMB_BITS;

    static constexpr bb::fr shift(static_cast<uint256_t>(1) << NUM_LIMB_BITS);
    std::vector<fr<Builder>> result(2);
    result[0] = input.binary_basis_limbs[0].element + (input.binary_basis_limbs[1].element * shift);
    result[1] = input.binary_basis_limbs[2].element + (input.binary_basis_limbs[3].element * shift);
    return result;
}
/**
 * @brief Calculates the size of a types (in their native form) in terms of fr<Builder>s
 * @details We want to support the following types: fr<Builder>, fq<Builder>,
 * bn254_element<Builder>, grumpkin_element<Builder, bb::Univariate<FF, N>, std::array<FF, N>, for
 * FF = fr<Builder> or fq<Builder>, and N is arbitrary
 * @tparam Builder
 * @tparam T
 * @return constexpr size_t
 */
template <typename Builder, typename T> constexpr size_t calc_num_bn254_frs()
{
    if constexpr (IsAnyOf<T, fr<Builder>>) {
        return Bn254FrParams::NUM_BN254_SCALARS;
    } else if constexpr (IsAnyOf<T, fq<Builder>, goblin_field<Builder>>) {
        return Bn254FqParams::NUM_BN254_SCALARS;
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>, grumpkin_element<Builder>>) {
        return 2 * calc_num_bn254_frs<Builder, typename T::BaseField>();
    } else {
        // Array or Univariate
        return calc_num_bn254_frs<Builder, typename T::value_type>() * (std::tuple_size<T>::value);
    }
}

/**
 * @brief Core stdlib Transcript deserialization method.
 * @details Deserializes a vector of in-circuit `fr`s, i.e. `field_t` elements, into
 * - `field_t` — no conversion needed
 *
 * - \ref bb::stdlib::bigfield< Builder, T > "bigfield" — 2 input `field_t`s are fed into `bigfield` constructor that
 * ensures that they are properly constrained. Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
 *
 * - \ref  bb::stdlib::goblin_field< Builder > "goblin field element" — in contrast to `bigfield`, range constraints are
 * performed in `Translator` (see \ref TranslatorDeltaRangeConstraintRelationImpl "Translator Range Constraint"
 * relation). Feed the limbs to the `bigfield` constructor and set the `point_at_infinity` flag derived by the
 * `check_point_at_infinity` method. Specific to \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
 *
 * - \ref bb::stdlib::element_goblin::goblin_element< Builder_, Fq, Fr, NativeGroup > "bn254 goblin point"  — input
 * vector of size 4 is transformed into a pair of `goblin_field` elements, which are fed into the relevant constructor
 * with the `point_at_infinity` flag derived by the `check_point_at_infinity` method. Note that `validate_on_curve` is a
 * vacuous method in this case, as these checks are performed in ECCVM
 * (see \ref bb::ECCVMTranscriptRelationImpl< FF_ > "ECCVM Transcript" relation).
 * Specific to \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
 *
 * - \ref bb::stdlib::element_default::element< Builder_, Fq, Fr, NativeGroup > "bn254 point" — reconstruct a pair of
 * `bigfield` elements (x, y), check whether the resulting point is a point at infinity and ensure it lies on the curve.
 * Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
 *
 * - \ref cycle_group "Grumpkin point" — since the grumpkin base field is `fr`, the reconstruction is trivial. We check
 *   in-circuit whether the resulting point lies on the curve and whether it is a point at infinity.
 *   Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
 *
 * - `Univariate` or a `std::array` of elements of the above types.
 *
 * @tparam Builder `UltraCircuitBuilder` or `MegaCircuitBuilder`
 * @tparam T Target object type
 * @param fr_vec Input `field_t` elements
 */
template <typename Builder, typename T> T convert_from_bn254_frs(std::span<const fr<Builder>> fr_vec)
{
    using field_ct = fr<Builder>;
    using bigfield_ct = fq<Builder>;

    constexpr size_t expected_size = calc_num_bn254_frs<Builder, T>();
    BB_ASSERT_EQ(fr_vec.size(), expected_size);

    ASSERT(validate_context<Builder>(fr_vec));

    if constexpr (IsAnyOf<T, field_ct>) {
        // Case 1: input type matches the output type
        return fr_vec[0];
    } else if constexpr (IsAnyOf<T, bigfield_ct, goblin_field<Builder>>) {
        // Cases 2 and 3: a bigfield/goblin_field element is reconstructed from low and high limbs.
        return T(fr_vec[0], fr_vec[1]);
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>, grumpkin_element<Builder>>) {
        // Case 4 and 5: Convert a vector of frs to a group element
        using Basefield = T::BaseField;

        constexpr size_t base_field_frs = expected_size / 2;

        Basefield x = convert_from_bn254_frs<Builder, Basefield>(fr_vec.subspan(0, base_field_frs));
        Basefield y = convert_from_bn254_frs<Builder, Basefield>(fr_vec.subspan(base_field_frs, base_field_frs));

        T out(x, y, check_point_at_infinity<Builder, T>(fr_vec));
        // Note that in the case of bn254 with Mega arithmetization, the check is delegated to ECCVM, see
        // `on_curve_check` in `ECCVMTranscriptRelationImpl`.
        out.validate_on_curve();
        return out;
    } else {
        // Case 6: Array or Univariate
        T val;
        using element_type = typename T::value_type;
        const size_t scalar_frs = calc_num_bn254_frs<Builder, element_type>();

        size_t i = 0;
        for (auto& x : val) {
            x = convert_from_bn254_frs<Builder, element_type>(fr_vec.subspan(scalar_frs * i, scalar_frs));
            ++i;
        }
        return val;
    }
}

/**
 * @brief Core stdlib Transcript serialization method.
 * @details Serializes an object into a flat vector of in-circuit `fr`, i.e. \ref bb::stdlib::field_t "field_t"
 * elements. This is the inverse of \ref convert_from_bn254_frs (up to the
 * conventional point-at-infinity representation; see TODO below).
 *
 * Serializes the following types:
 *
 * - \ref bb::stdlib::field_t "field_t" — no conversion needed; output a single `fr`.
 *
 * - \ref bb::stdlib::bigfield "bigfield" (\ref bb::stdlib::bigfield< Builder, T >) — output 2 `fr` limbs obtained from
 *   the bigfield’s binary-basis limbs recombined according to `NUM_LIMB_BITS`. Specific to
 *   \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
 *
 * - \ref bb::stdlib::goblin_field "goblin field element" (\ref bb::stdlib::goblin_field< Builder >) — emit 2 `fr` limbs
 *   by exposing the goblin field’s internal limbs (low, high) as-is. Range constraints are enforced in Translator
 *   (see \ref TranslatorDeltaRangeConstraintRelationImpl "Translator Range Constraint" relation). Specific to
 *   \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
 *
 * - \ref bb::stdlib::element_goblin::goblin_element "bn254 goblin point"
 *   (\ref bb::stdlib::element_goblin::goblin_element< Builder_, Fq, Fr, NativeGroup >) — serialize the pair of
 *   coordinates `(x, y)` by concatenating the encodings of each coordinate in the base field (goblin/bigfield form).
 *   The point-at-infinity flag is not emitted here; it is re-derived during deserialization via
 *   \ref check_point_at_infinity. Specific to \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
 *
 * - \ref bb::stdlib::element_default::element "bn254 point"
 *   (\ref bb::stdlib::element_default::element< Builder_, Fq, Fr, NativeGroup >) — serialize `(x, y)` by concatenating
 *   the encodings of the two \ref bb::stdlib::bigfield "bigfield" coordinates. Specific to
 *   \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
 *
 * - \ref cycle_group "Grumpkin point" — serialize `(x, y)` in the base field `fr` by concatenating their encodings.
 *   The point-at-infinity flag is not emitted; it is re-derived during deserialization via
 *   \ref check_point_at_infinity. Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
 *
 * - `bb::Univariate<FF, N>` or `std::array<FF, N>` of any of the above — serialize element-wise and concatenate.
 *
 * Round-trip note:
 * - For supported types, `convert_to_bn254_frs(val)` followed by `convert_from_bn254_frs<T>(...)` reconstructs an
 *   equivalent in-circuit object, assuming the same arithmetization and that range/ECC checks are enforced where
 *   applicable during reconstruction (see \ref bb::ECCVMTranscriptRelationImpl< FF_ > "ECCVM Transcript" relation).
 *
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1527): make the point-at-infinity representation fully
 * uniform across (de)serialization paths.
 *
 * @tparam Builder `UltraCircuitBuilder` or `MegaCircuitBuilder`
 * @tparam T       Target object type
 * @param val      Value to serialize
 * @return         Flat vector of `fr<Builder>` elements
 */
template <typename Builder, typename T> std::vector<fr<Builder>> convert_to_bn254_frs(const T& val)
{
    using field_ct = fr<Builder>;
    using bigfield_ct = fq<Builder>;

    if constexpr (IsAnyOf<T, field_ct>) {
        return std::vector<T>{ val };
    } else if constexpr (IsAnyOf<T, bigfield_ct>) {
        return convert_grumpkin_fr_to_bn254_frs(val);
    } else if constexpr (IsAnyOf<T, goblin_field<Builder>>) {
        return convert_goblin_fr_to_bn254_frs(val);
    } else if constexpr (IsAnyOf<T, bn254_element<Builder>, grumpkin_element<Builder>>) {
        using BaseField = T::BaseField;

        std::vector<field_ct> fr_vec_x = convert_to_bn254_frs<Builder, BaseField>(val.x);
        std::vector<field_ct> fr_vec_y = convert_to_bn254_frs<Builder, BaseField>(val.y);
        std::vector<field_ct> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
        fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
        return fr_vec;
    } else {
        // Array or Univariate
        std::vector<field_ct> fr_vec;
        for (auto& x : val) {
            auto tmp_vec = convert_to_bn254_frs<Builder, typename T::value_type>(x);
            fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
        }
        return fr_vec;
    }
}

/**
 * @brief A stdlib VerificationKey-specific method.
 *
 * @details Deserialize an object of specified type from a buffer of field elements; update provided read count in place
 *
 * @tparam TargetType Type to reconstruct from buffer of field elements
 * @param elements Buffer of `field_t` elements
 * @param num_frs_read Index at which to read into buffer
 */
template <typename TargetType, typename Builder>
TargetType deserialize_from_frs(std::span<fr<Builder>> elements, size_t& num_frs_read)
{
    constexpr size_t num_frs = calc_num_bn254_frs<Builder, TargetType>();
    BB_ASSERT_GTE(elements.size(), num_frs_read + num_frs);
    TargetType result = convert_from_bn254_frs<Builder, TargetType>(elements.subspan(num_frs_read, num_frs));
    num_frs_read += num_frs;
    return result;
}

} // namespace bb::stdlib::field_conversion
