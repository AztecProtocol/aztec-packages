#pragma once

#define MSGPACK_NO_BOOST
#include <msgpack.hpp>

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"

namespace msgpack::adaptor {

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

template <> struct pack<uint128_t> {
    template <typename Stream> msgpack::packer<Stream>& operator()(msgpack::packer<Stream>& o, const uint128_t& v) const
    {
        // If the value fits in a uint64_t, pack it as an integer
        if (v <= UINT64_MAX) {
            o.pack_uint64(static_cast<uint64_t>(v));
        } else {
            // Otherwise, pack it as a decimal string (to match the TypeScript side's largeBigIntToString: true)
            // Convert uint128_t to decimal string
            char buffer[40]; // 2**128 is at most 39 digits
            int pos = 39;
            buffer[pos] = '\0';

            uint128_t tmp = v;
            do {
                --pos;
                buffer[pos] = '0' + static_cast<char>(tmp % 10);
                tmp /= 10;
            } while (tmp > 0);

            uint32_t str_length = static_cast<uint32_t>(39 - pos);
            o.pack_str(str_length);
            o.pack_str_body(&buffer[pos], str_length);
        }
        return o;
    }
};

} // namespace msgpack::adaptor
