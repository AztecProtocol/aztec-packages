#pragma once

#define MSGPACK_NO_BOOST
#define MSGPACK_USE_STD_VARIANT_ADAPTOR
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
            // When the bigint is too large to fit in a u64, msgpackr will serialize it as a string.
            // Configured on the TS side with largeBigIntToString: true.
            uint128_t result = 0;

            for (size_t i = 0; i < o.via.str.size; ++i) {
                result = result * 10 + (static_cast<uint128_t>(o.via.str.ptr[i] - '0'));
            }

            v = result;
        } else {
            throw_or_abort("Invalid type for uint128_t deserialization");
        }
        return o;
    }
};

} // namespace msgpack::adaptor
