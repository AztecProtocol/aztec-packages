#include "avm_simulate_napi.hpp"

#include <memory>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/nodejs_module/avm_simulate/ts_callback_contract_db.hpp"
#include "barretenberg/nodejs_module/util/async_op.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"

namespace bb::nodejs {

namespace {
// Callback method names
constexpr const char* CALLBACK_GET_CONTRACT_INSTANCE = "getContractInstance";
constexpr const char* CALLBACK_GET_CONTRACT_CLASS = "getContractClass";
constexpr const char* CALLBACK_ADD_CONTRACTS = "addContracts";
constexpr const char* CALLBACK_GET_BYTECODE = "getBytecodeCommitment";
constexpr const char* CALLBACK_GET_DEBUG_NAME = "getDebugFunctionName";
constexpr const char* CALLBACK_CREATE_CHECKPOINT = "createCheckpoint";
constexpr const char* CALLBACK_COMMIT_CHECKPOINT = "commitCheckpoint";
constexpr const char* CALLBACK_REVERT_CHECKPOINT = "revertCheckpoint";

// RAII helper to automatically release thread-safe functions
// Used inside the async lambda to ensure cleanup in all code paths
class TsfnReleaser {
    std::vector<std::shared_ptr<Napi::ThreadSafeFunction>> tsfns_;

  public:
    explicit TsfnReleaser(std::vector<std::shared_ptr<Napi::ThreadSafeFunction>> tsfns)
        : tsfns_(std::move(tsfns))
    {}

    ~TsfnReleaser()
    {
        for (auto& tsfn : tsfns_) {
            if (tsfn) {
                tsfn->Release();
            }
        }
    }

    // Prevent copying and moving
    TsfnReleaser(const TsfnReleaser&) = delete;
    TsfnReleaser& operator=(const TsfnReleaser&) = delete;
    TsfnReleaser(TsfnReleaser&&) = delete;
    TsfnReleaser& operator=(TsfnReleaser&&) = delete;
};

// Helper to create thread-safe function wrapper
inline std::shared_ptr<Napi::ThreadSafeFunction> make_tsfn(Napi::Env env, Napi::Function fn, const char* name)
{
    return std::make_shared<Napi::ThreadSafeFunction>(Napi::ThreadSafeFunction::New(env, fn, name, 0, 1));
}

// Bundle all contract-related thread-safe functions with named access
struct ContractTsfns {
    std::shared_ptr<Napi::ThreadSafeFunction> instance;
    std::shared_ptr<Napi::ThreadSafeFunction> class_;
    std::shared_ptr<Napi::ThreadSafeFunction> add_contracts;
    std::shared_ptr<Napi::ThreadSafeFunction> bytecode;
    std::shared_ptr<Napi::ThreadSafeFunction> debug_name;
    std::shared_ptr<Napi::ThreadSafeFunction> create_checkpoint;
    std::shared_ptr<Napi::ThreadSafeFunction> commit_checkpoint;
    std::shared_ptr<Napi::ThreadSafeFunction> revert_checkpoint;

    std::vector<std::shared_ptr<Napi::ThreadSafeFunction>> to_vector() const
    {
        return { instance,          class_,           add_contracts, bytecode, debug_name, create_checkpoint,
                 commit_checkpoint, revert_checkpoint };
    }
};

// Helper to validate and extract contract provider callbacks
struct ContractCallbacks {
    static constexpr const char* ALL_METHODS[] = { CALLBACK_GET_CONTRACT_INSTANCE, CALLBACK_GET_CONTRACT_CLASS,
                                                   CALLBACK_ADD_CONTRACTS,         CALLBACK_GET_BYTECODE,
                                                   CALLBACK_GET_DEBUG_NAME,        CALLBACK_CREATE_CHECKPOINT,
                                                   CALLBACK_COMMIT_CHECKPOINT,     CALLBACK_REVERT_CHECKPOINT };

    static void validate(Napi::Env env, Napi::Object provider)
    {
        for (const char* method : ALL_METHODS) {
            if (!provider.Has(method)) {
                throw Napi::TypeError::New(
                    env, std::string("contractProvider must have ") + method + " method. Missing methods: " + method);
            }
        }
    }

    static Napi::Function get(Napi::Object provider, const char* name)
    {
        return provider.Get(name).As<Napi::Function>();
    }
};
} // namespace

Napi::Value AvmSimulateNapi::simulate(const Napi::CallbackInfo& cb_info)
{
    // TODO(dbanks12): configurable verbosity (maybe based on TS log level)
    // verbose_logging = true;
    // debug_logging = true;

    Napi::Env env = cb_info.Env();

    // Validate arguments - expects 3 arguments
    // arg[0]: inputs Buffer (required)
    // arg[1]: contractProvider object (required)
    // arg[2]: worldStateHandle external (required)
    // TODO(MW): include arg[3] = generate_hints here?
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

    // Extract and validate contract provider callbacks
    auto contract_provider = cb_info[1].As<Napi::Object>();
    ContractCallbacks::validate(env, contract_provider);

    // Create thread-safe function wrappers for callbacks
    // These allow us to call TypeScript from the C++ worker thread
    ContractTsfns tsfns{
        .instance = make_tsfn(env,
                              ContractCallbacks::get(contract_provider, CALLBACK_GET_CONTRACT_INSTANCE),
                              CALLBACK_GET_CONTRACT_INSTANCE),
        .class_ = make_tsfn(
            env, ContractCallbacks::get(contract_provider, CALLBACK_GET_CONTRACT_CLASS), CALLBACK_GET_CONTRACT_CLASS),
        .add_contracts =
            make_tsfn(env, ContractCallbacks::get(contract_provider, CALLBACK_ADD_CONTRACTS), CALLBACK_ADD_CONTRACTS),
        .bytecode =
            make_tsfn(env, ContractCallbacks::get(contract_provider, CALLBACK_GET_BYTECODE), CALLBACK_GET_BYTECODE),
        .debug_name =
            make_tsfn(env, ContractCallbacks::get(contract_provider, CALLBACK_GET_DEBUG_NAME), CALLBACK_GET_DEBUG_NAME),
        .create_checkpoint = make_tsfn(
            env, ContractCallbacks::get(contract_provider, CALLBACK_CREATE_CHECKPOINT), CALLBACK_CREATE_CHECKPOINT),
        .commit_checkpoint = make_tsfn(
            env, ContractCallbacks::get(contract_provider, CALLBACK_COMMIT_CHECKPOINT), CALLBACK_COMMIT_CHECKPOINT),
        .revert_checkpoint = make_tsfn(
            env, ContractCallbacks::get(contract_provider, CALLBACK_REVERT_CHECKPOINT), CALLBACK_REVERT_CHECKPOINT),
    };

    // Extract WorldState handle (3rd argument)
    auto external = cb_info[2].As<Napi::External<world_state::WorldState>>();
    world_state::WorldState* ws_ptr = external.Data();

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create async operation that will run on a worker thread
    auto* op = new AsyncOperation(env, deferred, [data, tsfns, ws_ptr](msgpack::sbuffer& result_buffer) {
        // Ensure all thread-safe functions are released in all code paths
        TsfnReleaser releaser = TsfnReleaser(tsfns.to_vector());

        try {
            // Deserialize inputs from msgpack
            avm2::AvmFastSimulationInputs inputs;
            msgpack::object_handle obj_handle =
                msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
            msgpack::object obj = obj_handle.get();
            obj.convert(inputs);

            // Create TsCallbackContractDB with TypeScript callbacks
            TsCallbackContractDB contract_db(*tsfns.instance,
                                             *tsfns.class_,
                                             *tsfns.add_contracts,
                                             *tsfns.bytecode,
                                             *tsfns.debug_name,
                                             *tsfns.create_checkpoint,
                                             *tsfns.commit_checkpoint,
                                             *tsfns.revert_checkpoint);

            // Create AVM API and run simulation with the callback-based contracts DB and
            // WorldState reference
            avm2::AvmSimAPI avm;
            avm2::TxSimulationResult result = avm.simulate(inputs, contract_db, *ws_ptr);

            // Serialize the simulation result with msgpack into the return buffer to TS.
            msgpack::pack(result_buffer, result);
        } catch (const std::exception& e) {
            // Rethrow with context (RAII wrappers will clean up automatically)
            throw std::runtime_error(std::string("AVM simulation failed: ") + e.what());
        } catch (...) {
            throw std::runtime_error("AVM simulation failed with unknown exception");
        }
    });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

Napi::Value AvmSimulateNapi::simulateWithHintedDbs(const Napi::CallbackInfo& cb_info)
{
    // TODO(dbanks12): configurable verbosity (maybe based on TS log level)
    verbose_logging = true;
    debug_logging = true;

    Napi::Env env = cb_info.Env();

    // Validate arguments - expects 1 argument
    // arg[0]: inputs Buffer (required) - AvmProvingInputs
    if (cb_info.Length() < 1) {
        throw Napi::TypeError::New(
            env, "Wrong number of arguments. Expected 1 argument: AvmProvingInputs/AvmCircuitInputs msgpack Buffer.");
    }

    if (!cb_info[0].IsBuffer()) {
        throw Napi::TypeError::New(
            env, "First argument must be a Buffer containing serialized AvmProvingInputs/AvmCircuitInputs");
    }

    // Extract the inputs buffer
    auto inputs_buffer = cb_info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();

    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create async operation that will run on a worker thread
    auto* op = new AsyncOperation(env, deferred, [data](msgpack::sbuffer& result_buffer) {
        try {
            // Deserialize inputs from msgpack
            avm2::AvmProvingInputs inputs;
            msgpack::object_handle obj_handle =
                msgpack::unpack(reinterpret_cast<const char*>(data->data()), data->size());
            msgpack::object obj = obj_handle.get();
            obj.convert(inputs);

            // Create AVM Sim API and run simulation with the hinted DBs
            // All hints are already in the inputs, so no runtime contract DB callbacks needed
            avm2::AvmSimAPI avm;
            avm2::TxSimulationResult result = avm.simulate_with_hinted_dbs(inputs);

            // Serialize the simulation result with msgpack into the return buffer to TS.
            msgpack::pack(result_buffer, result);
        } catch (const std::exception& e) {
            // Rethrow with context
            throw std::runtime_error(std::string("AVM simulation with hinted DBs failed: ") + e.what());
        } catch (...) {
            throw std::runtime_error("AVM simulation with hinted DBs failed with unknown exception");
        }
    });

    // Napi is now responsible for destroying this object
    op->Queue();

    return deferred->Promise();
}

} // namespace bb::nodejs
