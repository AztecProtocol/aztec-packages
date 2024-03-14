#pragma once
#include "barretenberg/ecc/curves/bn254/fq2.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstring>
#include <type_traits>
#include <vector>

namespace bb::group_elements {
template <typename T>
concept SupportsHashToCurve = T::can_hash_to_curve;
template <typename Fq_, typename Fr_, typename Params> class alignas(64) affine_element {
  public:
    using Fq = Fq_;
    using Fr = Fr_;

    using in_buf = const uint8_t*;
    using vec_in_buf = const uint8_t*;
    using out_buf = uint8_t*;
    using vec_out_buf = uint8_t**;

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
    static void serialize_to_buffer(const affine_element& value, uint8_t* buffer)
    {
        if (value.is_point_at_infinity()) {
            // if we are infinity, just set all buffer bits to 1
            // we only need this case because the below gets mangled converting from montgomery for infinity points
            memset(buffer, 255, sizeof(Fq) * 2);
        } else {
            Fq::serialize_to_buffer(value.y, buffer);
            Fq::serialize_to_buffer(value.x, buffer + sizeof(Fq));
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
    static affine_element serialize_from_buffer(uint8_t* buffer)
    {
        // Does the buffer consist entirely of set bits? If so, we have a point at infinity
        // Note that if it isn't, this loop should end early.
        // We only need this case because the below gets mangled converting to montgomery for infinity points
        bool is_point_at_infinity =
            std::all_of(buffer, buffer + sizeof(Fq) * 2, [](uint8_t val) { return val == 255; });
        if (is_point_at_infinity) {
            return affine_element::infinity();
        }
        affine_element result;
        result.y = Fq::serialize_from_buffer(buffer);
        result.x = Fq::serialize_from_buffer(buffer + sizeof(Fq));
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

    friend std::ostream& operator<<(std::ostream& os, const affine_element& a)
    {
        os << "{ " << a.x << ", " << a.y << " }";
        return os;
    }
    Fq x;
    Fq y;

    // This function is used to serialize an affine element. It matches the old serialization format by first
    // converting the field from Montgomery form, which is a special representation used for efficient
    // modular arithmetic. Point at infinity is represented by serializing two moduli sequentially
    void msgpack_pack(auto& packer) const
    {
        std::array<uint64_t, 8> bin_data;
        if (is_point_at_infinity()) {
            // In case of point at infinity, modulus value is repeated twice
            bin_data = { htonll(Fq::modulus.data[3]), htonll(Fq::modulus.data[2]), htonll(Fq::modulus.data[1]),
                         htonll(Fq::modulus.data[0]), htonll(Fq::modulus.data[3]), htonll(Fq::modulus.data[2]),
                         htonll(Fq::modulus.data[1]), htonll(Fq::modulus.data[0]) };
        } else {
            // The fields are first converted from Montgomery form, similar to how the old format did it.
            auto adjusted_x = x.from_montgomery_form();
            auto adjusted_y = y.from_montgomery_form();

            // The data is then converted to big endian format using htonll, which stands for "host to network long
            // long". This is necessary because the data will be written to a raw msgpack buffer, which requires big
            // endian format.
            bin_data = { htonll(adjusted_x.data[3]), htonll(adjusted_x.data[2]), htonll(adjusted_x.data[1]),
                         htonll(adjusted_x.data[0]), htonll(adjusted_y.data[3]), htonll(adjusted_y.data[2]),
                         htonll(adjusted_y.data[1]), htonll(adjusted_y.data[0]) };
        }

        // The packer is then used to write the binary data to the buffer, just like in the old format.
        packer.pack_bin(sizeof(bin_data));
        packer.pack_bin_body((const char*)bin_data.data(), sizeof(bin_data)); // NOLINT
    }

    // This function is used to deserialize a field. It also matches the old deserialization format by
    // reading the binary data as big endian uint64_t's, correcting them to the host endianness, and
    // then converting the field back to Montgomery form. Point at infinity is encoded by 2 moduli
    void msgpack_unpack(auto o)
    {
        // 2 sequential values of modulus represent the point at inifnity
        uint64_t point_at_infinity_representation[8] = { htonll(Fq::modulus.data[3]), htonll(Fq::modulus.data[2]),
                                                         htonll(Fq::modulus.data[1]), htonll(Fq::modulus.data[0]),
                                                         htonll(Fq::modulus.data[3]), htonll(Fq::modulus.data[2]),
                                                         htonll(Fq::modulus.data[1]), htonll(Fq::modulus.data[0]) };
        // The binary data is first extracted from the msgpack object.
        std::array<uint8_t, sizeof(x) + sizeof(y)> raw_data = o;

        // The binary data is then read as big endian uint64_t's. This is done by casting the raw data to uint64_t*
        // and then using ntohll ("network to host long long") to correct the endianness to the host's endianness.
        uint64_t* cast_data = (uint64_t*)&raw_data[0]; // NOLINT
        if (!memcmp(
                (char*)point_at_infinity_representation, (char*)cast_data, sizeof(point_at_infinity_representation))) {
            // Set to point at infinity
            this->x = Fq(0);
            this->y = Fq(0);
            this->self_set_infinity();
        } else {
            // Convert binary representation to standard one
            uint64_t x_data[4] = {
                ntohll(cast_data[3]), ntohll(cast_data[2]), ntohll(cast_data[1]), ntohll(cast_data[0])
            };

            uint64_t y_data[4] = {
                ntohll(cast_data[7]), ntohll(cast_data[6]), ntohll(cast_data[5]), ntohll(cast_data[4])
            };

            // Copy into members
            for (size_t i = 0; i < 4; i++) {
                this->x.data[i] = x_data[i];
                this->y.data[i] = y_data[i];
            }
            // Finally, the field is converted back to Montgomery form, just like in the old format.
            this->x.self_to_montgomery_form();
            this->y.self_to_montgomery_form();
        }
    }

    void msgpack_schema(auto& packer) const
    {
        packer.pack_alias("affine(" + Fq::Params::schema_name + "," + Fr::Params::schema_name + ")", "bin32");
    }
};

/**
 * @brief Deserialize affine element (non-msgpack deserialization)
 *
 * @details Parse two uint256_t but in reverse order of 4 limbs, then check if the values is equal to special value for
 * infinity. If not, copy to fields and reduce to reconstruct the element
 *
 * @remark This API expects well-formed data, because we don't reduce the elements enough times to make sure they
 * actually adhere to internal field class expectations. So should not be used for something that might be controlled by
 * an attacker
 *
 */
template <typename B, typename Fq_, typename Fr_, typename Params>
void read(B& it, affine_element<Fq_, Fr_, Params>& value)
{
    using serialize::read;
    uint256_t x{ 0, 0, 0, 0 };
    uint256_t y{ 0, 0, 0, 0 };
    read(it, x.data[3]);
    read(it, x.data[2]);
    read(it, x.data[1]);
    read(it, x.data[0]);
    read(it, y.data[3]);
    read(it, y.data[2]);
    read(it, y.data[1]);
    read(it, y.data[0]);
    // Check if values are equal to repeated modulus (then we know that the point at inifinity is encoded)
    if (x == Fq_::modulus && y == Fq_::modulus) {
        value = { Fq_::zero(), Fq_::zero() };
        value.self_set_infinity();
    } else {
        for (size_t i = 0; i < 4; i++) {
            value.x.data[i] = x.data[i];
            value.y.data[i] = y.data[i];
        }
        value.x.self_to_montgomery_form();
        value.y.self_to_montgomery_form();
    }
}

/**
 * @brief Serialize affine element (non-msgpack serialization)
 *
 * @details If the point is a point at infinity, put repeated encoding of modulus twice. Otherwise, convert form
 * montgomery and write the 4 limbs from x (highest to lowest) and 4 limbs from y (highest to lowest).
 *
 */
template <typename B, typename Fq_, typename Fr_, typename Params>
void write(B& buf, affine_element<Fq_, Fr_, Params> const& value)
{
    using serialize::write;
    if (value.is_point_at_infinity()) {
        write(buf, Fq_::modulus.data[3]);
        write(buf, Fq_::modulus.data[2]);
        write(buf, Fq_::modulus.data[1]);
        write(buf, Fq_::modulus.data[0]);
        write(buf, Fq_::modulus.data[3]);
        write(buf, Fq_::modulus.data[2]);
        write(buf, Fq_::modulus.data[1]);
        write(buf, Fq_::modulus.data[0]);
    } else {
        const field x = value.x.from_montgomery_form();
        const field y = value.x.from_montgomery_form();

        write(buf, x.data[3]);
        write(buf, x.data[2]);
        write(buf, x.data[1]);
        write(buf, x.data[0]);
        write(buf, y.data[3]);
        write(buf, y.data[2]);
        write(buf, y.data[1]);
        write(buf, y.data[0]);
    }
}
} // namespace bb::group_elements

#include "./affine_element_impl.hpp"
