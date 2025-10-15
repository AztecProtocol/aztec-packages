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

Napi::Value AvmSimulateNapi::simulate(const Napi::CallbackInfo& info)
{
    // TODO(dbanks12): how can we enable these based on an argument,
    // but avoid disturbing other C++ code running in the same process through NAPI like WS?
    verbose_logging = true;
    debug_logging = true;

    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Wrong number of arguments. Expected at least 1 argument.");
    }

    if (!info[0].IsBuffer()) {
        throw Napi::TypeError::New(env,
                                   "First argument must be a Buffer containing serialized AvmFastSimulationInputs");
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
        avm2::AvmFastSimulationInputs inputs;
        msgpack::object_handle obj_handle = msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
        msgpack::object obj = obj_handle.get();
        obj.convert(inputs);

        // Create AVM API and run simulation
        avm2::AvmAPI avm;
        avm.simulate(inputs);

        // Serialize the simulation result with msgpack into the return buffer to TS.
        // TODO(dbanks12): return PublicTxResult as the TS PublicTxSimulator returns.
        msgpack::pack(result_buffer, inputs.publicInputs);
    });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

} // namespace bb::nodejs
