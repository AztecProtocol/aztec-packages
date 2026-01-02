#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"

#include <cstdint>
#include <string>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

using namespace bb::avm2::fuzzer;
using namespace bb::avm2::simulation;

extern "C" int LLVMFuzzerInitialize(int*, char***)
{
    const char* simulator_path = std::getenv("AVM_SIMULATOR_BIN");
    if (simulator_path == nullptr) {
        throw std::runtime_error("AVM_SIMULATOR_BIN is not set");
    }
    std::string simulator_path_str(simulator_path);
    JsSimulator::initialize(simulator_path_str);
    FuzzerWorldStateManager::initialize();
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
    setup_fuzzer_state(*ws_mgr, contract_db, tx_data);
    fund_fee_payer(*ws_mgr, tx_data.tx);

    fuzz_tx(*ws_mgr, contract_db, tx_data);
    ws_mgr->reset_world_state();

    return 0;
}
