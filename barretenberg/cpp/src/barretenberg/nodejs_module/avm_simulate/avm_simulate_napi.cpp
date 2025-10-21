#include "avm_simulate_napi.hpp"

#include <memory>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/nodejs_module/util/async_op.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"

namespace bb::nodejs {

Napi::Value AvmSimulateNapi::simulateWithHintedDbs(const Napi::CallbackInfo& info)
{
    // TODO(dbanks12): how can we enable these based on an argument,
    // but avoid disturbing other C++ code running in the same process through NAPI like WS?
    verbose_logging = true;
    debug_logging = true;

    Napi::Env env = info.Env();

    // Validate arguments - expects 1 argument
    // arg[0]: inputs Buffer (required) - AvmProvingInputs
    if (info.Length() < 1) {
        throw Napi::TypeError::New(
            env, "Wrong number of arguments. Expected 2 arguments: inputs Buffer and contractProvider object.");
    }

    if (!info[0].IsBuffer()) {
        throw Napi::TypeError::New(
            env, "First argument must be a Buffer containing serialized AvmProvingInputs/AvmCircuitInputs");
    }

    // Extract the inputs buffer
    auto inputs_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();

    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create async operation that will run on a worker thread
    auto* op = new AsyncOperation(env, deferred, [data](msgpack::sbuffer& result_buffer) {
        // Deserialize inputs from msgpack
        avm2::AvmProvingInputs inputs;
        msgpack::object_handle obj_handle = msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
        msgpack::object obj = obj_handle.get();
        obj.convert(inputs);

        // Create AVM API and run simulation with the hinted DBs
        // All hints are already in the inputs, so no runtime contract DB callbacks needed
        avm2::AvmAPI avm;
        avm.simulate_with_hinted_dbs(inputs);
        // TODO(dbanks12): return the PublicTxResult. For now just a bool true.
        bool success = true;

        // Serialize the simulation result with msgpack into the return buffer to TS.
        // TODO(dbanks12): return PublicTxResult as the TS PublicTxSimulator returns.
        msgpack::pack(result_buffer, success);
    });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

} // namespace bb::nodejs
