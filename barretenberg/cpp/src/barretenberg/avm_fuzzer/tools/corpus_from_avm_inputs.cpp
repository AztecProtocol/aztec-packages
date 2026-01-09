/**
 * corpus_from_avm_inputs - Convert AvmCircuitInputs msgpack to FuzzerTxData corpus
 *
 * Usage: corpus_from_avm_inputs <input.bin> <corpus_dir> [--verbose] [--dry-run]
 *
 * This tool reads msgpack binary files produced by DumpingCppPublicTxSimulator
 * and converts them to FuzzerTxData format for the tx.fuzzer corpus.
 *
 * The input file contains AvmCircuitInputs (AvmExecutionHints + AvmCircuitPublicInputs).
 * We extract ExecutionHints and convert:
 *   - contract_classes → ContractClass + decompile bytecode to FuzzerData
 *   - contract_instances → ContractInstance + extract addresses
 *   - tx, global_variables, protocol_contracts → direct copy
 */

#include "barretenberg/avm_fuzzer/fuzz_lib/bytecode_decompiler.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <vector>

using namespace bb::avm2;

namespace {

/**
 * Read entire file into a byte vector
 */
std::vector<uint8_t> read_file(const std::string& path)
{
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) {
        throw std::runtime_error("Cannot open file: " + path);
    }

    auto size = file.tellg();
    file.seekg(0, std::ios::beg);

    std::vector<uint8_t> data(static_cast<size_t>(size));
    if (!file.read(reinterpret_cast<char*>(data.data()), size)) {
        throw std::runtime_error("Failed to read file: " + path);
    }

    return data;
}

/**
 * Convert bytes to hex string (for filename generation)
 */
std::string bytes_to_hex(const std::vector<uint8_t>& bytes)
{
    std::ostringstream ss;
    for (auto byte : bytes) {
        ss << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(byte);
    }
    return ss.str();
}

/**
 * Convert PublicKeysHint to PublicKeys
 */
PublicKeys to_public_keys(const PublicKeysHint& hint)
{
    return PublicKeys{
        .nullifier_key = hint.master_nullifier_public_key,
        .incoming_viewing_key = hint.master_incoming_viewing_public_key,
        .outgoing_viewing_key = hint.master_outgoing_viewing_public_key,
        .tagging_key = hint.master_tagging_public_key,
    };
}

/**
 * Convert ContractClassHint to ContractClass
 */
ContractClass to_contract_class(const ContractClassHint& hint)
{
    return ContractClass{
        .id = hint.class_id,
        .artifact_hash = hint.artifact_hash,
        .private_functions_root = hint.private_functions_root,
        .packed_bytecode = hint.packed_bytecode,
    };
}

/**
 * Convert ContractInstanceHint to ContractInstance
 */
ContractInstance to_contract_instance(const ContractInstanceHint& hint)
{
    return ContractInstance{
        .salt = hint.salt,
        .deployer = hint.deployer,
        .current_contract_class_id = hint.current_contract_class_id,
        .original_contract_class_id = hint.original_contract_class_id,
        .initialization_hash = hint.initialization_hash,
        .public_keys = to_public_keys(hint.public_keys),
    };
}

/**
 * Rebuild bytecode from FuzzerData to verify roundtrip fidelity.
 * Returns the recompiled bytecode.
 */
std::vector<uint8_t> rebuild_bytecode(const FuzzerData& data)
{
    // Make a mutable copy since ControlFlow modifies the blocks
    auto instruction_blocks = data.instruction_blocks;
    ControlFlow control_flow(instruction_blocks);
    for (const auto& cfg_instr : data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instr);
    }
    return control_flow.build_bytecode(data.return_options);
}

/**
 * Find the instruction at a given byte offset in the bytecode.
 * Returns the instruction and its starting offset, or nullopt if not found.
 */
std::optional<std::pair<simulation::Instruction, size_t>> find_instruction_at_offset(
    const std::vector<uint8_t>& bytecode, size_t target_offset)
{
    size_t pos = 0;
    while (pos < bytecode.size()) {
        try {
            auto instr = simulation::deserialize_instruction(bytecode, pos);
            size_t instr_size = instr.size_in_bytes();
            if (target_offset >= pos && target_offset < pos + instr_size) {
                return std::make_pair(instr, pos);
            }
            pos += instr_size;
        } catch (...) {
            break;
        }
    }
    return std::nullopt;
}

/**
 * Verify that decompiled FuzzerData produces identical bytecode when recompiled.
 * Returns true if bytecode matches, false otherwise.
 */
bool verify_bytecode_roundtrip(const std::vector<uint8_t>& original_bytecode,
                               const FuzzerData& fuzzer_data,
                               bool verbose)
{
    try {
        auto rebuilt = rebuild_bytecode(fuzzer_data);

        if (rebuilt.size() != original_bytecode.size()) {
            if (verbose) {
                std::cerr << "    ROUNDTRIP FAILED: size mismatch (original=" << original_bytecode.size()
                          << ", rebuilt=" << rebuilt.size() << ")\n";
            }
            return false;
        }

        for (size_t i = 0; i < original_bytecode.size(); i++) {
            if (original_bytecode[i] != rebuilt[i]) {
                if (verbose) {
                    std::cerr << "    ROUNDTRIP FAILED: byte mismatch at offset " << i << " (original=0x" << std::hex
                              << static_cast<int>(original_bytecode[i]) << ", rebuilt=0x"
                              << static_cast<int>(rebuilt[i]) << std::dec << ")\n";

                    // Find and print the instruction at this offset
                    auto instr_info = find_instruction_at_offset(original_bytecode, i);
                    if (instr_info.has_value()) {
                        auto& [instr, instr_start] = instr_info.value();
                        std::cerr << "    Instruction at offset " << instr_start << ": " << instr.to_string() << "\n";
                        std::cerr << "    (mismatch is at byte " << (i - instr_start) << " within instruction)\n";
                    }

                    // Print context: bytes around the mismatch
                    size_t start = (i >= 8) ? (i - 8) : 0;
                    size_t end = std::min(i + 16, original_bytecode.size());
                    std::cerr << "    Context (offsets " << start << "-" << end << "):\n";
                    std::cerr << "      Original: ";
                    for (size_t j = start; j < end; j++) {
                        if (j == i) {
                            std::cerr << "[";
                        }
                        std::cerr << std::hex << std::setfill('0') << std::setw(2)
                                  << static_cast<int>(original_bytecode[j]);
                        if (j == i) {
                            std::cerr << "]";
                        }
                        std::cerr << " ";
                    }
                    std::cerr << std::dec << "\n";
                    std::cerr << "      Rebuilt:  ";
                    for (size_t j = start; j < end; j++) {
                        if (j == i) {
                            std::cerr << "[";
                        }
                        std::cerr << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(rebuilt[j]);
                        if (j == i) {
                            std::cerr << "]";
                        }
                        std::cerr << " ";
                    }
                    std::cerr << std::dec << "\n";
                }
                return false;
            }
        }

        return true;
    } catch (const std::exception& e) {
        if (verbose) {
            std::cerr << "    ROUNDTRIP FAILED: rebuild error - " << e.what() << "\n";
        }
        return false;
    }
}

void print_usage()
{
    std::cerr << "Usage: corpus_from_avm_inputs <input.bin> <corpus_dir> [--verbose] [--dry-run]\n\n"
              << "  input.bin    - Msgpack AvmCircuitInputs file from DumpingCppPublicTxSimulator\n"
              << "  corpus_dir   - Directory to write FuzzerTxData corpus entry\n\n"
              << "Options:\n"
              << "  --verbose    - Print conversion details\n"
              << "  --dry-run    - Parse and validate without writing\n";
}

} // namespace

int main(int argc, char** argv)
{
    if (argc < 3) {
        print_usage();
        return 1;
    }

    std::string input_path = argv[1];
    std::string corpus_dir = argv[2];
    bool verbose = false;
    bool dry_run = false;

    // Parse optional flags
    for (int i = 3; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--verbose" || arg == "-v") {
            verbose = true;
        } else if (arg == "--dry-run" || arg == "-n") {
            dry_run = true;
        } else {
            std::cerr << "Unknown option: " << arg << "\n";
            print_usage();
            return 1;
        }
    }

    // 1. Read msgpack binary
    std::vector<uint8_t> data;
    try {
        data = read_file(input_path);
        if (verbose) {
            std::cout << "Read " << data.size() << " bytes from " << input_path << "\n";
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }

    // 2. Parse as AvmProvingInputs
    AvmProvingInputs inputs;
    try {
        inputs = AvmProvingInputs::from(data);
        if (verbose) {
            std::cout << "Parsed AvmProvingInputs successfully\n";
        }
    } catch (const std::exception& e) {
        std::cerr << "Error parsing AvmProvingInputs: " << e.what() << "\n";
        return 1;
    }

    const auto& hints = inputs.hints;

    // 3. Build FuzzerTxData
    FuzzerTxData tx_data;

    // 3a. Convert contract classes and decompile bytecode
    if (verbose) {
        std::cout << "Processing " << hints.contract_classes.size() << " contract classes...\n";
    }

    for (const auto& cc_hint : hints.contract_classes) {
        // Convert to ContractClass
        tx_data.contract_classes.push_back(to_contract_class(cc_hint));

        // Decompile bytecode to FuzzerData
        if (!cc_hint.packed_bytecode.empty()) {
            bool decompile_success = false;
            try {
                FuzzerData fuzzer_data = bb::avm_fuzzer::decompile_bytecode(cc_hint.packed_bytecode, {});

                // Verify roundtrip: recompiled bytecode must match original
                if (!verify_bytecode_roundtrip(cc_hint.packed_bytecode, fuzzer_data, verbose)) {
                    std::cerr << "WARNING: Class " << cc_hint.class_id << ": bytecode roundtrip verification failed!\n"
                              << "         This will cause contract address mismatch at runtime.\n";
                    // Still add the FuzzerData, but warn the user
                }

                tx_data.input_programs.push_back(std::move(fuzzer_data));
                decompile_success = true;

                if (verbose) {
                    size_t instr_count = 0;
                    for (const auto& block : tx_data.input_programs.back().instruction_blocks) {
                        instr_count += block.size();
                    }
                    std::cout << "  Class " << cc_hint.class_id << ": " << instr_count << " instructions from "
                              << cc_hint.packed_bytecode.size() << " bytes (roundtrip OK)\n";
                }
            } catch (const std::exception& e) {
                if (verbose) {
                    // Print first 32 bytes of bytecode for debugging
                    std::cerr << "  Class " << cc_hint.class_id << ": decompile failed (" << e.what() << ")\n";
                    std::cerr << "    Bytecode (" << cc_hint.packed_bytecode.size() << " bytes): ";
                    size_t dump_len = std::min(cc_hint.packed_bytecode.size(), size_t(32));
                    for (size_t i = 0; i < dump_len; i++) {
                        std::cerr << std::hex << std::setfill('0') << std::setw(2)
                                  << static_cast<int>(cc_hint.packed_bytecode[i]) << " ";
                    }
                    if (cc_hint.packed_bytecode.size() > 32) {
                        std::cerr << "...";
                    }
                    std::cerr << std::dec << "\n";
                }
            } catch (...) {
                if (verbose) {
                    std::cerr << "  Class " << cc_hint.class_id << ": decompile failed (unknown error)"
                              << ", using empty FuzzerData\n";
                }
            }

            if (!decompile_success) {
                // Add empty FuzzerData as placeholder
                tx_data.input_programs.push_back(FuzzerData{});
            }
        } else {
            // Empty bytecode - add empty FuzzerData
            tx_data.input_programs.push_back(FuzzerData{});
            if (verbose) {
                std::cout << "  Class " << cc_hint.class_id << ": empty bytecode\n";
            }
        }
    }

    // 3b. Convert contract instances and extract addresses
    if (verbose) {
        std::cout << "Processing " << hints.contract_instances.size() << " contract instances...\n";
    }

    for (const auto& ci_hint : hints.contract_instances) {
        // Extract address
        tx_data.contract_addresses.push_back(ci_hint.address);

        // Convert to ContractInstance
        tx_data.contract_instances.push_back(to_contract_instance(ci_hint));

        if (verbose) {
            std::cout << "  Instance at " << ci_hint.address << " (class " << ci_hint.current_contract_class_id
                      << ")\n";
        }
    }

    // 3c. Copy shared types directly
    tx_data.tx = hints.tx;
    tx_data.global_variables = hints.global_variables;
    tx_data.protocol_contracts = hints.protocol_contracts;

    // 3d. Fix maxPriorityFeesPerGas to be consistent with effective_gas_fees
    // JS computes: effectiveFees = globals.gasFees + priorityFees
    // So: priorityFees = effectiveFees - globals.gasFees
    // This ensures C++ and JS compute the same fee when using the same tx data.
    const auto& effective = tx_data.tx.effective_gas_fees;
    const auto& globals = tx_data.global_variables.gas_fees;

    // Compute the priority fees needed to match effective_gas_fees
    uint128_t priority_da =
        (effective.fee_per_da_gas > globals.fee_per_da_gas) ? (effective.fee_per_da_gas - globals.fee_per_da_gas) : 0;
    uint128_t priority_l2 =
        (effective.fee_per_l2_gas > globals.fee_per_l2_gas) ? (effective.fee_per_l2_gas - globals.fee_per_l2_gas) : 0;

    tx_data.tx.gas_settings.max_priority_fees_per_gas = GasFees{
        .fee_per_da_gas = priority_da,
        .fee_per_l2_gas = priority_l2,
    };

    if (verbose) {
        std::cout << "  Fixed maxPriorityFeesPerGas: (" << priority_da << ", " << priority_l2 << ") "
                  << "to match effective_gas_fees: (" << effective.fee_per_da_gas << ", " << effective.fee_per_l2_gas
                  << ") with globals: (" << globals.fee_per_da_gas << ", " << globals.fee_per_l2_gas << ")\n";
    }

    if (verbose) {
        std::cout << "\nFuzzerTxData summary:\n"
                  << "  input_programs: " << tx_data.input_programs.size() << "\n"
                  << "  contract_classes: " << tx_data.contract_classes.size() << "\n"
                  << "  contract_instances: " << tx_data.contract_instances.size() << "\n"
                  << "  contract_addresses: " << tx_data.contract_addresses.size() << "\n"
                  << "  setup_enqueued_calls: " << tx_data.tx.setup_enqueued_calls.size() << "\n"
                  << "  app_logic_enqueued_calls: " << tx_data.tx.app_logic_enqueued_calls.size() << "\n";
    }

    if (dry_run) {
        std::cout << "Dry run - not writing output\n";
        return 0;
    }

    // 4. Serialize to msgpack
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, tx_data);

    // 5. Ensure corpus directory exists
    std::filesystem::create_directories(corpus_dir);

    // 6. Generate filename from content hash (first 16 bytes of SHA256)
    auto hash = bb::crypto::sha256(std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size()));
    std::string filename = bytes_to_hex(std::vector<uint8_t>(hash.begin(), hash.begin() + 16));
    std::string output_path = corpus_dir + "/" + filename;

    // 7. Write output
    std::ofstream output_file(output_path, std::ios::binary);
    if (!output_file) {
        std::cerr << "Error: Cannot write to " << output_path << "\n";
        return 1;
    }

    output_file.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    output_file.close();

    std::cout << "Written: " << output_path << " (" << buffer.size() << " bytes)\n";
    return 0;
}
