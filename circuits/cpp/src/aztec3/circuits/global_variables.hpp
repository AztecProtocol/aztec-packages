#pragma once

#include "aztec3/constants.hpp"
#include "aztec3/utils/msgpack_derived_equals.hpp"
#include "aztec3/utils/msgpack_derived_output.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;

template <typename NCT> struct GlobalVariables {
    using fr = typename NCT::fr;

    fr timestamp = 0;
    fr block_number = 0;
    fr chain_id = 0;
    fr version = 0;

    MSGPACK_FIELDS(timestamp, block_number, chain_id, version);

    bool operator==(GlobalVariables<NCT> const&) const = default;
};

template <typename NCT> void read(uint8_t const*& it, GlobalVariables<NCT>& obj)
{
    using serialize::read;

    read(it, obj.timestamp);
    read(it, obj.block_number);
    read(it, obj.chain_id);
    read(it, obj.version);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, GlobalVariables<NCT> const& obj)
{
    using serialize::write;

    write(buf, obj.timestamp);
    write(buf, obj.block_number);
    write(buf, obj.chain_id);
    write(buf, obj.version);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, GlobalVariables<NCT> const& obj)
{
    os << "timestamp: " << obj.timestamp << std::endl;
    os << "block_number: " << obj.block_number << std::endl;
    os << "chain_id: " << obj.chain_id << std::endl;
    os << "version: " << obj.version << std::endl;
    return os;
};

}  // namespace aztec3::circuits::abis