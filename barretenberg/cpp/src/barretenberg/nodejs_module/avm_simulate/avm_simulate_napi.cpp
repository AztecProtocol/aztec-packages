#include "avm_simulate_napi.hpp"

#include <memory>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/nodejs_module/avm_simulate/ts_callback_contract_db.hpp"
#include "barretenberg/nodejs_module/util/async_op.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"

namespace bb::nodejs {

Napi::Value AvmSimulateNapi::simulate(const Napi::CallbackInfo& info)
{
    // TODO(dbanks12): configurable verbosity (maybe based on TS log level)
    verbose_logging = true;
    debug_logging = true;

    Napi::Env env = info.Env();

    // Validate arguments - expects 3 arguments
    // arg[0]: inputs Buffer (required)
    // arg[1]: contractProvider object (required)
    // arg[2]: worldStateHandle external (required)
    if (info.Length() < 3) {
        throw Napi::TypeError::New(env,
                                   "Wrong number of arguments. Expected 3 arguments: inputs Buffer, contractProvider "
                                   "object, and worldStateHandle.");
    }

    if (!info[0].IsBuffer()) {
        throw Napi::TypeError::New(env,
                                   "First argument must be a Buffer containing serialized AvmFastSimulationInputs");
    }

    if (!info[1].IsObject()) {
        throw Napi::TypeError::New(env, "Second argument must be a contractProvider object");
    }

    if (!info[2].IsExternal()) {
        throw Napi::TypeError::New(env, "Third argument must be a WorldState handle (External)");
    }

    // Extract the inputs buffer
    auto inputs_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();

    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    // Extract contract provider callbacks
    auto contract_provider = info[1].As<Napi::Object>();

    if (!(contract_provider.Has("getContractInstance") && contract_provider.Has("getContractClass") &&
          contract_provider.Has("addNewNonRevertibleContracts") && contract_provider.Has("addNewRevertibleContracts") &&
          contract_provider.Has("getBytecodeCommitment") && contract_provider.Has("getDebugFunctionName"))) {
        throw Napi::TypeError::New(
            env,
            "contractProvider must have getContractInstance, getContractClass, addNewNonRevertibleContracts, "
            "addNewRevertibleContracts, getBytecodeCommitment and getDebugFunctionName methods");
    }

    auto get_instance_fn = contract_provider.Get("getContractInstance").As<Napi::Function>();
    auto get_class_fn = contract_provider.Get("getContractClass").As<Napi::Function>();
    auto add_non_rev_fn = contract_provider.Get("addNewNonRevertibleContracts").As<Napi::Function>();
    auto add_rev_fn = contract_provider.Get("addNewRevertibleContracts").As<Napi::Function>();
    auto get_bytecode_fn = contract_provider.Get("getBytecodeCommitment").As<Napi::Function>();
    auto get_debug_name_fn = contract_provider.Get("getDebugFunctionName").As<Napi::Function>();

    // Create thread-safe function wrappers for callbacks
    // These allow us to call TypeScript from the C++ worker thread
    auto instance_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_instance_fn, "getContractInstance", 0, 1));

    auto class_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_class_fn, "getContractClass", 0, 1));

    auto add_non_rev_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, add_non_rev_fn, "addNewNonRevertibleContracts", 0, 1));

    auto add_rev_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, add_rev_fn, "addNewRevertibleContracts", 0, 1));

    auto bytecode_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_bytecode_fn, "getBytecodeCommitment", 0, 1));

    auto debug_name_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_debug_name_fn, "getDebugFunctionName", 0, 1));

    // Extract WorldState handle (3rd argument)
    auto external = info[2].As<Napi::External<world_state::WorldState>>();
    world_state::WorldState* ws_ptr = external.Data();

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create async operation that will run on a worker thread
    auto* op = new AsyncOperation(
        env,
        deferred,
        [data, instance_tsfn, class_tsfn, add_non_rev_tsfn, add_rev_tsfn, bytecode_tsfn, debug_name_tsfn, ws_ptr](
            msgpack::sbuffer& result_buffer) {
            // Deserialize inputs from msgpack
            avm2::AvmFastSimulationInputs inputs;
            msgpack::object_handle obj_handle =
                msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
            msgpack::object obj = obj_handle.get();
            obj.convert(inputs);

            // Create TsCallbackContractDB with TypeScript callbacks
            TsCallbackContractDB contract_db(
                *instance_tsfn, *class_tsfn, *add_non_rev_tsfn, *add_rev_tsfn, *bytecode_tsfn, *debug_name_tsfn);

            // Create AVM API and run simulation with the callback-based contracts DB and WorldState reference
            avm2::AvmSimAPI avm;
            avm.simulate(inputs, contract_db, *ws_ptr);
            // TODO(dbanks12): return PublicTxResult as the TS PublicTxSimulator returns.
            // For now just a bool true.
            bool success = true;

            // Clean up thread-safe functions
            instance_tsfn->Release();
            class_tsfn->Release();
            add_non_rev_tsfn->Release();
            add_rev_tsfn->Release();
            bytecode_tsfn->Release();
            debug_name_tsfn->Release();

            // Serialize the simulation result with msgpack into the return buffer to TS.
            msgpack::pack(result_buffer, success);
        });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

Napi::Value AvmSimulateNapi::simulateWithHintedDbs(const Napi::CallbackInfo& info)
{
    // TODO(dbanks12): configurable verbosity (maybe based on TS log level)
    verbose_logging = true;
    debug_logging = true;

    Napi::Env env = info.Env();

    // Validate arguments - expects 1 argument
    // arg[0]: inputs Buffer (required) - AvmProvingInputs
    if (info.Length() < 1) {
        throw Napi::TypeError::New(
            env, "Wrong number of arguments. Expected 1 argument: AvmProvingInputs/AvmCircuitInputs msgpack Buffer.");
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

        // Create AVM Sim API and run simulation with the hinted DBs
        // All hints are already in the inputs, so no runtime contract DB callbacks needed
        avm2::AvmSimAPI avm;
        avm.simulate_with_hinted_dbs(inputs);
        // TODO(dbanks12): return PublicTxResult as the TS PublicTxSimulator returns.
        // For now just a bool true.
        bool success = true;

        // Serialize the simulation result with msgpack into the return buffer to TS.
        msgpack::pack(result_buffer, success);
    });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

} // namespace bb::nodejs
