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

} // namespace msgpack::adaptor
