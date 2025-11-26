// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fq2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstring>
#include <type_traits>
#include <vector>

namespace bb::group_elements {
template <typename T>
concept SupportsHashToCurve = T::can_hash_to_curve;
template <typename Fq_, typename Fr_, typename Params_> class alignas(64) affine_element {
  public:
    using Fq = Fq_;
    using Fr = Fr_;
    using Params = Params_;

    using in_buf = const uint8_t*;
    using vec_in_buf = const uint8_t*;
    using out_buf = uint8_t*;
    using vec_out_buf = uint8_t**;

    /**
     * Number of bb::fr elements required to represent an affine_element in the public inputs
     * @note In contrast to biggroup and biggroup_goblin this value cannot be computed for all instances of Fq because
     * Fq::PUBLIC_INPUTS_SIZE depends on Fq, while bigfield and bigfield_goblin are always represented using 4 public
     * inputs
     */
    static constexpr size_t PUBLIC_INPUTS_SIZE = Fq::PUBLIC_INPUTS_SIZE + Fq::PUBLIC_INPUTS_SIZE;

    affine_element() noexcept = default;
    ~affine_element() noexcept = default;

    constexpr affine_element(const Fq& x, const Fq& y) noexcept;

    constexpr affine_element(const affine_element& other) noexcept = default;

    constexpr affine_element(affine_element&& other) noexcept = default;

    static constexpr affine_element one() noexcept { return { Params::one_x, Params::one_y }; };

    /**
     * @brief Reconstruct a point in affine coordinates from compressed form.
     * @details #LARGE_MODULUS_AFFINE_POINT_COMPRESSION Point compression is only implemented for curves of a prime
     * field F_p with p using < 256 bits.  One possiblity for extending to a 256-bit prime field:
     * https://patents.google.com/patent/US6252960B1/en.
     *
     * @param compressed compressed point
     * @return constexpr affine_element
     */
    template <typename BaseField = Fq,
              typename CompileTimeEnabled = std::enable_if_t<(BaseField::modulus >> 255) == uint256_t(0), void>>
    static constexpr affine_element from_compressed(const uint256_t& compressed) noexcept;

    /**
     * @brief Reconstruct a point in affine coordinates from compressed form.
     * @details #LARGE_MODULUS_AFFINE_POINT_COMPRESSION Point compression is implemented for curves of a prime
     * field F_p with p being 256 bits.
     * TODO(Suyash): Check with kesha if this is correct.
     *
     * @param compressed compressed point
     * @return constexpr affine_element
     */
    template <typename BaseField = Fq,
              typename CompileTimeEnabled = std::enable_if_t<(BaseField::modulus >> 255) == uint256_t(1), void>>
    static constexpr std::array<affine_element, 2> from_compressed_unsafe(const uint256_t& compressed) noexcept;

    constexpr affine_element& operator=(const affine_element& other) noexcept = default;

    constexpr affine_element& operator=(affine_element&& other) noexcept = default;

    constexpr affine_element operator+(const affine_element& other) const noexcept;

    constexpr affine_element operator*(const Fr& exponent) const noexcept;

    template <typename BaseField = Fq,
              typename CompileTimeEnabled = std::enable_if_t<(BaseField::modulus >> 255) == uint256_t(0), void>>
    [[nodiscard]] constexpr uint256_t compress() const noexcept;

    static affine_element infinity();
    constexpr affine_element set_infinity() const noexcept;
    constexpr void self_set_infinity() noexcept;

    [[nodiscard]] constexpr bool is_point_at_infinity() const noexcept;

    [[nodiscard]] constexpr bool on_curve() const noexcept;

    static constexpr std::optional<affine_element> derive_from_x_coordinate(const Fq& x, bool sign_bit) noexcept;

    /**
     * @brief Samples a random point on the curve.
     *
     * @return A randomly chosen point on the curve
     */
    static affine_element random_element(numeric::RNG* engine = nullptr) noexcept;
    static constexpr affine_element hash_to_curve(const std::vector<uint8_t>& seed, uint8_t attempt_count = 0) noexcept
        requires SupportsHashToCurve<Params>;

    constexpr bool operator==(const affine_element& other) const noexcept;

    constexpr affine_element operator-() const noexcept { return { x, -y }; }

    constexpr bool operator>(const affine_element& other) const noexcept;
    constexpr bool operator<(const affine_element& other) const noexcept { return (other > *this); }

    /**
     * @brief Serialize the point to the given buffer
     *
     * @details We support serializing the point at infinity for curves defined over a bb::field (i.e., a
     * native field of prime order) and for points of bb::g2.
     *
     * @warning This will need to be updated if we serialize points over composite-order fields other than fq2!
     *
     */
    static void serialize_to_buffer(const affine_element& value, uint8_t* buffer, bool write_x_first = false)
    {
        using namespace serialize;
        if (value.is_point_at_infinity()) {
            // if we are infinity, just set all buffer bits to 1
            // we only need this case because the below gets mangled converting from montgomery for infinity points
            memset(buffer, 255, sizeof(Fq) * 2);
        } else {
            // Note: for historic reasons we will need to redo downstream hashes if we want this to always be written in
            // the same order in our various serialization flows
            write(buffer, write_x_first ? value.x : value.y);
            write(buffer, write_x_first ? value.y : value.x);
        }
    }

    /**
     * @brief Restore point from a buffer
     *
     * @param buffer Buffer from which we deserialize the point
     *
     * @return Deserialized point
     *
     * @details We support serializing the point at infinity for curves defined over a bb::field (i.e., a
     * native field of prime order) and for points of bb::g2.
     *
     * @warning This will need to be updated if we serialize points over composite-order fields other than fq2!
     */
    static affine_element serialize_from_buffer(const uint8_t* buffer, bool write_x_first = false)
    {
        using namespace serialize;
        // Does the buffer consist entirely of set bits? If so, we have a point at infinity
        // Note that if it isn't, this loop should end early.
        // We only need this case because the below gets mangled converting to montgomery for infinity points
        bool is_point_at_infinity =
            std::all_of(buffer, buffer + sizeof(Fq) * 2, [](uint8_t val) { return val == 255; });
        if (is_point_at_infinity) {
            return affine_element::infinity();
        }
        affine_element result;
        // Note: for historic reasons we will need to redo downstream hashes if we want this to always be read in the
        // same order in our various serialization flows
        read(buffer, write_x_first ? result.x : result.y);
        read(buffer, write_x_first ? result.y : result.x);
        return result;
    }

    /**
     * @brief Serialize the point to a byte vector
     *
     * @return Vector with serialized representation of the point
     */
    [[nodiscard]] inline std::vector<uint8_t> to_buffer() const
    {
        std::vector<uint8_t> buffer(sizeof(affine_element));
        affine_element::serialize_to_buffer(*this, &buffer[0]);
        return buffer;
    }

    static affine_element reconstruct_from_public(const std::span<const bb::fr, PUBLIC_INPUTS_SIZE>& limbs)
    {
        const std::span<const bb::fr, Fq::PUBLIC_INPUTS_SIZE> x_limbs(limbs.data(), Fq::PUBLIC_INPUTS_SIZE);
        const std::span<const bb::fr, Fq::PUBLIC_INPUTS_SIZE> y_limbs(limbs.data() + Fq::PUBLIC_INPUTS_SIZE,
                                                                      Fq::PUBLIC_INPUTS_SIZE);

        affine_element result;
        result.x = Fq::reconstruct_from_public(x_limbs);
        result.y = Fq::reconstruct_from_public(y_limbs);

        BB_ASSERT(result.on_curve());
        return result;
    }

    friend std::ostream& operator<<(std::ostream& os, const affine_element& a)
    {
        os << "{ " << a.x << ", " << a.y << " }";
        return os;
    }
    Fq x;
    Fq y;

    // Concept to detect if Fq is a field2 type
    template <typename T>
    static constexpr bool is_field2_v = requires(T t) {
        t.c0;
        t.c1;
    };

    // Msgpack serialization optimized for single uint256_t or array of uint256_t
    struct MsgpackRawAffineElement {
        // For regular fields (uint256_t), use uint256_t directly
        // For field2 types, use std::array<uint256_t, 2>
        using FieldType = std::conditional_t<is_field2_v<Fq>, std::array<uint256_t, 2>, uint256_t>;

        FieldType x{};
        FieldType y{};
        MSGPACK_FIELDS(x, y);
    };

    void msgpack_pack(auto& packer) const
    {
        MsgpackRawAffineElement raw_element{};

        if (is_point_at_infinity()) {
            // Set all bits to 1 for infinity representation
            constexpr uint256_t all_ones = {
                0xffffffffffffffffUL, 0xffffffffffffffffUL, 0xffffffffffffffffUL, 0xffffffffffffffffUL
            };

            if constexpr (is_field2_v<Fq>) {
                raw_element.x = { all_ones, all_ones };
                raw_element.y = { all_ones, all_ones };
            } else {
                raw_element.x = all_ones;
                raw_element.y = all_ones;
            }
        } else {
            // Note: field assignment operators internally call from_montgomery_form()
            if constexpr (is_field2_v<Fq>) {
                raw_element.x = { x.c0, x.c1 };
                raw_element.y = { y.c0, y.c1 };
            } else {
                raw_element.x = x;
                raw_element.y = y;
            }
        }
        packer.pack(raw_element);
    }

    void msgpack_unpack(auto o)
    {
        MsgpackRawAffineElement raw_element = o;

        // Check if this is point at infinity (all bits set)
        constexpr uint256_t all_ones = {
            0xffffffffffffffffUL, 0xffffffffffffffffUL, 0xffffffffffffffffUL, 0xffffffffffffffffUL
        };

        bool is_infinity;
        if constexpr (is_field2_v<Fq>) {
            is_infinity = (raw_element.x[0] == all_ones && raw_element.x[1] == all_ones &&
                           raw_element.y[0] == all_ones && raw_element.y[1] == all_ones);
        } else {
            is_infinity = (raw_element.x == all_ones && raw_element.y == all_ones);
        }

        if (is_infinity) {
            self_set_infinity();
        } else {
            // Note: field assignment operators internally call to_montgomery_form()
            if constexpr (is_field2_v<Fq>) {
                x.c0 = raw_element.x[0];
                x.c1 = raw_element.x[1];
                y.c0 = raw_element.y[0];
                y.c1 = raw_element.y[1];
            } else {
                x = raw_element.x;
                y = raw_element.y;
            }
        }
    }
    void msgpack_schema(auto& packer) const
    {
        std::string schema_name = msgpack_schema_name(*this);
        if (packer.set_emitted(schema_name)) {
            packer.pack(schema_name);
            return; // already emitted
        }
        packer.pack_map(3);
        packer.pack("__typename");
        packer.pack(schema_name);
        packer.pack("x");
        packer.pack_schema(x);
        packer.pack("y");
        packer.pack_schema(y);
    }
};

template <typename B, typename Fq_, typename Fr_, typename Params>
inline void read(B& it, group_elements::affine_element<Fq_, Fr_, Params>& element)
{
    using namespace serialize;
    std::array<uint8_t, sizeof(element)> buffer;
    read(it, buffer);
    element = group_elements::affine_element<Fq_, Fr_, Params>::serialize_from_buffer(
        buffer.data(), /* use legacy field order */ true);
}

template <typename B, typename Fq_, typename Fr_, typename Params>
inline void write(B& it, group_elements::affine_element<Fq_, Fr_, Params> const& element)
{
    using namespace serialize;
    std::array<uint8_t, sizeof(element)> buffer;
    group_elements::affine_element<Fq_, Fr_, Params>::serialize_to_buffer(
        element, buffer.data(), /* use legacy field order */ true);
    write(it, buffer);
}
} // namespace bb::group_elements

#include "./affine_element_impl.hpp"
