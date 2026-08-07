#include "barretenberg/avm_fuzzer/counters.hpp"

#include <algorithm>
#include <array>
#include <bit>
#include <cstdlib>
#include <cstring>
#include <iterator>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"
#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/log.hpp"

namespace bb::avm2::fuzzer {
namespace {

// Each counter has two arrays: a uint8_t array in the __libfuzzer_extra_counters section, which
// libFuzzer folds into its coverage feedback and clears before every run, and a uint64_t array that
// accumulates across the whole campaign so the distribution can be reported. "used" keeps the
// feedback array from being discarded, since nothing reads it from this translation unit.
#define AVM_FUZZER_COUNTER(name, size)                                                                                 \
    __attribute__((used, section("__libfuzzer_extra_counters"))) uint8_t name##_feedback[size];                        \
    uint64_t name##_histogram[size]

// Input shape.
AVM_FUZZER_COUNTER(setup_calls, 17);
AVM_FUZZER_COUNTER(app_logic_calls, MAX_ENQUEUED_CALLS_PER_TX + 1);
AVM_FUZZER_COUNTER(teardown_call, 2);
AVM_FUZZER_COUNTER(contracts, 17);
AVM_FUZZER_COUNTER(cfg_instructions, 16);
AVM_FUZZER_COUNTER(bytecode_size, 24);

// Execution outcome.
AVM_FUZZER_COUNTER(revert_code, 4);
AVM_FUZZER_COUNTER(unprovable_tx, 2);
AVM_FUZZER_COUNTER(l2_gas_ratio, 18);
AVM_FUZZER_COUNTER(da_gas_ratio, 18);
AVM_FUZZER_COUNTER(max_call_depth, 16);
AVM_FUZZER_COUNTER(nested_calls, 16);
AVM_FUZZER_COUNTER(reverted_calls, 16);

// Transaction effects.
AVM_FUZZER_COUNTER(public_data_writes, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
AVM_FUZZER_COUNTER(note_hashes, MAX_NOTE_HASHES_PER_TX);
AVM_FUZZER_COUNTER(nullifiers, MAX_NULLIFIERS_PER_TX);
AVM_FUZZER_COUNTER(l2_to_l1_msgs, MAX_L2_TO_L1_MSGS_PER_TX);
AVM_FUZZER_COUNTER(public_logs, 16);

#define AVM_FUZZER_BUMP(name, index) bump(name##_feedback, name##_histogram, std::size(name##_feedback), index)
#define AVM_FUZZER_HISTOGRAM(name)                                                                                     \
    HistogramView                                                                                                      \
    {                                                                                                                  \
        #name, name##_histogram, std::size(name##_histogram)                                                           \
    }

struct HistogramView {
    const char* name;
    const uint64_t* data;
    size_t size;
};

// The gas ratio buckets 0..15 are sixteenths of the limit. An exceptional halt consumes the whole
// limit, so it always lands in EXHAUSTED rather than in bucket 15.
constexpr size_t GAS_RATIO_EXHAUSTED_BUCKET = 16;
constexpr size_t GAS_RATIO_NO_LIMIT_BUCKET = 17;

constexpr uint64_t DEFAULT_STATS_INTERVAL = 1000;

uint64_t executions = 0;

void bump(uint8_t* feedback, uint64_t* histogram, size_t size, size_t index)
{
    const size_t clamped = std::min(index, size - 1);
    feedback[clamped]++;
    histogram[clamped]++;
}

/// Bucket 0 is reserved for zero so that "none" stays distinguishable from "one".
size_t log2_bucket(uint64_t value)
{
    return value == 0 ? 0 : static_cast<size_t>(64 - std::countl_zero(value));
}

size_t gas_ratio_bucket(uint32_t used, uint32_t limit)
{
    if (limit == 0) {
        return GAS_RATIO_NO_LIMIT_BUCKET;
    }
    if (used >= limit) {
        return GAS_RATIO_EXHAUSTED_BUCKET;
    }
    return static_cast<size_t>((static_cast<uint64_t>(used) * 16) / limit);
}

struct CallTreeShape {
    size_t max_depth = 0;
    size_t total_nested = 0;
    size_t reverted = 0;
};

void walk_call_tree(const std::vector<CallStackMetadata>& calls, size_t depth, CallTreeShape& shape)
{
    for (const auto& call : calls) {
        shape.max_depth = std::max(shape.max_depth, depth);
        if (depth > 0) {
            shape.total_nested++;
        }
        if (call.reverted) {
            shape.reverted++;
        }
        walk_call_tree(call.nested, depth + 1, shape);
    }
}

void record_tx_effect(const PublicTxEffect& tx_effect)
{
    const size_t public_data_writes_size = tx_effect.public_data_writes.size();
    if (public_data_writes_size > 0) {
        if (public_data_writes_size > MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
            throw std::runtime_error(
                "Should be unreachable: generated " + std::to_string(public_data_writes_size) +
                " public data writes, max: " + std::to_string(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX));
        }
        AVM_FUZZER_BUMP(public_data_writes, public_data_writes_size - 1);
    }

    const size_t note_hashes_size = tx_effect.note_hashes.size();
    if (note_hashes_size > 0) {
        if (note_hashes_size > MAX_NOTE_HASHES_PER_TX) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(note_hashes_size) +
                                     " note hashes, max: " + std::to_string(MAX_NOTE_HASHES_PER_TX));
        }
        AVM_FUZZER_BUMP(note_hashes, note_hashes_size - 1);
    }

    const size_t nullifiers_size = tx_effect.nullifiers.size();
    if (nullifiers_size > 0) {
        if (nullifiers_size > MAX_NULLIFIERS_PER_TX) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(nullifiers_size) +
                                     " nullifiers, max: " + std::to_string(MAX_NULLIFIERS_PER_TX));
        }
        AVM_FUZZER_BUMP(nullifiers, nullifiers_size - 1);
    }

    const size_t l2_to_l1_size = tx_effect.l2_to_l1_msgs.size();
    if (l2_to_l1_size > 0) {
        if (l2_to_l1_size > MAX_L2_TO_L1_MSGS_PER_TX) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(l2_to_l1_size) +
                                     " L2-to-L1 messages, max: " + std::to_string(MAX_L2_TO_L1_MSGS_PER_TX));
        }
        AVM_FUZZER_BUMP(l2_to_l1_msgs, l2_to_l1_size - 1);
    }

    // Each log contributes 2 header fields (length + contract_address) plus data fields.
    uint32_t logs_field_count = 0;
    for (const auto& log : tx_effect.public_logs) {
        logs_field_count += 2 + static_cast<uint32_t>(log.fields.size());
    }
    if (logs_field_count > 0) {
        const size_t bucket = static_cast<size_t>(31 - std::countl_zero(logs_field_count));
        if (bucket >= std::size(public_logs_feedback)) {
            throw std::runtime_error("Should be unreachable: generated " + std::to_string(logs_field_count) +
                                     " fields, max log2(count): " + std::to_string(std::size(public_logs_feedback)));
        }
        AVM_FUZZER_BUMP(public_logs, bucket);
    }
}

std::string histogram_bar(uint64_t count, uint64_t max_count)
{
    constexpr size_t MAX_WIDTH = 40;
    if (max_count == 0) {
        return "";
    }
    const size_t width = static_cast<size_t>((static_cast<double>(count) / static_cast<double>(max_count)) *
                                             static_cast<double>(MAX_WIDTH));
    return std::string(width, '#');
}

void dump_histogram(const HistogramView& view)
{
    const uint64_t total = std::accumulate(view.data, view.data + view.size, uint64_t{ 0 });
    if (total == 0) {
        return;
    }
    const uint64_t max_count = *std::max_element(view.data, view.data + view.size);

    info(view.name, " (n=", total, ")");
    for (size_t i = 0; i < view.size; ++i) {
        if (view.data[i] == 0) {
            continue;
        }
        const double percent = 100.0 * static_cast<double>(view.data[i]) / static_cast<double>(total);
        info("  [",
             i,
             "] ",
             view.data[i],
             " (",
             static_cast<uint64_t>(percent),
             "%) ",
             histogram_bar(view.data[i], max_count));
    }
}

uint64_t stats_interval()
{
    const char* raw = std::getenv("AVM_FUZZER_STATS_INTERVAL");
    if (raw == nullptr) {
        return DEFAULT_STATS_INTERVAL;
    }
    const uint64_t parsed = std::strtoull(raw, nullptr, 10);
    return parsed == 0 ? DEFAULT_STATS_INTERVAL : parsed;
}

bool stats_enabled()
{
    static const bool enabled = std::getenv("AVM_FUZZER_STATS") != nullptr;
    return enabled;
}

} // namespace

void reset_counters()
{
    executions = 0;

#define AVM_FUZZER_CLEAR(name)                                                                                         \
    std::memset(name##_feedback, 0, sizeof(name##_feedback));                                                          \
    std::memset(name##_histogram, 0, sizeof(name##_histogram))

    AVM_FUZZER_CLEAR(setup_calls);
    AVM_FUZZER_CLEAR(app_logic_calls);
    AVM_FUZZER_CLEAR(teardown_call);
    AVM_FUZZER_CLEAR(contracts);
    AVM_FUZZER_CLEAR(cfg_instructions);
    AVM_FUZZER_CLEAR(bytecode_size);
    AVM_FUZZER_CLEAR(revert_code);
    AVM_FUZZER_CLEAR(unprovable_tx);
    AVM_FUZZER_CLEAR(l2_gas_ratio);
    AVM_FUZZER_CLEAR(da_gas_ratio);
    AVM_FUZZER_CLEAR(max_call_depth);
    AVM_FUZZER_CLEAR(nested_calls);
    AVM_FUZZER_CLEAR(reverted_calls);
    AVM_FUZZER_CLEAR(public_data_writes);
    AVM_FUZZER_CLEAR(note_hashes);
    AVM_FUZZER_CLEAR(nullifiers);
    AVM_FUZZER_CLEAR(l2_to_l1_msgs);
    AVM_FUZZER_CLEAR(public_logs);

#undef AVM_FUZZER_CLEAR

    if (stats_enabled()) {
        std::atexit(dump_fuzzer_stats);
    }
}

void record_tx_shape(const FuzzerTxData& tx_data)
{
    AVM_FUZZER_BUMP(setup_calls, tx_data.tx.setup_enqueued_calls.size());
    AVM_FUZZER_BUMP(app_logic_calls, tx_data.tx.app_logic_enqueued_calls.size());
    AVM_FUZZER_BUMP(teardown_call, tx_data.tx.teardown_enqueued_call.has_value() ? 1 : 0);
    AVM_FUZZER_BUMP(contracts, tx_data.contract_addresses.size());

    size_t total_cfg_instructions = 0;
    for (const auto& program : tx_data.input_programs) {
        total_cfg_instructions += program.cfg_instructions.size();
    }
    AVM_FUZZER_BUMP(cfg_instructions, log2_bucket(total_cfg_instructions));

    size_t total_bytecode_size = 0;
    for (const auto& contract_class : tx_data.contract_classes) {
        total_bytecode_size += contract_class.packed_bytecode.size();
    }
    AVM_FUZZER_BUMP(bytecode_size, log2_bucket(total_bytecode_size));

    executions++;
    if (stats_enabled() && executions % stats_interval() == 0) {
        dump_fuzzer_stats();
    }
}

void record_unprovable_tx(UnprovableTxCause cause)
{
    AVM_FUZZER_BUMP(unprovable_tx, static_cast<size_t>(cause));
}

void record_tx_result(const TxSimulationResult& result, const Gas& gas_limits)
{
    AVM_FUZZER_BUMP(revert_code, static_cast<size_t>(result.revert_code));
    AVM_FUZZER_BUMP(l2_gas_ratio, gas_ratio_bucket(result.gas_used.total_gas.l2_gas, gas_limits.l2_gas));
    AVM_FUZZER_BUMP(da_gas_ratio, gas_ratio_bucket(result.gas_used.total_gas.da_gas, gas_limits.da_gas));

    CallTreeShape shape;
    walk_call_tree(result.call_stack_metadata, 0, shape);
    AVM_FUZZER_BUMP(max_call_depth, shape.max_depth);
    AVM_FUZZER_BUMP(nested_calls, log2_bucket(shape.total_nested));
    AVM_FUZZER_BUMP(reverted_calls, log2_bucket(shape.reverted));

    record_tx_effect(result.public_tx_effect);
}

void dump_fuzzer_stats()
{
    constexpr std::array HISTOGRAMS = {
        AVM_FUZZER_HISTOGRAM(setup_calls),      AVM_FUZZER_HISTOGRAM(app_logic_calls),
        AVM_FUZZER_HISTOGRAM(teardown_call),    AVM_FUZZER_HISTOGRAM(contracts),
        AVM_FUZZER_HISTOGRAM(cfg_instructions), AVM_FUZZER_HISTOGRAM(bytecode_size),
        AVM_FUZZER_HISTOGRAM(revert_code),      AVM_FUZZER_HISTOGRAM(unprovable_tx),
        AVM_FUZZER_HISTOGRAM(l2_gas_ratio),     AVM_FUZZER_HISTOGRAM(da_gas_ratio),
        AVM_FUZZER_HISTOGRAM(max_call_depth),   AVM_FUZZER_HISTOGRAM(nested_calls),
        AVM_FUZZER_HISTOGRAM(reverted_calls),   AVM_FUZZER_HISTOGRAM(public_data_writes),
        AVM_FUZZER_HISTOGRAM(note_hashes),      AVM_FUZZER_HISTOGRAM(nullifiers),
        AVM_FUZZER_HISTOGRAM(l2_to_l1_msgs),    AVM_FUZZER_HISTOGRAM(public_logs),
    };

    info("=== AVM fuzzer stats after ", executions, " executions ===");
    info("gas ratio buckets: 0-15 are sixteenths of the limit, ",
         GAS_RATIO_EXHAUSTED_BUCKET,
         " is all gas consumed (exceptional halt), ",
         GAS_RATIO_NO_LIMIT_BUCKET,
         " is no limit set");
    info("log2 buckets: 0 is none, n is [2^(n-1), 2^n)");
    info("unprovable_tx buckets: 0 is a tx execution failure, 1 is a nullifier collision");
    for (const auto& histogram : HISTOGRAMS) {
        dump_histogram(histogram);
    }
}

} // namespace bb::avm2::fuzzer
