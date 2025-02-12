#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <vector>

#include "barretenberg/serialize/msgpack.hpp"

namespace bb::avm2 {

PublicInputs PublicInputs::from(const std::vector<uint8_t>& data)
{
    PublicInputs inputs;
    msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size()).get().convert(inputs);
    return inputs;
}

AvmProvingInputs AvmProvingInputs::from(const std::vector<uint8_t>& data)
{
    AvmProvingInputs inputs;
    msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size()).get().convert(inputs);
    return inputs;
}

} // namespace bb::avm2