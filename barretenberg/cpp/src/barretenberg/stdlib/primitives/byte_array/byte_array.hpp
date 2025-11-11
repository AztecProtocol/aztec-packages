// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/common/assert.hpp"
namespace bb::stdlib {

/**
 * @brief Represents a dynamic array of bytes in-circuit.
 *
 * The `byte_array` class provides a high-level abstraction over a sequence of field elements
 * constrained to be bytes.
 *
 * It supports construction from native values (`std::string`, `std::vector<uint8_t>`, or
 * `field_t`) and conversion to a `field_t` elements, as well as various classical vector operations like slicing and
 * reversing.
 *
 * Used in hashing primitives.
 *
 * @tparam Builder The circuit builder type (e.g., UltraCircuitBuilder).
 */
template <typename Builder> class byte_array {
    using bytes_t = typename std::vector<field_t<Builder>>;

  private:
    Builder* context;
    bytes_t values;

    // Internal constructors - do NOT add constraints
    // Only for use by member functions (slice, reverse, from_constants)
    byte_array(Builder* parent_context, bytes_t const& input);
    byte_array(Builder* parent_context, bytes_t&& input);

    // Create byte_array from constant values without adding range constraints
    // Safe for padding and other constant data - constants can't be manipulated by the prover
    static byte_array from_constants(Builder* parent_context, std::vector<uint8_t> const& input);

  public:
    explicit byte_array(Builder* parent_context, std::string const& input);
    // Explicit to prevent implicit conversion from size_t to std::vector<uint8_t>
    explicit byte_array(Builder* parent_context, std::vector<uint8_t> const& input);
    // Explicit to prevent implicit conversions from size_t/int to field_t
    explicit byte_array(const field_t<Builder>& input,
                        const size_t num_bytes = 32,
                        std::optional<uint256_t> test_val = std::nullopt);

    // Convenience method for creating constant padding (common use case)
    static byte_array constant_padding(Builder* parent_context, size_t num_bytes, uint8_t value = 0)
    {
        return from_constants(parent_context, std::vector<uint8_t>(num_bytes, value));
    }

    // Copy and move operations
    byte_array(const byte_array& other);
    byte_array(byte_array&& other) noexcept;
    byte_array& operator=(const byte_array& other);
    byte_array& operator=(byte_array&& other) noexcept;
    explicit operator field_t<Builder>() const;

    field_t<Builder> operator[](const size_t index) const
    {
        BB_ASSERT_LT(index, values.size());
        return values[index];
    }

    // Append another byte_array to this one
    byte_array& write(byte_array const& other);

    // Overwrite bytes starting at index with contents of other
    byte_array& write_at(byte_array const& other, size_t index);

    byte_array slice(size_t offset) const;
    byte_array slice(size_t offset, size_t length) const;
    byte_array reverse() const;

    size_t size() const { return values.size(); }

    bytes_t const& bytes() const { return values; }

    Builder* get_context() const { return context; }

    // Out-of-circuit methods
    std::vector<uint8_t> get_value() const;

    // OriginTag-specific methods
    void set_origin_tag(bb::OriginTag tag)
    {
        for (auto& value : values) {
            value.set_origin_tag(tag);
        }
    }

    bb::OriginTag get_origin_tag() const
    {
        bb::OriginTag tag{};
        for (auto& value : values) {
            tag = bb::OriginTag(tag, value.tag);
        }
        return tag;
    }

    /**
     * @brief Set the free witness flag for the byte array
     */
    void set_free_witness_tag()
    {
        for (auto& value : values) {
            value.set_free_witness_tag();
        }
    }

    /**
     * @brief Unset the free witness flag for the byte array
     */
    void unset_free_witness_tag()
    {
        for (auto& value : values) {
            value.unset_free_witness_tag();
        }
    }
};

template <typename Builder> inline std::ostream& operator<<(std::ostream& os, byte_array<Builder> const& arr)
{
    std::ios_base::fmtflags f(os.flags());
    os << "[" << std::hex << std::setfill('0');
    for (auto byte : arr.get_value()) {
        os << ' ' << std::setw(2) << +(unsigned char)byte;
    }
    os << " ]";
    os.flags(f);
    return os;
}
} // namespace bb::stdlib
