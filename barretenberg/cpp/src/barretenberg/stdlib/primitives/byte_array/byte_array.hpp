// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
namespace bb::stdlib {

template <typename Builder> class byte_array {
  public:
    using bytes_t = typename std::vector<field_t<Builder>>;

    byte_array(Builder* parent_context = nullptr);
    byte_array(Builder* parent_context, size_t const n);
    byte_array(Builder* parent_context, std::string const& input);
    byte_array(Builder* parent_context, std::vector<uint8_t> const& input);
    byte_array(Builder* parent_context, bytes_t const& input);
    byte_array(Builder* parent_context, bytes_t&& input);
    byte_array(const field_t<Builder>& input,
               const size_t num_bytes = 32,
               std::optional<uint256_t> test_val = std::nullopt);

    byte_array(const byte_array& other);
    byte_array(byte_array&& other);

    byte_array& operator=(const byte_array& other);
    byte_array& operator=(byte_array&& other);

    explicit operator field_t<Builder>() const;

    field_t<Builder> operator[](const size_t index) const
    {
        assert(values.size() > 0);
        return values[index];
    }

    field_t<Builder>& operator[](const size_t index)
    {
        ASSERT(index < values.size());
        return values[index];
    }

    byte_array& write(byte_array const& other);
    byte_array& write_at(byte_array const& other, size_t index);

    byte_array slice(size_t offset) const;
    byte_array slice(size_t offset, size_t length) const;
    byte_array reverse() const;

    size_t size() const { return values.size(); }

    bytes_t const& bytes() const { return values; }

    Builder* get_context() const { return context; }

    // Out-of-circuit methods
    std::vector<uint8_t> get_value() const;
    std::string get_string() const;

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

  private:
    Builder* context;
    bytes_t values;
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
