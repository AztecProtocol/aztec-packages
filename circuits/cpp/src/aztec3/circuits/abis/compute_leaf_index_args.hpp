// TODO: Is this really the correct place? Where to put the struct?

#include "aztec3/msgpack/schema_impl.hpp"
#include "aztec3/utils/types/native_types.hpp"

using NT = aztec3::utils::types::NativeTypes;

namespace aztec3::circuits::abis {

struct ComputeLeafIndexArgs {
    typename NT::address contract_address;
    typename NT::fr slot;
    MSGPACK_DEFINE(contract_address, slot);
};

}  // namespace aztec3::circuits::abis