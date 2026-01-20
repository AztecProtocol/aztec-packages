#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"

#include <cstdint>
#include <filesystem>
#include <string>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

using namespace bb::avm2::fuzzer;

// Extra counters to guide libfuzzer towards inputs with more enqueued calls.
// Index 0 = 1 call, index 1 = 2 calls, etc. When an input has N enqueued calls,
// we increment counter[N-1], signaling new coverage to libfuzzer.
constexpr size_t MAX_ENQUEUED_CALLS_COUNTER = 32;
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t enqueued_calls_counter[MAX_ENQUEUED_CALLS_COUNTER];

extern "C" int LLVMFuzzerInitialize(int*, char***)
{
    FuzzerWorldStateManager::initialize();
    return 0;
}

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* serialized_fuzzer_data,
                                          size_t serialized_fuzzer_data_size,
                                          size_t max_size,
                                          unsigned int seed)
{
    // Haven't thought much about the lifecycle of this in the tx fuzzer. Maybe we want it in the serialized data?
    // Or we can regenerate from the serialized data.
    FuzzerContext context;
    return mutate_tx_data(context, serialized_fuzzer_data, serialized_fuzzer_data_size, max_size, seed);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    FuzzerWorldStateManager* ws_mgr = FuzzerWorldStateManager::getInstance();
    FuzzerContractDB contract_db;
    ws_mgr->fork();

    FuzzerContext context;

    FuzzerTxData tx_data;

    try {
        msgpack::unpack((reinterpret_cast<const char*>(data)), size).get().convert(tx_data);
    } catch (const std::exception& e) {
        fuzz_info("Failed to deserialize input in TestOneInput, using default. Exception: ", e.what());
        tx_data = create_default_tx_data(context);
    }

    // Signal coverage for number of enqueued calls to guide fuzzer towards more calls
    size_t num_calls = tx_data.tx.setup_enqueued_calls.size() + tx_data.tx.app_logic_enqueued_calls.size();
    if (num_calls > 0 && num_calls <= MAX_ENQUEUED_CALLS_COUNTER) {
        enqueued_calls_counter[num_calls - 1]++;
    }

    // Setup contracts and fund fee payer
    // Fuzzer state is dependent on the tx data
    setup_fuzzer_state(*ws_mgr, contract_db, tx_data);
    fund_fee_payer(*ws_mgr, tx_data.tx);

    int result = fuzz_prover(*ws_mgr, contract_db, tx_data);

    // Print timing stats for this iteration
    vinfo("Timing stats:\n", bb::avm2::Stats::get().to_string());

    ws_mgr->reset_world_state();

    return result;
}
