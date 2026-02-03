#pragma once

#include <msgpack.hpp>

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"

namespace msgpack::adaptor {

// Helper to convert uint128_t to decimal string
inline std::string uint128_to_decimal_string(uint128_t v)
{
    if (v == 0) {
        return "0";
    }
    std::string result;
    while (v > 0) {
        result = static_cast<char>('0' + static_cast<uint8_t>(v % 10)) + result;
        v = v / 10;
    }
    return result;
}

// Pack function for uint128_t
template <> struct pack<uint128_t> {
    template <typename Stream> msgpack::packer<Stream>& operator()(msgpack::packer<Stream>& o, uint128_t const& v) const
    {
        // If value fits in u64, pack as positive integer for efficiency
        constexpr uint128_t max_u64 = static_cast<uint128_t>(UINT64_MAX);
        if (v <= max_u64) {
            o.pack_uint64(static_cast<uint64_t>(v));
        } else {
            // Convert to decimal string for larger values
            std::string str = uint128_to_decimal_string(v);
            o.pack_str(static_cast<uint32_t>(str.size()));
            o.pack_str_body(str.c_str(), static_cast<uint32_t>(str.size()));
        }
        return o;
    }
};

template <> struct convert<uint128_t> {
    msgpack::object const& operator()(msgpack::object const& o, uint128_t& v) const
    {
        if (o.type == msgpack::type::POSITIVE_INTEGER) {
            v = static_cast<uint128_t>(o.via.u64);
        } else if (o.type == msgpack::type::STR) {
            // When the bigint is too large to fit in a u64, msgpackr will serialize it as a digits string.
            // Configured on the TS side with largeBigIntToString: true.
            uint128_t result = 0;
            // 2**128 is 39 digits long in base 10.
            if (o.via.str.size > 39) {
                throw_or_abort("uint128_t deserialization failed: string too long");
            }

            for (size_t i = 0; i < o.via.str.size; ++i) {
                char c = o.via.str.ptr[i];
                if (c < '0' || c > '9') {
                    throw_or_abort("uint128_t deserialization failed: Non-digit character in input");
                }

                result = result * 10 + (static_cast<uint128_t>(c - '0'));
            }

            v = result;
        } else {
            throw_or_abort("Invalid type for uint128_t deserialization");
        }
        return o;
    }
};

} // namespace msgpack::adaptor
