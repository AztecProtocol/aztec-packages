// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"

namespace bb::stdlib {

template <typename Builder> class packed_byte_array {
  private:
    using field_ct = field_t<Builder>;
    using witness_ct = witness_t<Builder>;
    using bool_ct = bool_t<Builder>;
    using byte_array_ct = byte_array<Builder>;

  public:
    packed_byte_array(Builder* parent_context, size_t const num_bytes = 0);

    // THIS CTOR ASSUMES INPUT ELEMENTS HAVE ALREADY BEEN REDUCED TO <16 BYTES PER ELEMENT
    // Use ::from_field_element_vector for raw vectors of unreduced prime field elements
    packed_byte_array(const std::vector<field_ct>& input, const size_t bytes_per_input = BYTES_PER_ELEMENT);
    packed_byte_array(Builder* parent_context, const std::vector<uint8_t>& input);
    packed_byte_array(Builder* parent_context, const std::string& input);
    packed_byte_array(const byte_array_ct& input);

    packed_byte_array(const packed_byte_array& other);
    packed_byte_array(packed_byte_array&& other);

    packed_byte_array& operator=(const packed_byte_array& other);
    packed_byte_array& operator=(packed_byte_array&& other);

    operator byte_array_ct() const;

    std::vector<field_ct> to_unverified_byte_slices(const size_t bytes_per_slice) const;
    std::vector<field_ct> get_limbs() const { return limbs; }

    void append(const field_ct& to_append, const size_t bytes_to_append);

    size_t size() const { return num_bytes; }

    Builder* get_context() const { return context; }

    std::string get_value() const;

  private:
    static constexpr uint64_t BYTES_PER_ELEMENT = 16;
    Builder* context;
    size_t num_bytes;
    std::vector<field_ct> limbs;
};

template <typename Builder> inline std::ostream& operator<<(std::ostream& os, packed_byte_array<Builder> const& arr)
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
