#include "barretenberg/nodejs_module/avm_simulate/avm_simulate_napi.hpp"

#include <array>
#include <memory>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/nodejs_module/avm_simulate/ts_callback_contract_db.hpp"
#include "barretenberg/nodejs_module/util/async_op.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/vm2_wsdb/wsdb_ipc_merkle_db.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"

namespace bb::nodejs {
namespace {

// Log levels from TS foundation/src/log/log-levels.ts: ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug',
// 'trace'] Map: 0=silent, 1=fatal, 2=error, 3=warn, 4=info, 5=verbose, 6=debug, 7=trace

// Helper to set logging level based on TS log level
inline void set_logging_from_level(int ts_log_level)
{
    // Map TS log level (0-7) to C++ LogLevel enum
    // TS: 0=silent, 1=fatal, 2=error, 3=warn, 4=info, 5=verbose, 6=debug, 7=trace
    // C++: SILENT=0, FATAL=1, ERROR=2, WARN=3, INFO=4, VERBOSE=5, DEBUG=6, TRACE=7
    // They map 1:1
    if (ts_log_level >= 0 && ts_log_level <= 7) {
        bb_log_level = static_cast<LogLevel>(ts_log_level);
    } else {
        log_warn("Invalid log level from TypeScript: ", ts_log_level, ". Using default.");
    }
}

// Map C++ LogLevel enum to TypeScript log level string
// C++ LogLevel: SILENT=0, FATAL=1, ERROR=2, WARN=3, INFO=4, VERBOSE=5, DEBUG=6, TRACE=7
// TS LogLevels: ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace']
inline const char* cpp_log_level_to_ts(LogLevel level)
{
    switch (level) {
    case LogLevel::SILENT:
        return "silent";
    case LogLevel::FATAL:
        return "fatal";
    case LogLevel::ERROR:
        return "error";
    case LogLevel::WARN:
        return "warn";
    case LogLevel::INFO:
        return "info";
    case LogLevel::VERBOSE:
        return "verbose";
    case LogLevel::DEBUG:
        return "debug";
    case LogLevel::TRACE:
        return "trace";
    default:
        return "info";
    }
}

// Helper to create a LogFunction wrapper from a ThreadSafeFunction
// This allows C++ logging to call back to TypeScript logger from worker threads
LogFunction create_log_function_from_tsfn(const std::shared_ptr<Napi::ThreadSafeFunction>& logger_tsfn)
{
    return [logger_tsfn](LogLevel level, const std::string& msg) {
        // Convert C++ LogLevel to TS log level string
        const char* ts_level = cpp_log_level_to_ts(level);

        // Call TypeScript logger function on the JS main thread
        // Using BlockingCall to ensure synchronous execution
        // Ignore errors - logging failures shouldn't crash the simulation
        // NOTE: We copy the string because it might be destroyed before the callback is called.
        logger_tsfn->BlockingCall([ts_level, msg](Napi::Env env, Napi::Function js_logger) {
            // Create arguments: (level: string, msg: string)
            auto level_js = Napi::String::New(env, ts_level);
            auto msg_js = Napi::String::New(env, msg);
            js_logger.Call({ level_js, msg_js });
        });
    };
}

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
    Napi::Env env = cb_info.Env();

    // Validate arguments - expects 3-6 arguments
    // arg[0]: inputs Buffer (required)
    // arg[1]: contractProvider object (required)
    // arg[2]: worldStateHandle external (required)
    // arg[3]: logLevel number (optional) - index into TS LogLevels array, -1 if omitted
    // arg[4]: loggerFunction (optional) - can be null/undefined
    // arg[5]: cancellationToken external (optional)
    if (cb_info.Length() < 3) {
        throw Napi::TypeError::New(
            env,
            "Wrong number of arguments. Expected 3-6 arguments: inputs Buffer, contractProvider "
            "object, worldStateHandle, optional logLevel, optional loggerFunction, and optional cancellationToken.");
    }

    /*******************************
     *** AvmFastSimulationInputs ***
     *******************************/
    if (!cb_info[0].IsBuffer()) {
        throw Napi::TypeError::New(env,
                                   "First argument must be a Buffer containing serialized AvmFastSimulationInputs");
    }
    // Extract the inputs buffer
    auto inputs_buffer = cb_info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();
    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    /***********************************
     *** ContractProvider (required) ***
     ***********************************/
    if (!cb_info[1].IsObject()) {
        throw Napi::TypeError::New(env, "Second argument must be a contractProvider object");
    }
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

    /***************************************
     *** WSDB socket path (required) ***
     ***************************************/
    if (!cb_info[2].IsString()) {
        throw Napi::TypeError::New(env, "Third argument must be a WSDB socket path (string)");
    }
    std::string wsdb_socket_path = cb_info[2].As<Napi::String>().Utf8Value();

    /***************************
     *** LogLevel (optional) ***
     ***************************/
    int log_level = -1;
    if (cb_info.Length() > 3 && cb_info[3].IsNumber()) {
        log_level = cb_info[3].As<Napi::Number>().Int32Value();
        set_logging_from_level(log_level);
    }

    /*********************************
     *** LoggerFunction (optional) ***
     *********************************/
    std::shared_ptr<Napi::ThreadSafeFunction> logger_tsfn = nullptr;
    if (cb_info.Length() > 4 && !cb_info[4].IsNull() && !cb_info[4].IsUndefined()) {
        if (cb_info[4].IsFunction()) {
            // Logger function provided - create thread-safe wrapper
            auto logger_function = cb_info[4].As<Napi::Function>();
            logger_tsfn = make_tsfn(env, logger_function, "LoggerCallback");
            // Create LogFunction wrapper and set it as the global log function
            // This will be used by C++ logging macros (info, debug, vinfo, important)
            set_log_function(create_log_function_from_tsfn(logger_tsfn));
        } else {
            throw Napi::TypeError::New(env, "Fifth argument must be a logger function, null, or undefined");
        }
    }

    /*************************************
     *** Cancellation Token (optional) ***
     *************************************/
    avm2::simulation::CancellationTokenPtr cancellation_token = nullptr;
    if (cb_info.Length() > 5 && cb_info[5].IsExternal()) {
        auto token_external = cb_info[5].As<Napi::External<avm2::simulation::CancellationToken>>();
        // Wrap the raw pointer in a shared_ptr that does NOT delete (since the External owns it)
        cancellation_token = std::shared_ptr<avm2::simulation::CancellationToken>(
            token_external.Data(), [](avm2::simulation::CancellationToken*) {
                // No-op deleter: the External (via shared_ptr destructor callback) owns the token
            });
    }

    /**********************************************************
     *** Create Deferred Promise and launch async operation ***
     **********************************************************/

    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);
    // Create threaded operation that runs on a dedicated std::thread (not libuv pool).
    // This prevents libuv thread pool exhaustion when callbacks need libuv threads for I/O.
    auto* op = new ThreadedAsyncOperation(
        env,
        deferred,
        [data, tsfns, logger_tsfn, wsdb_socket_path, cancellation_token](msgpack::sbuffer& result_buffer) {
            // Collect all thread-safe functions including logger for cleanup
            auto all_tsfns = tsfns.to_vector();
            all_tsfns.push_back(logger_tsfn);
            // Ensure all thread-safe functions are released in all code paths
            TsfnReleaser releaser = TsfnReleaser(std::move(all_tsfns));

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

                // Connect to aztec-wsdb over UDS and wrap in a WsdbIpcMerkleDB that implements
                // LowLevelMerkleDBInterface. The connection is per-simulation; aztec-wsdb is a
                // long-running server that the TS layer spawned and owns.
                bb::wsdb::WsdbIpcClient wsdb_client(wsdb_socket_path);
                bb::avm2::simulation::WsdbIpcMerkleDB merkle_db(wsdb_client, inputs.ws_revision);

                avm2::AvmSimAPI avm;
                avm2::TxSimulationResult result = avm.simulate(inputs, contract_db, merkle_db, cancellation_token);

                // Serialize the simulation result with msgpack into the return buffer to TS.
                msgpack::pack(result_buffer, result);
            } catch (const avm2::simulation::CancelledException& e) {
                // Cancellation is an expected condition, rethrow with context
                throw std::runtime_error("Simulation cancelled");
            } catch (const std::exception& e) {
                // Rethrow with context (RAII wrappers will clean up automatically)
                throw std::runtime_error(std::string("AVM simulation failed: ") + e.what());
            } catch (...) {
                throw std::runtime_error("AVM simulation failed with unknown exception");
            }
        });

    op->Queue();

    return deferred->Promise();
}

Napi::Value AvmSimulateNapi::simulateWithHintedDbs(const Napi::CallbackInfo& cb_info)
{
    Napi::Env env = cb_info.Env();

    // Validate arguments - expects 2 arguments
    // arg[0]: inputs Buffer (required) - AvmProvingInputs
    // arg[1]: logLevel number (required) - index into TS LogLevels array
    if (cb_info.Length() < 2) {
        throw Napi::TypeError::New(env,
                                   "Wrong number of arguments. Expected 2 arguments: AvmProvingInputs/AvmCircuitInputs "
                                   "msgpack Buffer and logLevel.");
    }

    if (!cb_info[0].IsBuffer()) {
        throw Napi::TypeError::New(
            env, "First argument must be a Buffer containing serialized AvmProvingInputs/AvmCircuitInputs");
    }

    if (!cb_info[1].IsNumber()) {
        throw Napi::TypeError::New(env, "Second argument must be a log level number (0-7)");
    }

    // Extract log level and set logging flags
    int log_level = cb_info[1].As<Napi::Number>().Int32Value();
    set_logging_from_level(log_level);

    // Extract the inputs buffer
    auto inputs_buffer = cb_info[0].As<Napi::Buffer<uint8_t>>();
    size_t length = inputs_buffer.Length();

    // Copy the buffer data into C++ memory (we can't access Napi objects from worker thread)
    auto data = std::make_shared<std::vector<uint8_t>>(inputs_buffer.Data(), inputs_buffer.Data() + length);

    // Create a deferred promise
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    // Create threaded operation that runs on a dedicated std::thread (not libuv pool)
    auto* op = new ThreadedAsyncOperation(env, deferred, [data](msgpack::sbuffer& result_buffer) {
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

    op->Queue();

    return deferred->Promise();
}

Napi::Value AvmSimulateNapi::createCancellationToken(const Napi::CallbackInfo& cb_info)
{
    Napi::Env env = cb_info.Env();

    // Create a new CancellationToken. We use a shared_ptr to manage the lifetime,
    // and the destructor callback in the External will clean it up when GC runs.
    auto* token = new avm2::simulation::CancellationToken();

    // Create an External with a destructor callback that deletes the token
    return Napi::External<avm2::simulation::CancellationToken>::New(
        env, token, [](Napi::Env /*env*/, avm2::simulation::CancellationToken* t) { delete t; });
}

Napi::Value AvmSimulateNapi::cancelSimulation(const Napi::CallbackInfo& cb_info)
{
    Napi::Env env = cb_info.Env();

    if (cb_info.Length() < 1 || !cb_info[0].IsExternal()) {
        throw Napi::TypeError::New(env, "Expected a CancellationToken External as argument");
    }

    auto token_external = cb_info[0].As<Napi::External<avm2::simulation::CancellationToken>>();
    avm2::simulation::CancellationToken* token = token_external.Data();

    // Signal cancellation - this is thread-safe (atomic store)
    token->cancel();

    return env.Undefined();
}

} // namespace bb::nodejs
