#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"

#include <cstdint>
#include <filesystem>
#include <string>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

using namespace bb::avm2::fuzzer;

extern "C" int LLVMFuzzerInitialize(int*, char***)
{
    FuzzerWorldStateManager::initialize();
    std::filesystem::create_directories("proving_inputs");
    return 0;
}

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* serialized_fuzzer_data,
                                          size_t serialized_fuzzer_data_size,
                                          size_t max_size,
                                          unsigned int seed)
{
    return mutate_tx_data(serialized_fuzzer_data, serialized_fuzzer_data_size, max_size, seed);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    FuzzerTxData tx_data;
    try {
        msgpack::unpack((reinterpret_cast<const char*>(data)), size).get().convert(tx_data);
    } catch (const std::exception& e) {
        fuzz_info("Failed to deserialize input in TestOneInput, using default. Exception: ", e.what());
        tx_data = create_default_tx_data();
    }

    FuzzerWorldStateManager* ws_mgr = FuzzerWorldStateManager::getInstance();
    FuzzerContractDB contract_db;
    ws_mgr->fork();

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
