#include "avm_simulate_napi.hpp"

#include <memory>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/nodejs_module/avm_simulate/ts_callback_contract_db.hpp"
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

    // Validate arguments - expects 2 arguments
    // arg[0]: inputs Buffer (required)
    // arg[1]: contractProvider object (required)
    if (info.Length() < 2) {
        throw Napi::TypeError::New(
            env, "Wrong number of arguments. Expected 2 arguments: inputs Buffer and contractProvider object.");
    }

    if (!info[0].IsBuffer()) {
        throw Napi::TypeError::New(env,
                                   "First argument must be a Buffer containing serialized AvmFastSimulationInputs");
    }

    if (!info[1].IsObject()) {
        throw Napi::TypeError::New(env, "Second argument must be a contractProvider object");
    }

    // Extract the inputs buffer
    auto inputs_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();

    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    // Extract contract provider callbacks
    auto contract_provider = info[1].As<Napi::Object>();

    if (!contract_provider.Has("getContractInstance") || !contract_provider.Has("getContractClass")) {
        throw Napi::TypeError::New(env, "contractProvider must have getContractInstance and getContractClass methods");
    }

    auto get_instance_fn = contract_provider.Get("getContractInstance").As<Napi::Function>();
    auto get_class_fn = contract_provider.Get("getContractClass").As<Napi::Function>();

    // Create thread-safe function wrappers for callbacks
    // These allow us to call TypeScript from the C++ worker thread
    auto instance_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_instance_fn, "getContractInstance", 0, 1));

    auto class_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_class_fn, "getContractClass", 0, 1));

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create async operation that will run on a worker thread
    auto* op = new AsyncOperation(env, deferred, [data, instance_tsfn, class_tsfn](msgpack::sbuffer& result_buffer) {
        // Deserialize inputs from msgpack
        avm2::AvmFastSimulationInputs inputs;
        msgpack::object_handle obj_handle = msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
        msgpack::object obj = obj_handle.get();
        obj.convert(inputs);

        // Create TsCallbackContractDB with TypeScript callbacks
        TsCallbackContractDB contract_db(*instance_tsfn, *class_tsfn);

        // Create AVM API and run simulation with the callback-based contracts DB
        avm2::AvmAPI avm;
        avm.simulate(inputs, contract_db);
        // TODO(dbanks12): return the PublicTxResult. For now just a bool true.
        bool success = true;

        // Clean up thread-safe functions
        instance_tsfn->Release();
        class_tsfn->Release();

        // Serialize the simulation result with msgpack into the return buffer to TS.
        // TODO(dbanks12): return PublicTxResult as the TS PublicTxSimulator returns.
        msgpack::pack(result_buffer, success);
    });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

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
