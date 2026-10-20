#include "barretenberg/avm/avm_simulate_with_hints.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"

namespace bb::avm {

std::vector<uint8_t> simulate_with_hints(const std::vector<uint8_t>& inputs)
{
    auto result = avm2::AvmSimAPI().simulate_with_hinted_dbs(avm2::AvmProvingInputs::from(inputs));
    msgpack::sbuffer buf;
    msgpack::pack(buf, result);
    return { buf.data(), buf.data() + buf.size() };
}

} // namespace bb::avm
