// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp" // NUM_LIMB_BITS_IN_FIELD_SIMULATION

namespace bb {

template <typename Field> class FieldConversion {
  public:
    using fr = bb::fr;
    using fq = grumpkin::fr;
    using bn254_point = curve::BN254::AffineElement;
    using grumpkin_point = curve::Grumpkin::AffineElement;

    // ---------------------------------------------------------------------
    // Size calculators
    // ---------------------------------------------------------------------
    template <typename T>
    static constexpr size_t calc_num_fields()
        requires(IsAnyOf<Field, bb::fr>)
    {
        if constexpr (IsAnyOf<T, uint32_t, uint64_t, bool>) {
            return 1;
        } else if constexpr (IsAnyOf<T, bb::fr, fq>) {
            return T::Params::NUM_BN254_SCALARS;
        } else if constexpr (IsAnyOf<T, bn254_point, grumpkin_point>) {
            return 2 * calc_num_fields<typename T::Fq>();
        } else {
            // Array or Univariate
            return calc_num_fields<typename T::value_type>() * (std::tuple_size<T>::value);
        }
    }

    template <typename T>
    static constexpr size_t calc_num_fields()
        requires(IsAnyOf<Field, uint256_t>)

    {
        if constexpr (IsAnyOf<T, uint32_t, uint64_t, uint256_t, bool, fq, bb::fr>) {
            return 1;
        } else if constexpr (IsAnyOf<T, bn254_point, grumpkin_point>) {
            // In contrast to bb::fr, bn254 points can be represented only 2 uint256_t elements
            return 2;
        } else {
            // Array or Univariate
            return calc_num_fields<typename T::value_type>() * (std::tuple_size<T>::value);
        }
    }

    // ---------------------------------------------------------------------
    // grumpkin <-> bn254 fr helpers (integrated from .cpp)
    // ---------------------------------------------------------------------
    /**
     * @brief Converts 2 bb::fr elements to fq
     * @details Splits into 136-bit lower chunk and 118-bit upper chunk to mirror stdlib bigfield limbs (68-bit each).
     */
    static fq convert_grumpkin_fr_from_bn254_frs(std::span<const bb::fr> fr_vec)
        requires(IsAnyOf<Field, bb::fr>)

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

        return fq(value);
    }

    /**
     * @brief Converts fq to 2 bb::fr elements (inverse of the above).
     */
    static std::vector<bb::fr> convert_grumpkin_fr_to_bn254_frs(const fq& val)
        requires(IsAnyOf<Field, bb::fr>)

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
    template <typename T>
    static T deserialize_from_fields(std::span<const fr> fr_vec)
        requires(IsAnyOf<Field, bb::fr>)

    {
        if constexpr (IsAnyOf<T, bool>) {
            BB_ASSERT_EQ(fr_vec.size(), static_cast<size_t>(1));
            return static_cast<bool>(fr_vec[0]);
        } else if constexpr (IsAnyOf<T, uint32_t, uint64_t, bb::fr>) {
            BB_ASSERT_EQ(fr_vec.size(), static_cast<size_t>(1));
            return static_cast<T>(fr_vec[0]);
        } else if constexpr (IsAnyOf<T, fq>) {
            BB_ASSERT_EQ(fr_vec.size(), static_cast<size_t>(2));
            return convert_grumpkin_fr_from_bn254_frs(fr_vec);
        } else if constexpr (IsAnyOf<T, bn254_point, grumpkin_point>) {
            using BaseField = typename T::Fq;
            constexpr size_t BASE = calc_num_fields<BaseField>();
            BB_ASSERT_EQ(fr_vec.size(), 2 * BASE);
            T val;
            val.x = deserialize_from_fields<BaseField>(fr_vec.subspan(0, BASE));
            val.y = deserialize_from_fields<BaseField>(fr_vec.subspan(BASE, BASE));
            if (val.x == BaseField::zero() && val.y == BaseField::zero()) {
                val.self_set_infinity();
            }
            ASSERT(val.on_curve());
            return val;
        } else {
            // Array or Univariate
            T val;
            constexpr size_t SZ = calc_num_fields<typename T::value_type>();
            BB_ASSERT_EQ(fr_vec.size(), SZ * std::tuple_size<T>::value);
            size_t i = 0;
            for (auto& x : val) {
                x = deserialize_from_fields<typename T::value_type>(fr_vec.subspan(SZ * i, SZ));
                ++i;
            }
            return val;
        }
    }

    template <typename T>
    static T deserialize_from_fields(std::span<const uint256_t> vec)
        requires(IsAnyOf<Field, uint256_t>)

    {
        if constexpr (IsAnyOf<T, bool>) {
            BB_ASSERT_EQ(vec.size(), static_cast<size_t>(1));
            return static_cast<bool>(vec[0]);
        } else if constexpr (IsAnyOf<T, uint32_t, uint64_t, uint256_t, bb::fr, fq>) {
            BB_ASSERT_EQ(vec.size(), static_cast<size_t>(1));
            return static_cast<T>(vec[0]);
        } else if constexpr (IsAnyOf<T, bn254_point, grumpkin_point>) {
            using BaseField = typename T::Fq;
            constexpr size_t N = calc_num_fields<BaseField>();
            BB_ASSERT_EQ(vec.size(), 2 * N);
            T val;
            val.x = deserialize_from_fields<BaseField>(vec.subspan(0, N));
            val.y = deserialize_from_fields<BaseField>(vec.subspan(N, N));
            if (val.x == BaseField::zero() && val.y == BaseField::zero()) {
                val.self_set_infinity();
            }
            ASSERT(val.on_curve());
            return val;
        } else {
            // Array or Univariate
            T val;
            constexpr size_t SZ = calc_num_fields<typename T::value_type>();
            BB_ASSERT_EQ(vec.size(), SZ * std::tuple_size<T>::value);
            size_t i = 0;
            for (auto& x : val) {
                x = deserialize_from_fields<typename T::value_type>(vec.subspan(SZ * i, SZ));
                ++i;
            }
            return val;
        }
    }

    // ---------------------------------------------------------------------
    // Serialize
    // ---------------------------------------------------------------------
    template <typename T>
    static std::vector<fr> serialize_to_fields(const T& val)
        requires(IsAnyOf<Field, bb::fr>)

    {
        if constexpr (IsAnyOf<T, bool, uint32_t, uint64_t, bb::fr>) {
            return { val };
        } else if constexpr (IsAnyOf<T, fq>) {
            return convert_grumpkin_fr_to_bn254_frs(val);
        } else if constexpr (IsAnyOf<T, bn254_point, grumpkin_point>) {
            using BaseField = typename T::Fq;
            std::vector<fr> x, y;
            if (val.is_point_at_infinity()) {
                x = serialize_to_fields(BaseField::zero());
                y = serialize_to_fields(BaseField::zero());
            } else {
                x = serialize_to_fields(val.x);
                y = serialize_to_fields(val.y);
            }
            std::vector<fr> out(x.begin(), x.end());
            out.insert(out.end(), y.begin(), y.end());
            return out;
        } else {
            // Array or Univariate
            std::vector<fr> out;
            for (auto& e : val) {
                auto tmp = serialize_to_fields(e);
                out.insert(out.end(), tmp.begin(), tmp.end());
            }
            return out;
        }
    }

    template <typename T>
    static std::vector<uint256_t> convert_to_uint256(const T& val)
        requires(IsAnyOf<Field, uint256_t>)
    {
        if constexpr (IsAnyOf<T, bool, uint32_t, uint64_t, uint256_t, bb::fr, fq>) {
            return { val };
        } else if constexpr (IsAnyOf<T, bn254_point, grumpkin_point>) {
            using BaseField = typename T::Fq;
            std::vector<uint256_t> x, y;
            if (val.is_point_at_infinity()) {
                x = convert_to_uint256(BaseField::zero());
                y = convert_to_uint256(BaseField::zero());
            } else {
                x = convert_to_uint256(val.x);
                y = convert_to_uint256(val.y);
            }
            std::vector<uint256_t> out(x.begin(), x.end());
            out.insert(out.end(), y.begin(), y.end());
            return out;
        } else {
            // Array or Univariate
            std::vector<uint256_t> out;
            for (auto& e : val) {
                auto tmp = convert_to_uint256(e);
                out.insert(out.end(), tmp.begin(), tmp.end());
            }
            return out;
        }
    }

    // ---------------------------------------------------------------------
    // Split challenge (templated to avoid duplication)
    // ---------------------------------------------------------------------
    static std::array<Field, 2> split_challenge(const Field& challenge)
    {
        static constexpr size_t LO_BITS = bb::fr::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR; // 128
        static constexpr size_t HI_BITS = bb::fr::modulus.get_msb() + 1 - LO_BITS;          // 126

        const uint256_t u = static_cast<uint256_t>(challenge);
        const uint256_t lo = u.slice(0, LO_BITS);
        const uint256_t hi = u.slice(LO_BITS, LO_BITS + HI_BITS);

        return { Field(lo), Field(hi) };
    }

    // ---------------------------------------------------------------------
    // Transcript challenge cast (fr -> target)
    // ---------------------------------------------------------------------
    template <typename T>
    static T convert_challenge(const bb::fr& challenge)
        requires(IsAnyOf<Field, bb::fr>)

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
};

using FrCodec = FieldConversion<bb::fr>;
using U256Codec = FieldConversion<uint256_t>;

} // namespace bb
