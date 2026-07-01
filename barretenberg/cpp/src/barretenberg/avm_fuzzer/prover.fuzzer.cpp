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

// Counters for tracking transaction effects to guide libfuzzer.
__attribute__((section(
    "__libfuzzer_extra_counters"))) uint8_t public_data_writes_counter[MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t note_hashes_counter[MAX_NOTE_HASHES_PER_TX];
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t nullifiers_counter[MAX_NULLIFIERS_PER_TX];
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t l2_to_l1_msgs_counter[MAX_L2_TO_L1_MSGS_PER_TX];

// Public logs use logarithmic bucketing due to large range
constexpr size_t MAX_PUBLIC_LOGS_COUNTER = 16;
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t public_logs_counter[MAX_PUBLIC_LOGS_COUNTER];

namespace {

void update_effects_counters(const TxSimulationResult& result)
{
    const auto& tx_effect = result.public_tx_effect;

    size_t public_data_writes_size = tx_effect.public_data_writes.size();
    if (public_data_writes_size > 0) {
        if (public_data_writes_size > MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
            throw std::runtime_error(
                "Should be unreachable: generated " + std::to_string(public_data_writes_size) +
                " public data writes, max: " + std::to_string(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX));
        }
        public_data_writes_counter[public_data_writes_size - 1]++;
    }

    size_t note_hashes_size = tx_effect.note_hashes.size();
    if (note_hashes_size > 0) {
        if (note_hashes_size > MAX_NOTE_HASHES_PER_TX) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(note_hashes_size) +
                                     " note hashes, max: " + std::to_string(MAX_NOTE_HASHES_PER_TX));
        }
        note_hashes_counter[note_hashes_size - 1]++;
    }

    size_t nullifiers_size = tx_effect.nullifiers.size();
    if (nullifiers_size > 0) {
        if (nullifiers_size > MAX_NULLIFIERS_PER_TX) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(nullifiers_size) +
                                     " nullifiers, max: " + std::to_string(MAX_NULLIFIERS_PER_TX));
        }
        nullifiers_counter[nullifiers_size - 1]++;
    }

    size_t l2_to_l1_size = tx_effect.l2_to_l1_msgs.size();
    if (l2_to_l1_size > 0) {
        if (l2_to_l1_size > MAX_L2_TO_L1_MSGS_PER_TX) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(l2_to_l1_size) +
                                     " L2-to-L1 messages, max: " + std::to_string(MAX_L2_TO_L1_MSGS_PER_TX));
        }
        l2_to_l1_msgs_counter[l2_to_l1_size - 1]++;
    }

    // Public logs: calculate total field count across all logs.
    // Each log contributes 2 header fields (length + contract_address) plus data fields.
    uint32_t logs_field_count = 0;
    for (const auto& log : tx_effect.public_logs) {
        logs_field_count += 2 + static_cast<uint32_t>(log.fields.size());
    }
    if (logs_field_count > 0) {
        uint8_t bucket = static_cast<uint8_t>(31 - std::countl_zero(logs_field_count));
        if (bucket >= MAX_PUBLIC_LOGS_COUNTER) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(logs_field_count) +
                                     " fields, max log2(count): " + std::to_string(MAX_PUBLIC_LOGS_COUNTER));
        }
        public_logs_counter[bucket]++;
    }
}

} // namespace

extern "C" int LLVMFuzzerInitialize(int*, char***)
{
    // Zero all counters
    memset(enqueued_calls_counter, 0, sizeof(enqueued_calls_counter));
    memset(public_data_writes_counter, 0, sizeof(public_data_writes_counter));
    memset(note_hashes_counter, 0, sizeof(note_hashes_counter));
    memset(nullifiers_counter, 0, sizeof(nullifiers_counter));
    memset(l2_to_l1_msgs_counter, 0, sizeof(l2_to_l1_msgs_counter));
    memset(public_logs_counter, 0, sizeof(public_logs_counter));

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
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
    ws_mgr->reseed_to_genesis();

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

    TxSimulationResult result = fuzz_prover(*ws_mgr, contract_db, tx_data);
    update_effects_counters(result);

    // Print timing stats for this iteration
    vinfo("Timing stats:\n", bb::avm2::Stats::get().to_string());

    return 0;
}
