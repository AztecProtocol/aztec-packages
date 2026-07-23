// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: 777717f6af324188ecd6bb68c3c86ee7befef94d}
// external_1:  { status: Complete, auditors: [@ed25519 (Spearbit)], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file field_conversion.hpp
 * @brief StdlibCodec for in-circuit (recursive) verification transcript handling.
 *
 * @details See ecc/fields/CODEC_README.md
 */

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/bigfield/goblin_field.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/field/field_utils.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace bb::stdlib {

template <typename Field> class StdlibCodec {
  public:
    using DataType = Field;
    using Builder = typename Field::Builder;
    using fr = field_t<Builder>;
    using fq = bigfield<Builder, bb::Bn254FqParams>;
    using bn254_commitment = element<Builder, fq, fr, curve::BN254::Group>;
    using grumpkin_commitment = cycle_group<Builder>;

    /**
     * @brief  A stdlib Transcript method needed to convert an `fr` challenge to a `bigfield` one. Assumes that
     * `challenge` is "short".
     *
     * @tparam T fr or fq
     * @param challenge a 127-bit limb of a full challenge
     * @return T
     */
    template <typename T> static T convert_challenge(const fr& challenge)
    {
        if constexpr (std::is_same_v<T, fr>) {
            return challenge;
        } else if constexpr (std::is_same_v<T, fq>) {
            // Sanity check that the input challenge fits into the first 2 bigfield limbs.
            BB_ASSERT_LT(static_cast<uint256_t>(challenge.get_value()).get_msb(),
                         T::NUM_LIMB_BITS * 2,
                         "field_conversion: convert_challenge");
            Builder* builder = challenge.get_context();
            // All challenges must be circuit witnesses.
            BB_ASSERT(builder);
            BB_ASSERT(!challenge.is_constant());
            auto high_limb = fr::from_witness_index(builder, builder->zero_idx());
            high_limb.set_origin_tag(challenge.get_origin_tag());
            return T(challenge, high_limb);
        }
    }

    static std::vector<fr> convert_goblin_fr_to_bn254_frs(const goblin_field<Builder>& input)
    {
        return { input.limbs[0], input.limbs[1] };
    }

    static std::vector<fr> convert_grumpkin_fr_to_bn254_frs(const fq& input)
    {
        static constexpr uint64_t NUM_LIMB_BITS = fq::NUM_LIMB_BITS;

        static constexpr bb::fr shift(static_cast<uint256_t>(1) << NUM_LIMB_BITS);
        std::vector<fr> result(2);
        result[0] = input.get_limb(0).element + (input.get_limb(1).element * shift);
        result[1] = input.get_limb(2).element + (input.get_limb(3).element * shift);
        return result;
    }

    /**
     * @brief Calculates the size of a type (in its native form) in terms of frs.
     */
    template <typename T> static constexpr size_t calc_num_fields()
    {
        if constexpr (IsAnyOf<T, fr>) {
            return Bn254FrParams::NUM_BN254_SCALARS;
        } else if constexpr (IsAnyOf<T, fq, goblin_field<Builder>>) {
            return Bn254FqParams::NUM_BN254_SCALARS;
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            return 2 * calc_num_fields<typename T::BaseField>();
        } else {
            // Array or Univariate
            return calc_num_fields<typename T::value_type>() * (std::tuple_size<T>::value);
        }
    }

    /**
     * @brief Core stdlib Transcript deserialization method.
     * @details Deserializes a vector of in-circuit `fr`s, i.e. `field_t` elements, into
     * - `field_t` — no conversion needed
     *
     * - \ref bb::stdlib::bigfield< Builder, T > "bigfield" — 2 input `field_t`s are fed into `bigfield` constructor,
     * then `assert_is_in_field()` is called to reject aliased values (>= Fq::modulus). This ensures consistency with
     * native FrCodec which also rejects aliases. Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
     *
     * - \ref  bb::stdlib::goblin_field< Builder > "goblin field element" — stores limbs as-is without in-circuit
     * modulus check. Range constraints are deferred to Translator circuit (see \ref
     * TranslatorDeltaRangeConstraintRelationImpl "Translator Range Constraint" relation).
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1607): Translator only enforces <254-bit constraints,
     * NOT strict <q checks, creating verification inconsistency with native/Ultra.
     * Specific to \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
     *
     * - \ref bb::stdlib::element_goblin::goblin_element< Builder_, Fq, Fr, NativeGroup > "bn254 goblin point"  — input
     * vector of size 4 is transformed into a pair of `goblin_field` elements, which are fed into the 2-arg constructor.
     * Point-at-infinity is represented as (0, 0) and validated by ECCVM (see \ref
     * bb::ECCVMTranscriptRelationImpl< FF_ > "ECCVM Transcript" relation). Specific to \ref MegaCircuitBuilder_
     * "MegaCircuitBuilder".
     *
     * - \ref bb::stdlib::element_default::element< Builder_, Fq, Fr, NativeGroup > "bn254 point" — reconstruct a pair
     * of `bigfield` elements (x, y), check whether the resulting point is a point at infinity and ensure it lies on the
     * curve. Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
     *
     * - \ref cycle_group "Grumpkin point" — since the grumpkin base field is `fr`, the reconstruction is trivial. We
     * check in-circuit whether the resulting point lies on the curve and whether it is a point at infinity. Specific to
     * \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
     *
     * - `Univariate` or a `std::array` of elements of the above types.
     *
     * @tparam Builder `UltraCircuitBuilder` or `MegaCircuitBuilder`
     * @tparam T Target object type
     * @param fr_vec Input `field_t` elements
     */
    template <typename T> static T deserialize_from_fields(std::span<const fr> fr_vec)
    {
        using field_ct = fr;
        using bigfield_ct = fq;

        constexpr size_t expected_size = calc_num_fields<T>();
        BB_ASSERT_EQ(fr_vec.size(), expected_size);

        BB_ASSERT(validate_context<Builder>(fr_vec));

        if constexpr (IsAnyOf<T, field_ct>) {
            // Case 1: input type matches the output type
            return fr_vec[0];
        } else if constexpr (IsAnyOf<T, bigfield_ct>) {
            // Case 2: bigfield is reconstructed from low and high limbs with in-field validation.
            // This ensures aliased values (>= Fq::modulus) are rejected.
            T result(fr_vec[0], fr_vec[1]);
            result.assert_is_in_field();
            return result;
        } else if constexpr (IsAnyOf<T, goblin_field<Builder>>) {
            // Case 3: goblin_field stores limbs as-is; range validation is deferred to Translator circuit.
            return T(fr_vec[0], fr_vec[1]);
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            // Case 4 and 5: Convert a vector of frs to a group element
            using Basefield = typename T::BaseField;

            constexpr size_t base_field_frs = expected_size / 2;

            Basefield x = deserialize_from_fields<Basefield>(fr_vec.subspan(0, base_field_frs));
            Basefield y = deserialize_from_fields<Basefield>(fr_vec.subspan(base_field_frs, base_field_frs));

            // Construct the group element (validates the point is on curve).
            // The 2-arg constructor auto-detects infinity from (x == 0 && y == 0).
            // For goblin_element (bn254 with Mega arithmetization), the on-curve check is delegated to ECCVM, see
            // `on_curve_check` in `ECCVMTranscriptRelationImpl`.
            return T(x, y, /*assert_on_curve=*/true);
        } else {
            // Case 6: Array or Univariate
            T val;
            using element_type = typename T::value_type;
            const size_t scalar_frs = calc_num_fields<element_type>();

            size_t i = 0;
            for (auto& x : val) {
                x = deserialize_from_fields<element_type>(fr_vec.subspan(scalar_frs * i, scalar_frs));
                ++i;
            }
            return val;
        }
    }

    /**
     * @brief Core stdlib Transcript serialization method.
     * @details Serializes an object into a flat vector of in-circuit `fr`, i.e. \ref bb::stdlib::field_t "field_t"
     * elements. This is the inverse of \ref deserialize_from_fields (up to the
     * conventional point-at-infinity representation; see TODO below).
     *
     * Serializes the following types:
     *
     * - \ref bb::stdlib::field_t "field_t" — no conversion needed; output a single `fr`.
     *
     * - \ref bb::stdlib::bigfield "bigfield" (\ref bb::stdlib::bigfield< Builder, T >) — output 2 `fr` limbs obtained
     * from the bigfield’s binary-basis limbs recombined according to `NUM_LIMB_BITS`. Specific to
     *   \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
     *
     * - \ref bb::stdlib::goblin_field "goblin field element" (\ref bb::stdlib::goblin_field< Builder >) — emit 2 `fr`
     * limbs by exposing the goblin field’s internal limbs (low, high) as-is. Range constraints are enforced in
     * Translator (see \ref TranslatorDeltaRangeConstraintRelationImpl "Translator Range Constraint" relation). Specific
     * to
     *   \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
     *
     * - \ref bb::stdlib::element_goblin::goblin_element "bn254 goblin point"
     *   (\ref bb::stdlib::element_goblin::goblin_element< Builder_, Fq, Fr, NativeGroup >) — serialize the pair of
     *   coordinates `(x, y)` by concatenating the encodings of each coordinate in the base field (goblin/bigfield
     * form). Point-at-infinity is represented as (0, 0); ECCVM validates this.
     * Specific to \ref MegaCircuitBuilder_ "MegaCircuitBuilder".
     *
     * - \ref bb::stdlib::element_default::element "bn254 point"
     *   (\ref bb::stdlib::element_default::element< Builder_, Fq, Fr, NativeGroup >) — serialize `(x, y)` by
     * concatenating the encodings of the two \ref bb::stdlib::bigfield "bigfield" coordinates. Specific to
     *   \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
     *
     * - \ref cycle_group "Grumpkin point" — serialize `(x, y)` in the base field `fr` by concatenating their encodings.
     *   The point-at-infinity flag is re-derived from coordinates during deserialization.
     *   Specific to \ref UltraCircuitBuilder_ "UltraCircuitBuilder".
     *
     * - `bb::Univariate<FF, N>` or `std::array<FF, N>` of any of the above — serialize element-wise and concatenate.
     *
     * Round-trip note:
     * - For supported types, `serialize_to_fields(val)` followed by `deserialize_from_fields<T>(...)` reconstructs an
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
    template <typename T> static std::vector<fr> serialize_to_fields(const T& val)
    {
        using field_ct = fr;
        using bigfield_ct = fq;

        if constexpr (IsAnyOf<T, field_ct>) {
            return std::vector<T>{ val };
        } else if constexpr (IsAnyOf<T, bigfield_ct>) {
            return convert_grumpkin_fr_to_bn254_frs(val);
        } else if constexpr (IsAnyOf<T, goblin_field<Builder>>) {
            return convert_goblin_fr_to_bn254_frs(val);
        } else if constexpr (IsAnyOf<T, grumpkin_commitment>) {
            // Canonicalize: output (0,0) for infinity points, critical for the IPA accumulation flow.
            auto is_inf = val.is_point_at_infinity();
            fr canon_x = fr::conditional_assign(is_inf, fr(0), val.x());
            fr canon_y = fr::conditional_assign(is_inf, fr(0), val.y());
            return { canon_x, canon_y };
        } else if constexpr (IsAnyOf<T, bn254_commitment>) {
            // bn254_commitment serialization does not standardize infinity (unlike grumpkin_commitment above).
            // All existing code paths produce canonical (0,0) infinity, so just assert that invariant.
            if (val.get_value().is_point_at_infinity()) {
                BB_ASSERT(val.x().get_value() == 0 && val.y().get_value() == 0,
                          "serialize_to_fields: bn254_commitment point at infinity must be canonical (0,0)");
            }
            using BaseField = typename T::BaseField;

            std::vector<field_ct> fr_vec_x = serialize_to_fields<BaseField>(val.x());
            std::vector<field_ct> fr_vec_y = serialize_to_fields<BaseField>(val.y());
            std::vector<field_ct> fr_vec(fr_vec_x.begin(), fr_vec_x.end());
            fr_vec.insert(fr_vec.end(), fr_vec_y.begin(), fr_vec_y.end());
            return fr_vec;
        } else {
            // Array or Univariate
            std::vector<field_ct> fr_vec;
            for (auto& x : val) {
                auto tmp_vec = serialize_to_fields<typename T::value_type>(x);
                fr_vec.insert(fr_vec.end(), tmp_vec.begin(), tmp_vec.end());
            }
            return fr_vec;
        }
    }
    /**
     * @brief Split a challenge field element into two equal-width challenges
     * @details Both `lo` and `hi` are 127 bits each (254/2) which provides significantly more than our security
     * parameter bound: 100 bits. The decomposition is constrained to be unique.
     *
     * @param challenge
     * @return std::array<DataType, 2>
     */
    static std::array<fr, 2> split_challenge(const fr& challenge)
    {
        constexpr size_t TOTAL_BITS = fr::native::modulus.get_msb() + 1; // 254
        constexpr size_t lo_bits = TOTAL_BITS / 2;                       // 127
        // Construct a unique lo/hi decomposition of the challenge (hi_bits will be 127)
        const auto [lo, hi] = split_unique(challenge, lo_bits);
        return std::array<fr, 2>{ lo, hi };
    }

    /**
     * @brief A stdlib VerificationKey-specific method.
     *
     * @details Deserialize an object of specified type from a buffer of field elements; update provided read count in
     * place
     *
     * @tparam TargetType Type to reconstruct from buffer of field elements
     * @param elements Buffer of `field_t` elements
     * @param num_frs_read Index at which to read into buffer
     */
    template <typename TargetType> static TargetType deserialize_from_frs(std::span<fr> elements, size_t& num_frs_read)
    {
        constexpr size_t num_frs = calc_num_fields<TargetType>();
        BB_ASSERT_GTE(elements.size(), num_frs_read + num_frs);
        TargetType result = deserialize_from_fields<TargetType>(elements.subspan(num_frs_read, num_frs));
        num_frs_read += num_frs;
        return result;
    }
};
} // namespace bb::stdlib
