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

Napi::Value AvmSimulateNapi::simulate(const Napi::CallbackInfo& cb_info)
{
    // TODO(dbanks12): configurable verbosity (maybe based on TS log level)
    verbose_logging = true;
    debug_logging = true;

    Napi::Env env = cb_info.Env();

    // Validate arguments - expects 3 arguments
    // arg[0]: inputs Buffer (required)
    // arg[1]: contractProvider object (required)
    // arg[2]: worldStateHandle external (required)
    if (cb_info.Length() < 3) {
        throw Napi::TypeError::New(env,
                                   "Wrong number of arguments. Expected 3 arguments: inputs Buffer, contractProvider "
                                   "object, and worldStateHandle.");
    }

    if (!cb_info[0].IsBuffer()) {
        throw Napi::TypeError::New(env,
                                   "First argument must be a Buffer containing serialized AvmFastSimulationInputs");
    }

    if (!cb_info[1].IsObject()) {
        throw Napi::TypeError::New(env, "Second argument must be a contractProvider object");
    }

    if (!cb_info[2].IsExternal()) {
        throw Napi::TypeError::New(env, "Third argument must be a WorldState handle (External)");
    }

    // Extract the inputs buffer
    auto inputs_buffer = cb_info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();

    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    // Extract contract provider callbacks
    auto contract_provider = cb_info[1].As<Napi::Object>();

    if (!(contract_provider.Has("getContractInstance") && contract_provider.Has("getContractClass") &&
          contract_provider.Has("getBytecodeCommitment") && contract_provider.Has("getDebugFunctionName") &&
          contract_provider.Has("addContracts") && contract_provider.Has("createCheckpoint") &&
          contract_provider.Has("commitCheckpoint") && contract_provider.Has("revertCheckpoint"))) {
        throw Napi::TypeError::New(
            env,
            "contractProvider must have getContractInstance, getContractClass, getBytecodeCommitment, "
            "getDebugFunctionName, addContracts, createCheckpoint, commitCheckpoint, and revertCheckpoint methods");
    }

    auto get_instance_fn = contract_provider.Get("getContractInstance").As<Napi::Function>();
    auto get_class_fn = contract_provider.Get("getContractClass").As<Napi::Function>();
    auto get_bytecode_fn = contract_provider.Get("getBytecodeCommitment").As<Napi::Function>();
    auto get_debug_name_fn = contract_provider.Get("getDebugFunctionName").As<Napi::Function>();
    auto add_contracts_fn = contract_provider.Get("addContracts").As<Napi::Function>();
    // Extract checkpoint method references
    auto create_checkpoint_fn = contract_provider.Get("createCheckpoint").As<Napi::Function>();
    auto commit_checkpoint_fn = contract_provider.Get("commitCheckpoint").As<Napi::Function>();
    auto revert_checkpoint_fn = contract_provider.Get("revertCheckpoint").As<Napi::Function>();

    // Create thread-safe function wrappers for callbacks
    // These allow us to call TypeScript from the C++ worker thread
    auto instance_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_instance_fn, "getContractInstance", 0, 1));

    auto class_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_class_fn, "getContractClass", 0, 1));

    auto bytecode_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_bytecode_fn, "getBytecodeCommitment", 0, 1));

    auto debug_name_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, get_debug_name_fn, "getDebugFunctionName", 0, 1));

    auto add_contracts_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, add_contracts_fn, "addContracts", 0, 1));

    // Create thread-safe function wrappers for checkpoint methods
    auto create_checkpoint_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, create_checkpoint_fn, "createCheckpoint", 0, 1));

    auto commit_checkpoint_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, commit_checkpoint_fn, "commitCheckpoint", 0, 1));

    auto revert_checkpoint_tsfn = std::make_shared<Napi::ThreadSafeFunction>(
        Napi::ThreadSafeFunction::New(env, revert_checkpoint_fn, "revertCheckpoint", 0, 1));

    // Extract WorldState handle (3rd argument)
    auto external = cb_info[2].As<Napi::External<world_state::WorldState>>();
    world_state::WorldState* ws_ptr = external.Data();

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create async operation that will run on a worker thread
    auto* op = new AsyncOperation(env,
                                  deferred,
                                  [data,
                                   instance_tsfn,
                                   class_tsfn,
                                   bytecode_tsfn,
                                   debug_name_tsfn,
                                   add_contracts_tsfn,
                                   create_checkpoint_tsfn,
                                   commit_checkpoint_tsfn,
                                   revert_checkpoint_tsfn,
                                   ws_ptr](msgpack::sbuffer& result_buffer) {
                                      // Deserialize inputs from msgpack
                                      avm2::AvmFastSimulationInputs inputs;
                                      msgpack::object_handle obj_handle =
                                          msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
                                      msgpack::object obj = obj_handle.get();
                                      obj.convert(inputs);

                                      // Create TsCallbackContractDB with TypeScript callbacks
                                      TsCallbackContractDB contract_db(*instance_tsfn,
                                                                       *class_tsfn,
                                                                       *bytecode_tsfn,
                                                                       *debug_name_tsfn,
                                                                       *add_contracts_tsfn,
                                                                       *create_checkpoint_tsfn,
                                                                       *commit_checkpoint_tsfn,
                                                                       *revert_checkpoint_tsfn);

                                      // Create AVM API and run simulation with the callback-based contracts DB and
                                      // WorldState reference
                                      avm2::AvmSimAPI avm;
                                      avm.simulate(inputs, contract_db, *ws_ptr);
                                      // TODO(dbanks12): return PublicTxResult as the TS PublicTxSimulator returns.
                                      // For now just a bool true.
                                      bool success = true;

                                      // Clean up thread-safe functions
                                      instance_tsfn->Release();
                                      class_tsfn->Release();
                                      bytecode_tsfn->Release();
                                      debug_name_tsfn->Release();
                                      add_contracts_tsfn->Release();
                                      create_checkpoint_tsfn->Release();
                                      commit_checkpoint_tsfn->Release();
                                      revert_checkpoint_tsfn->Release();

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
