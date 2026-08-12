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
    size_t mode = 0;
    std::map<size_t, size_t> histogram; // value -> count
};

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

// Count opcodes in bytecode
void count_opcodes(const std::vector<uint8_t>& bytecode, std::map<WireOpCode, size_t>& opcode_counts)
{
    size_t pos = 0;
    while (pos < bytecode.size()) {
        try {
            auto instruction = simulation::deserialize_instruction(bytecode, pos);
            opcode_counts[instruction.opcode]++;
            pos += instruction.size_in_bytes();
        } catch (const std::exception&) {
            // Invalid bytecode, stop parsing
            break;
        }
    }
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
void print_opcode_histogram(const std::map<WireOpCode, size_t>& opcode_counts)
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
}

// Structure to track multi-phase transaction statistics
struct MultiPhaseStats {
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
                                const MultiPhaseStats& multi_phase)
{
    std::cout << "\n=== Enqueued Calls Statistics ===\n";

    auto print_stats = [](const std::string& name, const Stats& s) {
        std::cout << "\n" << name << ":\n";
        std::cout << "  Mean: " << std::fixed << std::setprecision(2) << s.mean << ", Median: " << s.median
                  << ", Mode: " << s.mode << "\n";
        std::cout << "  Histogram: ";
        for (const auto& [value, count] : s.histogram) {
            std::cout << value << "(" << count << ") ";
        }
        std::cout << "\n";
    };

    print_stats("Setup Calls", setup);
    print_stats("App Logic Calls", app_logic);
    print_stats("Teardown Calls", teardown);

    std::cout << "\nMulti-Phase Transactions:\n";
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
    std::vector<size_t> setup_call_counts;
    std::vector<size_t> app_logic_call_counts;
    std::vector<size_t> teardown_call_counts;
    MultiPhaseStats multi_phase_stats;
    size_t files_processed = 0;
    size_t files_failed = 0;
    size_t total_input_programs = 0;
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

                // Count opcodes in the bytecode
                count_opcodes(bytecode, total_opcode_counts);
            } catch (const std::exception& e) {
                programs_that_failed_to_build.emplace_back(path.filename().string(), e.what());
                continue;
            }
        }
    }

    // Print summary
    std::cout << "\nFiles processed: " << files_processed << "\n";
    std::cout << "Files failed: " << files_failed << "\n";
    std::cout << "Total input programs: " << total_input_programs << "\n";
    std::cout << "Programs that failed to build: " << programs_that_failed_to_build.size() << "\n";
    for (const auto& [filename, error] : programs_that_failed_to_build) {
        std::cout << "  " << filename << ": " << error << "\n";
    }

    // Print opcode histogram
    print_opcode_histogram(total_opcode_counts);

    // Print enqueued calls statistics
    Stats setup_stats = compute_stats(setup_call_counts);
    Stats app_logic_stats = compute_stats(app_logic_call_counts);
    Stats teardown_stats = compute_stats(teardown_call_counts);
    print_enqueued_calls_stats(setup_stats, app_logic_stats, teardown_stats, multi_phase_stats);

    return 0;
}
