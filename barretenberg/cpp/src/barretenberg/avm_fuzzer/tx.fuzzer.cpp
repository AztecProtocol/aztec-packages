#include <cstdint>
#include <string>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/counters.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"

using namespace bb::avm2::fuzzer;
using namespace bb::avm2::simulation;

extern "C" int LLVMFuzzerInitialize(int*, char***)
{
    reset_counters();
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
    FuzzerWorldStateManager ws_mgr;
    FuzzerContractDB contract_db;

    FuzzerContext context;

    FuzzerTxData tx_data;
    try {
        msgpack::unpack((reinterpret_cast<const char*>(data)), size).get().convert(tx_data);
    } catch (const std::exception& e) {
        fuzz_info("Failed to deserialize input in TestOneInput, using default. Exception: ", e.what());
        tx_data = create_default_tx_data(context);
    }

    record_tx_shape(tx_data);

    // Setup contracts and fund fee payer
    setup_fuzzer_state(ws_mgr, contract_db, tx_data);
    fund_fee_payer(ws_mgr, tx_data.tx);

    auto simulation_result = fuzz_tx(ws_mgr, contract_db, tx_data);
    (void)simulation_result;

    return 0;
}
