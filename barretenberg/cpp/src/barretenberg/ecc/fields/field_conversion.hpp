// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/type_traits.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp" // NUM_LIMB_BITS_IN_FIELD_SIMULATION

namespace bb {

class FrCodec {
  public:
    using DataType = bb::fr;
    using fr = bb::fr;
    using fq = grumpkin::fr;
    using bn254_commitment = curve::BN254::AffineElement;
    using grumpkin_commitment = curve::Grumpkin::AffineElement;

    // Size calculators
    template <typename T> static constexpr size_t calc_num_fields()
    {
        if constexpr (IsAnyOf<T, uint32_t, uint64_t, bool>) {
            return 1;
        } else if constexpr (IsAnyOf<T, bb::fr, fq>) {
            return T::Params::NUM_BN254_SCALARS;
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            return 2 * calc_num_fields<typename T::Fq>();
        } else {
            // Array or Univariate
            return calc_num_fields<typename T::value_type>() * (std::tuple_size<T>::value);
        }
    }

    /**
     * @brief Check whether raw limbs represent the point at infinity (all limbs zero).
     * @details This matches the circuit behavior in StdlibCodec::check_point_at_infinity.
     * We check raw limbs BEFORE deserializing to field elements to ensure that alias
     * values (e.g., x=modulus, y=modulus) are NOT treated as point at infinity.
     * Only the canonical (0,0) representation with all-zero limbs is accepted.
     */
    template <typename T> static bool check_point_at_infinity(std::span<const bb::fr> fr_vec)
    {
        // Check if all limbs are zero - this is the only canonical representation of infinity
        for (const auto& limb : fr_vec) {
            if (!limb.is_zero()) {
                return false;
            }
        }
        return true;
    }

    /**
     * @brief Converts 2 bb::fr elements to fq
     * @details Splits into 136-bit lower chunk and 118-bit upper chunk to mirror stdlib bigfield limbs (68-bit each).
     * Rejects aliased values (>= fq::modulus) to ensure canonical representation.
     */
    static fq convert_grumpkin_fr_from_bn254_frs(std::span<const bb::fr> fr_vec)
    {
        // expects 2 fr limbs; caller already asserts size
        constexpr uint64_t NUM_LIMB_BITS = stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION; // 68
        constexpr uint64_t TOTAL_BITS = 254;

        BB_ASSERT_LT(uint256_t(fr_vec[0]),
                     (uint256_t(1) << (NUM_LIMB_BITS * 2)),
                     "Conversion error here usually implies some bad proof serde or parsing");
        BB_ASSERT_LT(uint256_t(fr_vec[1]),
                     (uint256_t(1) << (TOTAL_BITS - NUM_LIMB_BITS * 2)),
                     "Conversion error here usually implies some bad proof serde or parsing");

        const uint256_t value = uint256_t(fr_vec[0]) + (uint256_t(fr_vec[1]) << (NUM_LIMB_BITS * 2));

        // Reject aliased values to ensure canonical representation.
        // This matches the circuit behavior in StdlibCodec where assert_is_in_field is called.
        BB_ASSERT_LT(value, fq::modulus, "Non-canonical field element: value >= fq::modulus");

        return fq(value);
    }

    /**
     * @brief Converts fq to 2 bb::fr elements (inverse of the above).
     */
    static std::vector<bb::fr> convert_grumpkin_fr_to_bn254_frs(const fq& val)
    {
        constexpr uint64_t NUM_LIMB_BITS = stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION; // 68
        constexpr uint64_t TOTAL_BITS = 254;

        constexpr uint64_t LOWER_BITS = 2 * NUM_LIMB_BITS; // 136
        constexpr uint256_t LOWER_MASK = (uint256_t(1) << LOWER_BITS) - 1;

        const uint256_t value = uint256_t(val);
        BB_ASSERT_LT(value, (uint256_t(1) << TOTAL_BITS));

        std::vector<bb::fr> out(2);
        out[0] = static_cast<uint256_t>(value & LOWER_MASK);
        out[1] = static_cast<uint256_t>(value >> LOWER_BITS);

        BB_ASSERT_LT(static_cast<uint256_t>(out[1]), (uint256_t(1) << (TOTAL_BITS - LOWER_BITS)));
        return out;
    }

    // ---------------------------------------------------------------------
    // Deserialize
    // ---------------------------------------------------------------------
    template <typename T> static T deserialize_from_fields(std::span<const fr> fr_vec)
    {
        BB_ASSERT_EQ(fr_vec.size(), calc_num_fields<T>());
        if constexpr (IsAnyOf<T, bool>) {
            return static_cast<bool>(fr_vec[0]);
        } else if constexpr (IsAnyOf<T, uint32_t, uint64_t, bb::fr>) {
            return static_cast<T>(fr_vec[0]);
        } else if constexpr (IsAnyOf<T, fq>) {
            return convert_grumpkin_fr_from_bn254_frs(fr_vec);
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            using BaseField = typename T::Fq;
            constexpr size_t BASE = calc_num_fields<BaseField>();

            // Check for point at infinity BEFORE deserializing to avoid alias issues.
            // Only canonical (0,0) with all-zero limbs is accepted as infinity.
            // This matches circuit behavior in StdlibCodec::check_point_at_infinity.
            if (check_point_at_infinity<T>(fr_vec)) {
                return T::infinity();
            }

            // Deserialize coordinates (this will reject non-canonical values via BB_ASSERT)
            T val;
            val.x = deserialize_from_fields<BaseField>(fr_vec.subspan(0, BASE));
            val.y = deserialize_from_fields<BaseField>(fr_vec.subspan(BASE, BASE));
            if (!val.on_curve()) {
                throw_or_abort("Deserialized point is not on the curve");
            }
            return val;
        } else {
            // Array or Univariate
            T val;
            constexpr size_t SZ = calc_num_fields<typename T::value_type>();
            size_t i = 0;
            for (auto& x : val) {
                x = deserialize_from_fields<typename T::value_type>(fr_vec.subspan(SZ * i, SZ));
                ++i;
            }
            return val;
        }
    }

    /**
     * @brief Conversion from transcript values to bb::frs
     */
    template <typename T> static std::vector<fr> serialize_to_fields(const T& val)
    {
        if constexpr (IsAnyOf<T, bool, uint32_t, uint64_t, bb::fr>) {
            return { val };
        } else if constexpr (IsAnyOf<T, fq>) {
            return convert_grumpkin_fr_to_bn254_frs(val);
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            using BaseField = typename T::Fq;
            std::vector<bb::fr> fr_vec_x =
                val.is_point_at_infinity() ? serialize_to_fields(BaseField::zero()) : serialize_to_fields(val.x);
            std::vector<bb::fr> fr_vec_y =
                val.is_point_at_infinity() ? serialize_to_fields(BaseField::zero()) : serialize_to_fields(val.y);
            // Use move + append to avoid iterator-based insert that triggers GCC false positive
            std::vector<bb::fr> fr_vec = std::move(fr_vec_x);
            fr_vec.reserve(fr_vec.size() + fr_vec_y.size());
            for (auto& e : fr_vec_y) {
                fr_vec.push_back(std::move(e));
            }
            return fr_vec;
        } else {
            // Array or Univariate
            std::vector<fr> out;
            for (auto& x : val) {
                auto tmp = serialize_to_fields(x);
                for (auto& e : tmp) {
                    out.push_back(std::move(e));
                }
            }
            return out;
        }
    }

    /**
     * @brief Split a challenge field element into two equal-width challenges
     * @details Both `lo` and `hi` are 127 bits each (254/2) which provides significantly more than our security
     * parameter bound: 100 bits. The decomposition is constrained to be unique.
     *
     * @param challenge
     * @return std::array<bb::fr, 2>
     */
    static std::array<bb::fr, 2> split_challenge(const bb::fr& challenge)
    {
        static constexpr size_t TOTAL_BITS = bb::fr::modulus.get_msb() + 1; // 254
        static constexpr size_t LO_BITS = TOTAL_BITS / 2;                   // 127
        static constexpr size_t HI_BITS = TOTAL_BITS - LO_BITS;             // 127

        const uint256_t u = static_cast<uint256_t>(challenge);
        const uint256_t lo = u.slice(0, LO_BITS);
        const uint256_t hi = u.slice(LO_BITS, LO_BITS + HI_BITS);

        return { bb::fr(lo), bb::fr(hi) };
    }

    /**
     * @brief Convert a short (≤127-bit limb) challenge to a target type (fr or fq).
     * @details Input is a single 127-bit limb produced by `split_challenge`. For `fq` (a Grumpkin scalar) the
     * value must fit in the lower two simulated bigfield limbs, which is what the short width guarantees.
     */
    template <typename T> static T convert_short_challenge(const bb::fr& challenge)
    {
        if constexpr (std::is_same_v<T, bb::fr>) {
            return challenge;
        } else if constexpr (std::is_same_v<T, fq>) {
            BB_ASSERT_LT(static_cast<uint256_t>(challenge).get_msb(),
                         2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION,
                         "field_conversion: convert challenge");
            return fq(challenge);
        }
    }

    /**
     * @brief Convert a full-width challenge to a target type (fr or fq).
     * @details For `fq` (a Grumpkin scalar) the conversion is exact and canonical: the BN254 scalar modulus `r`
     * is smaller than the base modulus `q`, so every challenge value (`< r`) is `< q` and reinterprets directly
     * as an `fq` element with no reduction. This mirrors the recursive `StdlibCodec::convert_full_challenge`,
     * which splits the same value into bigfield limbs.
     */
    template <typename T> static T convert_full_challenge(const bb::fr& challenge)
    {
        if constexpr (std::is_same_v<T, bb::fr>) {
            return challenge;
        } else if constexpr (std::is_same_v<T, fq>) {
            return fq(static_cast<uint256_t>(challenge));
        }
    }
};

class U256Codec {
  public:
    using DataType = uint256_t;
    using fr = bb::fr;
    using fq = grumpkin::fr;
    using bn254_commitment = curve::BN254::AffineElement;
    using grumpkin_commitment = curve::Grumpkin::AffineElement;

    // Size calculators
    template <typename T> static constexpr size_t calc_num_fields()
    {
        if constexpr (IsAnyOf<T, uint32_t, uint64_t, uint256_t, bool, fq, bb::fr>) {
            return 1;
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            // In contrast to bb::fr, bn254 points can be represented by only 2 uint256_t elements
            return 2;
        } else {
            // Array or Univariate
            return calc_num_fields<typename T::value_type>() * (std::tuple_size<T>::value);
        }
    }

    // ---------------------------------------------------------------------
    // Deserialize
    // ---------------------------------------------------------------------
    template <typename T> static T deserialize_from_fields(std::span<const uint256_t> vec)
    {
        BB_ASSERT_EQ(vec.size(), calc_num_fields<T>());
        if constexpr (IsAnyOf<T, bool>) {
            return static_cast<bool>(vec[0]);
        } else if constexpr (IsAnyOf<T, bb::fr>) {
            BB_ASSERT_LT(
                vec[0], uint256_t(bb::fr::modulus), "Non-canonical scalar field element: value >= fr::modulus");
            return static_cast<T>(vec[0]);
        } else if constexpr (IsAnyOf<T, fq>) {
            BB_ASSERT_LT(vec[0], uint256_t(fq::modulus), "Non-canonical base field element: value >= fq::modulus");
            return static_cast<T>(vec[0]);
        } else if constexpr (IsAnyOf<T, uint32_t, uint64_t, uint256_t>) {
            return static_cast<T>(vec[0]);
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            using BaseField = typename T::Fq;
            constexpr size_t N = calc_num_fields<BaseField>();
            T val;
            val.x = deserialize_from_fields<BaseField>(vec.subspan(0, N));
            val.y = deserialize_from_fields<BaseField>(vec.subspan(N, N));
            if (val.x == BaseField::zero() && val.y == BaseField::zero()) {
                val.self_set_infinity();
            }
            if (!val.on_curve()) {
                throw_or_abort("Deserialized point is not on the curve");
            }
            return val;
        } else {
            // Array or Univariate
            T val;
            constexpr size_t SZ = calc_num_fields<typename T::value_type>();
            size_t i = 0;
            for (auto& x : val) {
                x = deserialize_from_fields<typename T::value_type>(vec.subspan(SZ * i, SZ));
                ++i;
            }
            return val;
        }
    }

    /**
     * @brief Conversion from transcript values to `uint256_t`s
     */
    template <typename T> static std::vector<uint256_t> serialize_to_fields(const T& val)
    {
        if constexpr (IsAnyOf<T, bool, uint32_t, uint64_t, uint256_t, bb::fr, fq>) {
            return { val };
        } else if constexpr (IsAnyOf<T, bn254_commitment, grumpkin_commitment>) {
            using BaseField = typename T::Fq;
            std::vector<uint256_t> uint256_vec_x;
            std::vector<uint256_t> uint256_vec_y;
            // When encountering a point at infinity we pass a zero point in the proof to ensure that on the receiving
            // size there are no inconsistencies whenre constructing and hashing.
            if (val.is_point_at_infinity()) {
                uint256_vec_x = serialize_to_fields(BaseField::zero());
                uint256_vec_y = serialize_to_fields(BaseField::zero());
            } else {
                uint256_vec_x = serialize_to_fields<BaseField>(val.x);
                uint256_vec_y = serialize_to_fields<BaseField>(val.y);
            }
            std::vector<uint256_t> uint256_vec(uint256_vec_x.begin(), uint256_vec_x.end());
            uint256_vec.insert(uint256_vec.end(), uint256_vec_y.begin(), uint256_vec_y.end());
            return uint256_vec;
        } else {
            // Array or Univariate
            std::vector<uint256_t> out;
            for (auto& e : val) {
                auto tmp = serialize_to_fields(e);
                out.insert(out.end(), tmp.begin(), tmp.end());
            }
            return out;
        }
    }

    /**
     * @brief Split a challenge field element into two equal-width challenges
     * @details Both `lo` and `hi` are 127 bits each (254/2) which provides significantly more than our security
     * parameter bound: 100 bits. The decomposition is constrained to be unique.
     *
     * @param challenge
     * @return std::array<uint256_t, 2>
     */
    static std::array<uint256_t, 2> split_challenge(const uint256_t& challenge)
    {
        static constexpr size_t TOTAL_BITS = bb::fr::modulus.get_msb() + 1; // 254
        static constexpr size_t LO_BITS = TOTAL_BITS / 2;                   // 127
        static constexpr size_t HI_BITS = TOTAL_BITS - LO_BITS;             // 127

        const uint256_t u = static_cast<uint256_t>(challenge);
        const uint256_t lo = u.slice(0, LO_BITS);
        const uint256_t hi = u.slice(LO_BITS, LO_BITS + HI_BITS);

        return { uint256_t(lo), uint256_t(hi) };
    }

    /**
     * @brief Convert a short (≤127-bit limb) challenge to a target type (fr or fq).
     */
    template <typename T> static T convert_short_challenge(const bb::fr& challenge)
    {
        if constexpr (std::is_same_v<T, bb::fr>) {
            return challenge;
        } else if constexpr (std::is_same_v<T, fq>) {
            BB_ASSERT_LT(static_cast<uint256_t>(challenge).get_msb(),
                         2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION,
                         "field_conversion: convert challenge");
            return fq(challenge);
        }
    }

    /**
     * @brief Convert a full-width challenge to a target type (fr or fq); exact since `r < q`.
     */
    template <typename T> static T convert_full_challenge(const bb::fr& challenge)
    {
        if constexpr (std::is_same_v<T, bb::fr>) {
            return challenge;
        } else if constexpr (std::is_same_v<T, fq>) {
            return fq(static_cast<uint256_t>(challenge));
        }
    }
};

} // namespace bb
