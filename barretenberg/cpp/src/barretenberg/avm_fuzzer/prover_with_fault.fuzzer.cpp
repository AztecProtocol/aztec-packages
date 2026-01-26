//! The exact same as prover.fuzzer.cpp, but with fault injection.
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
    return mutate_tx_data(context,
                          serialized_fuzzer_data,
                          serialized_fuzzer_data_size,
                          max_size,
                          seed,
                          FUZZER_TX_DATA_MUTATION_CONFIGURATION_WITHOUT_BYTECODE_MUTATION);
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

    // Setup contracts and fund fee payer
    // Fuzzer state is dependent on the tx data
    setup_fuzzer_state(*ws_mgr, contract_db, tx_data);
    fund_fee_payer(*ws_mgr, tx_data.tx);

    fuzz_prover_with_fault_injection(*ws_mgr, contract_db, tx_data);

    ws_mgr->reset_world_state();

    return 0;
}
