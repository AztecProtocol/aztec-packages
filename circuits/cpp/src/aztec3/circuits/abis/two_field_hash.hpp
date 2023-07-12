
#pragma once

#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;

template <typename NCT> struct BigField {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr high = 0;
    fr low = 0;

    MSGPACK_FIELDS(high, low);

    boolean operator==(BigField<NCT> const& other) const { return high == other.high && low == other.low; };

    template <typename Builder> BigField<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(builder); };

        BigField<CircuitTypes<Builder>> hash = {
            to_ct(high),
            to_ct(low),
        };

        return hash;
    };
};

template <typename NCT> void read(uint8_t const*& it, BigField<NCT>& hash)
{
    using serialize::read;

    read(it, hash.high);
    read(it, hash.low);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, BigField<NCT> const& hash)
{
    using serialize::write;

    write(buf, hash.high);
    write(buf, hash.low);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, BigField<NCT> const& hash)
{
    return os << "high: " << hash.high << "\n"
              << "low: " << hash.low << "\n";
}

}  // namespace aztec3::circuits::abis