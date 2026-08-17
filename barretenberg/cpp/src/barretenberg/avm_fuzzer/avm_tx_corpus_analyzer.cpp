/**
 * @file avm_tx_corpus_analyzer.cpp
 * @brief Analyzes the AVM fuzzer corpus to produce statistics on opcodes and enqueued calls.
 *
 * Usage: ./avm_tx_corpus_analyzer [corpus_path]
 *   corpus_path: Path to the corpus directory (default: corpus/tx relative to current dir)
 */

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <vector>

namespace fs = std::filesystem;
using namespace bb::avm2;
using namespace bb::avm2::fuzzer;

// Statistics structure for a distribution
struct Stats {
    double mean = 0.0;
    double median = 0.0;
    double p95 = 0.0;
    size_t mode = 0;
    size_t maximum = 0;
    std::map<size_t, size_t> histogram; // value -> count
};

double percentile(const std::vector<size_t>& values, double percentile_value)
{
    if (values.empty()) {
        return 0.0;
    }

    std::vector<size_t> sorted = values;
    std::sort(sorted.begin(), sorted.end());
    size_t index = static_cast<size_t>(std::ceil(percentile_value * static_cast<double>(sorted.size()))) - 1;
    return static_cast<double>(sorted[std::min(index, sorted.size() - 1)]);
}

// Compute mean, median, mode and histogram from a vector of values
Stats compute_stats(const std::vector<size_t>& values)
{
    Stats stats;

    if (values.empty()) {
        return stats;
    }

    // Histogram
    for (size_t v : values) {
        stats.histogram[v]++;
    }

    // Mean
    double sum = std::accumulate(values.begin(), values.end(), 0.0);
    stats.mean = sum / static_cast<double>(values.size());

    // Median
    std::vector<size_t> sorted = values;
    std::sort(sorted.begin(), sorted.end());
    size_t n = sorted.size();
    if (n % 2 == 0) {
        stats.median = (static_cast<double>(sorted[n / 2 - 1]) + static_cast<double>(sorted[n / 2])) / 2.0;
    } else {
        stats.median = static_cast<double>(sorted[n / 2]);
    }
    stats.p95 = percentile(values, 0.95);
    stats.maximum = sorted.back();

    // Mode (value with highest count)
    size_t max_count = 0;
    for (const auto& [value, count] : stats.histogram) {
        if (count > max_count) {
            max_count = count;
            stats.mode = value;
        }
    }

    return stats;
}

// Count opcodes in bytecode. Returns false if the bytecode cannot be fully decoded.
bool count_opcodes(const std::vector<uint8_t>& bytecode, std::map<WireOpCode, size_t>& opcode_counts)
{
    size_t pos = 0;
    std::map<WireOpCode, size_t> decoded_opcode_counts;
    while (pos < bytecode.size()) {
        try {
            auto instruction = simulation::deserialize_instruction(bytecode, pos);
            decoded_opcode_counts[instruction.opcode]++;
            pos += instruction.size_in_bytes();
        } catch (const std::exception&) {
            return false;
        }
    }

    for (const auto& [opcode, count] : decoded_opcode_counts) {
        opcode_counts[opcode] += count;
    }
    return true;
}

// Get opcode name as string
std::string opcode_name(WireOpCode opcode)
{
    std::ostringstream oss;
    oss << opcode;
    return oss.str();
}

// Print a visual histogram bar
std::string histogram_bar(size_t count, size_t max_count, size_t max_width = 40)
{
    if (max_count == 0) {
        return "";
    }
    size_t bar_len = static_cast<size_t>(
        std::round(static_cast<double>(count) / static_cast<double>(max_count) * static_cast<double>(max_width)));
    return std::string(bar_len, '#');
}

// Print opcode histogram
void print_opcode_histogram(const std::map<WireOpCode, size_t>& opcode_counts,
                            const std::map<WireOpCode, size_t>& opcode_program_presence,
                            size_t built_input_programs)
{
    std::cout << "\n=== Opcode Histogram ===\n";

    if (opcode_counts.empty()) {
        std::cout << "No opcodes found.\n";
        return;
    }

    // Find max count for scaling bars
    size_t max_count = 0;
    size_t total_instructions = 0;
    for (const auto& [opcode, count] : opcode_counts) {
        max_count = std::max(max_count, count);
        total_instructions += count;
    }

    // Find max opcode name length for alignment
    size_t max_name_len = 0;
    for (const auto& [opcode, count] : opcode_counts) {
        max_name_len = std::max(max_name_len, opcode_name(opcode).length());
    }

    // Sort by count (descending)
    std::vector<std::pair<WireOpCode, size_t>> sorted_counts(opcode_counts.begin(), opcode_counts.end());
    std::sort(
        sorted_counts.begin(), sorted_counts.end(), [](const auto& a, const auto& b) { return a.second > b.second; });

    for (const auto& [opcode, count] : sorted_counts) {
        std::cout << std::setw(static_cast<int>(max_name_len)) << std::left << opcode_name(opcode) << ": "
                  << std::setw(8) << std::right << count << "  " << histogram_bar(count, max_count) << "\n";
    }

    // Summary stats
    std::cout << "\n=== Opcode Statistics ===\n";
    std::cout << "Total instructions: " << total_instructions << "\n";

    size_t total_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    std::cout << "Unique opcodes used: " << opcode_counts.size() << "/" << total_opcodes << "\n";

    // Find and display missing opcodes
    std::vector<WireOpCode> missing_opcodes;
    for (size_t i = 0; i < total_opcodes; i++) {
        auto opcode = static_cast<WireOpCode>(i);
        if (opcode_counts.find(opcode) == opcode_counts.end()) {
            missing_opcodes.push_back(opcode);
        }
    }

    if (!missing_opcodes.empty()) {
        std::cout << "Missing opcodes (" << missing_opcodes.size() << "): ";
        for (size_t i = 0; i < missing_opcodes.size(); i++) {
            if (i > 0) {
                std::cout << ", ";
            }
            std::cout << opcode_name(missing_opcodes[i]);
        }
        std::cout << "\n";
    }

    if (!sorted_counts.empty()) {
        std::cout << "Most common: " << opcode_name(sorted_counts.front().first) << " (" << sorted_counts.front().second
                  << ")\n";
        std::cout << "Least common: " << opcode_name(sorted_counts.back().first) << " (" << sorted_counts.back().second
                  << ")\n";
    }

    double coverage = total_opcodes == 0
                          ? 0.0
                          : 100.0 * static_cast<double>(opcode_counts.size()) / static_cast<double>(total_opcodes);
    std::cout << "Opcode coverage: " << opcode_counts.size() << "/" << total_opcodes << " (" << std::fixed
              << std::setprecision(2) << coverage << "%)\n";

    size_t top_five_instructions = 0;
    for (size_t i = 0; i < std::min<size_t>(5, sorted_counts.size()); i++) {
        top_five_instructions += sorted_counts[i].second;
    }
    double top_five_share = total_instructions == 0 ? 0.0
                                                    : 100.0 * static_cast<double>(top_five_instructions) /
                                                          static_cast<double>(total_instructions);
    std::cout << "Top-5 instruction share: " << std::fixed << std::setprecision(2) << top_five_share << "%\n";

    std::cout << "Opcode presence across built programs:\n";
    for (const auto& [opcode, count] : sorted_counts) {
        double presence = built_input_programs == 0 ? 0.0
                                                    : 100.0 * static_cast<double>(opcode_program_presence.at(opcode)) /
                                                          static_cast<double>(built_input_programs);
        std::cout << "  " << opcode_name(opcode) << ": " << opcode_program_presence.at(opcode) << "/"
                  << built_input_programs << " (" << std::fixed << std::setprecision(2) << presence << "%)\n";
    }
}

void print_distribution(const std::string& name, const std::vector<size_t>& values)
{
    Stats stats = compute_stats(values);
    size_t maximum = values.empty() ? 0 : *std::max_element(values.begin(), values.end());
    std::cout << name << ": count=" << values.size() << ", mean=" << std::fixed << std::setprecision(2) << stats.mean
              << ", median=" << stats.median << ", p95=" << percentile(values, 0.95) << ", max=" << maximum << "\n";
}

void print_input_program_stats(const std::vector<size_t>& input_programs_per_tx,
                               const std::vector<size_t>& bytecode_sizes,
                               size_t built_input_programs,
                               size_t bytecode_parse_failures)
{
    std::cout << "\n=== Input Program Statistics ===\n";
    print_distribution("Input programs per transaction", input_programs_per_tx);
    print_distribution("Bytecode bytes per built program", bytecode_sizes);
    std::cout << "Built input programs: " << built_input_programs << "\n";
    std::cout << "Bytecode parse failures: " << bytecode_parse_failures << "\n";
}

// Structure to track multi-phase transaction statistics
struct MultiPhaseStats {
    size_t txs_with_no_calls = 0;
    size_t txs_with_setup_only = 0;
    size_t txs_with_app_logic_only = 0;
    size_t txs_with_teardown_only = 0;
    size_t txs_with_setup_and_app_logic = 0;
    size_t txs_with_setup_and_teardown = 0;
    size_t txs_with_app_logic_and_teardown = 0;
    size_t txs_with_all_three_phases = 0;
    size_t txs_with_multiple_phases = 0; // Any combination of 2+ phases
};

// Print enqueued calls statistics
void print_enqueued_calls_stats(const Stats& setup,
                                const Stats& app_logic,
                                const Stats& teardown,
                                const MultiPhaseStats& multi_phase,
                                size_t transaction_count,
                                size_t total_setup_calls,
                                size_t total_app_logic_calls,
                                size_t total_teardown_calls)
{
    std::cout << "\n=== Enqueued Calls Statistics ===\n";

    auto print_stats = [](const std::string& name, const Stats& s) {
        std::cout << "\n" << name << ":\n";
        std::cout << "  Mean: " << std::fixed << std::setprecision(2) << s.mean << ", Median: " << s.median
                  << ", p95: " << s.p95 << ", Mode: " << s.mode << ", Max: " << s.maximum << "\n";
        std::cout << "  Histogram: ";
        for (const auto& [value, count] : s.histogram) {
            std::cout << value << "(" << count << ") ";
        }
        std::cout << "\n";
    };

    print_stats("Setup Calls", setup);
    print_stats("App Logic Calls", app_logic);
    print_stats("Teardown Calls", teardown);

    std::cout << "\nPhase Presence:\n";
    auto print_presence = [transaction_count](const std::string& name, size_t count) {
        double percentage =
            transaction_count == 0 ? 0.0 : 100.0 * static_cast<double>(count) / static_cast<double>(transaction_count);
        std::cout << "  " << name << ": " << count << "/" << transaction_count << " (" << std::fixed
                  << std::setprecision(2) << percentage << "%)\n";
    };
    print_presence("Setup",
                   multi_phase.txs_with_setup_only + multi_phase.txs_with_setup_and_app_logic +
                       multi_phase.txs_with_setup_and_teardown + multi_phase.txs_with_all_three_phases);
    print_presence("App logic",
                   multi_phase.txs_with_app_logic_only + multi_phase.txs_with_setup_and_app_logic +
                       multi_phase.txs_with_app_logic_and_teardown + multi_phase.txs_with_all_three_phases);
    print_presence("Teardown",
                   multi_phase.txs_with_teardown_only + multi_phase.txs_with_setup_and_teardown +
                       multi_phase.txs_with_app_logic_and_teardown + multi_phase.txs_with_all_three_phases);
    std::cout << "Total calls: setup=" << total_setup_calls << ", app_logic=" << total_app_logic_calls
              << ", teardown=" << total_teardown_calls << "\n";
    std::cout << "\nMulti-Phase Transactions:\n";
    std::cout << "  Txs with no calls: " << multi_phase.txs_with_no_calls << "\n";
    std::cout << "  Txs with setup only: " << multi_phase.txs_with_setup_only << "\n";
    std::cout << "  Txs with app_logic only: " << multi_phase.txs_with_app_logic_only << "\n";
    std::cout << "  Txs with teardown only: " << multi_phase.txs_with_teardown_only << "\n";
    std::cout << "  Txs with calls in multiple phases: " << multi_phase.txs_with_multiple_phases << "\n";
    std::cout << "  Txs with setup + app_logic only: " << multi_phase.txs_with_setup_and_app_logic << "\n";
    std::cout << "  Txs with setup + teardown only: " << multi_phase.txs_with_setup_and_teardown << "\n";
    std::cout << "  Txs with app_logic + teardown only: " << multi_phase.txs_with_app_logic_and_teardown << "\n";
    std::cout << "  Txs with all three phases: " << multi_phase.txs_with_all_three_phases << "\n";
}

int main(int argc, char** argv)
{
    // Default corpus path (relative to where we run from)
    std::string corpus_dir = "corpus/tx";
    if (argc > 1) {
        corpus_dir = argv[1];
    }

    // Check if corpus directory exists
    if (!fs::exists(corpus_dir)) {
        std::cerr << "Error: Corpus directory does not exist: " << corpus_dir << "\n";
        return 1;
    }

    if (!fs::is_directory(corpus_dir)) {
        std::cerr << "Error: Not a directory: " << corpus_dir << "\n";
        return 1;
    }

    std::cout << "=== AVM Fuzzer Corpus Analysis ===\n";
    std::cout << "Corpus directory: " << corpus_dir << "\n";

    // Statistics accumulators
    std::map<WireOpCode, size_t> total_opcode_counts;
    std::map<WireOpCode, size_t> opcode_program_presence;
    std::vector<size_t> setup_call_counts;
    std::vector<size_t> app_logic_call_counts;
    std::vector<size_t> teardown_call_counts;
    std::vector<size_t> input_programs_per_tx;
    std::vector<size_t> bytecode_sizes;
    MultiPhaseStats multi_phase_stats;
    size_t files_seen = 0;
    size_t files_processed = 0;
    size_t files_failed = 0;
    size_t total_input_programs = 0;
    size_t built_input_programs = 0;
    size_t bytecode_parse_failures = 0;
    // Bytecode is only built by the fuzzer's custom mutator, so a program that fails to build kills
    // the fuzzer with a crash artifact that does not reproduce: the artifact is the input the mutator
    // was handed, and running a single input never builds anything. Reporting them here is what makes
    // such a failure diagnosable from a corpus.
    std::vector<std::pair<std::string, std::string>> programs_that_failed_to_build;

    // Iterate over all files in the corpus directory
    for (const auto& entry : fs::directory_iterator(corpus_dir)) {
        if (!entry.is_regular_file()) {
            continue;
        }
        files_seen++;

        const auto& path = entry.path();

        // Read file contents
        std::ifstream file(path, std::ios::binary);
        if (!file) {
            files_failed++;
            continue;
        }

        std::vector<uint8_t> buffer((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        file.close();

        // Deserialize FuzzerTxData
        FuzzerTxData tx_data;
        try {
            msgpack::unpack(reinterpret_cast<const char*>(buffer.data()), buffer.size()).get().convert(tx_data);
        } catch (const std::exception& e) {
            files_failed++;
            continue;
        }

        files_processed++;
        input_programs_per_tx.push_back(tx_data.input_programs.size());

        // Count enqueued calls
        size_t setup_count = tx_data.tx.setup_enqueued_calls.size();
        size_t app_logic_count = tx_data.tx.app_logic_enqueued_calls.size();
        size_t teardown_count = tx_data.tx.teardown_enqueued_call.has_value() ? 1 : 0;

        setup_call_counts.push_back(setup_count);
        app_logic_call_counts.push_back(app_logic_count);
        teardown_call_counts.push_back(teardown_count);

        // Track multi-phase statistics
        bool has_setup = setup_count > 0;
        bool has_app_logic = app_logic_count > 0;
        bool has_teardown = teardown_count > 0;
        int phases_with_calls = (has_setup ? 1 : 0) + (has_app_logic ? 1 : 0) + (has_teardown ? 1 : 0);

        if (phases_with_calls == 0) {
            multi_phase_stats.txs_with_no_calls++;
        } else if (phases_with_calls == 1 && has_setup) {
            multi_phase_stats.txs_with_setup_only++;
        } else if (phases_with_calls == 1 && has_app_logic) {
            multi_phase_stats.txs_with_app_logic_only++;
        } else if (phases_with_calls == 1 && has_teardown) {
            multi_phase_stats.txs_with_teardown_only++;
        }
        if (phases_with_calls >= 2) {
            multi_phase_stats.txs_with_multiple_phases++;
        }
        if (has_setup && has_app_logic && !has_teardown) {
            multi_phase_stats.txs_with_setup_and_app_logic++;
        }
        if (has_setup && has_teardown && !has_app_logic) {
            multi_phase_stats.txs_with_setup_and_teardown++;
        }
        if (has_app_logic && has_teardown && !has_setup) {
            multi_phase_stats.txs_with_app_logic_and_teardown++;
        }
        if (has_setup && has_app_logic && has_teardown) {
            multi_phase_stats.txs_with_all_three_phases++;
        }

        // Process each input program and build bytecode
        for (auto& fuzzer_data : tx_data.input_programs) {
            total_input_programs++;

            try {
                // Build bytecode using ControlFlow
                ControlFlow control_flow(fuzzer_data.instruction_blocks);
                for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
                    control_flow.process_cfg_instruction(cfg_instruction);
                }
                auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);

                std::map<WireOpCode, size_t> program_opcode_counts;
                if (!count_opcodes(bytecode, program_opcode_counts)) {
                    bytecode_parse_failures++;
                    continue;
                }
                built_input_programs++;
                bytecode_sizes.push_back(bytecode.size());
                for (const auto& [opcode, count] : program_opcode_counts) {
                    total_opcode_counts[opcode] += count;
                    opcode_program_presence[opcode]++;
                }
            } catch (const std::exception& e) {
                programs_that_failed_to_build.emplace_back(path.filename().string(), e.what());
                continue;
            }
        }
    }

    // Print summary
    auto print_rate = [](const std::string& name, size_t numerator, size_t denominator) {
        double percentage =
            denominator == 0 ? 0.0 : 100.0 * static_cast<double>(numerator) / static_cast<double>(denominator);
        std::cout << name << ": " << numerator << "/" << denominator << " (" << std::fixed << std::setprecision(2)
                  << percentage << "%)\n";
    };

    std::cout << "\n";
    print_rate("Files processed", files_processed, files_seen);
    print_rate("Files failed", files_failed, files_seen);
    std::cout << "Total input programs: " << total_input_programs << "\n";
    print_rate("Programs built", built_input_programs, total_input_programs);
    print_rate("Programs that failed to build", programs_that_failed_to_build.size(), total_input_programs);
    print_rate("Programs with bytecode parse failures", bytecode_parse_failures, total_input_programs);
    for (const auto& [filename, error] : programs_that_failed_to_build) {
        std::cout << "  " << filename << ": " << error << "\n";
    }

    // Print opcode histogram
    print_opcode_histogram(total_opcode_counts, opcode_program_presence, built_input_programs);

    print_input_program_stats(input_programs_per_tx, bytecode_sizes, built_input_programs, bytecode_parse_failures);

    // Print enqueued calls statistics
    Stats setup_stats = compute_stats(setup_call_counts);
    Stats app_logic_stats = compute_stats(app_logic_call_counts);
    Stats teardown_stats = compute_stats(teardown_call_counts);
    print_enqueued_calls_stats(setup_stats,
                               app_logic_stats,
                               teardown_stats,
                               multi_phase_stats,
                               files_processed,
                               std::accumulate(setup_call_counts.begin(), setup_call_counts.end(), size_t(0)),
                               std::accumulate(app_logic_call_counts.begin(), app_logic_call_counts.end(), size_t(0)),
                               std::accumulate(teardown_call_counts.begin(), teardown_call_counts.end(), size_t(0)));

    return 0;
}
