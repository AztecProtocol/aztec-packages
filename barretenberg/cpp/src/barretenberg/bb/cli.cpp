/**
 * @brief Entry point for Barretenberg command-line interface.
 *
 * This function encapsulates the CLI parsing and command execution logic that would
 * typically be in main.cpp, but as a standalone function. This design allows the CLI
 * functionality to be tested by other modules without having to execute the program
 * through its actual main() function.
 *
 * The function sets up all available commands and options, parses the provided arguments,
 * and executes the appropriate command based on the user's input. It handles all supported
 * operations including circuit checking, proving, verification, and various utility functions.
 *
 * @param argc The argument count
 * @param argv The argument values array
 * @return int Status code: 0 for success, non-zero for errors or verification failure
 */
#include "barretenberg/api/api_avm.hpp"
#include "barretenberg/api/api_client_ivc.hpp"
#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/api/api_ultra_honk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bb/cli11_formatter.hpp"
#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <fstream>
#include <iostream>

namespace bb {
// This is updated in-place by bootstrap.sh during the release process. This prevents
// the version string from needing to be present at build-time, simplifying e.g. caching.
const char* const BB_VERSION_PLACEHOLDER = "00000000.00000000.00000000";

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1257): Remove unused/seemingly unnecessary flags.
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1258): Improve defaults.

// Helper function to recursively print active subcommands for CLI11 app debugging
void print_active_subcommands(const CLI::App& app, const std::string& prefix = "bb command: ")
{
    // get_subcommands() returns a vector of pointers to subcommands
    for (auto* subcmd : app.get_subcommands()) {
        // Check if this subcommand was activated (nonzero count)
        if (subcmd->count() > 0) {
            vinfo(prefix, subcmd->get_name());
            // Recursively print any subcommands of this subcommand
            print_active_subcommands(*subcmd, prefix + "  ");
        }
    }
}

// Recursive helper to find the deepest parsed subcommand.
CLI::App* find_deepest_subcommand(CLI::App* app)
{
    for (auto& sub : app->get_subcommands()) {
        if (sub->parsed()) {
            // Check recursively if this subcommand has a deeper parsed subcommand.
            if (CLI::App* deeper = find_deepest_subcommand(sub); deeper != nullptr) {
                return deeper;
            }
            return sub;
        }
    }
    return nullptr;
}

// Helper function to print options for a given subcommand.
void print_subcommand_options(const CLI::App* sub)
{
    for (const auto& opt : sub->get_options()) {
        if (opt->count() > 0) { // Only print options that were set.
            if (opt->results().size() > 1) {
                vinfo("  Warning: the following option is called more than once");
            }
            vinfo("  ", opt->get_name(), ": ", opt->results()[0]);
        }
    }
}

/**
 * @brief Parse command line arguments and run the corresponding command.
 *
 * This function encapsulates the entire CLI parsing and command execution logic
 * that is used in the `main` function. It's designed as a standalone
 * function to support multiple entry points:
 *
 * 1. Used by main.cpp as the primary command-line interface for the `bb` executable
 * 2. Used by main.bench.cpp for benchmark testing with the same command structure
 *
 * The function utilizes CLI11 for argument parsing and creates a hierarchy of commands
 * and subcommands with appropriate options. This encapsulation allows the CLI
 * functionality to be tested and benchmarked without duplicating the command structure
 * across multiple files.
 *
 * @param argc Number of command-line arguments
 * @param argv Array of command-line argument strings
 * @return int Status code: 0 for success, non-zero for errors or verification failure
 */
int parse_and_run_cli_command(int argc, char* argv[])
{
    std::string name = "Barretenberg\nYour favo(u)rite zkSNARK library written in C++, a perfectly good computer "
                       "programming language.";

#ifdef DISABLE_AZTEC_VM
    name += "\nAztec Virtual Machine (AVM): disabled";
#else
    name += "\nAztec Virtual Machine (AVM): enabled";
#endif
#ifdef STARKNET_GARAGA_FLAVORS
    name += "\nStarknet Garaga Extensions: enabled";
#else
    name += "\nStarknet Garaga Extensions: disabled";
#endif
    CLI::App app{ name };
    argv = app.ensure_utf8(argv);
    app.formatter(std::make_shared<Formatter>());

    // If no arguments are provided, print help and exit.
    if (argc == 1) {
        std::cout << app.help() << std::endl;
        return 0;
    }

    // prevent two or more subcommands being executed
    app.require_subcommand(0, 1);

    API::Flags flags{};
    // Some paths, with defaults, that may or may not be set by commands
    std::filesystem::path bytecode_path{ "./target/program.json" };
    std::filesystem::path witness_path{ "./target/witness.gz" };
    std::filesystem::path ivc_inputs_path{ "./ivc-inputs.msgpack" };
    std::filesystem::path output_path{
        "./out"
    }; // sometimes a directory where things will be written, sometimes the path of a file to be written
    std::filesystem::path public_inputs_path{ "./target/public_inputs" };
    std::filesystem::path proof_path{ "./target/proof" };
    std::filesystem::path vk_path{ "./target/vk" };
    flags.scheme = "";
    flags.oracle_hash_type = "poseidon2";
    flags.crs_path = srs::bb_crs_path();
    flags.include_gates_per_opcode = false;
    const auto add_output_path_option = [&](CLI::App* subcommand, auto& _output_path) {
        return subcommand->add_option("--output_path, -o",
                                      _output_path,
                                      "Directory to write files or path of file to write, depending on subcommand.");
    };

    /***************************************************************************************************************
     * Subcommand: Adders for options that we will create for more than one subcommand
     ***************************************************************************************************************/

    const auto add_ipa_accumulation_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag(
            "--ipa_accumulation", flags.ipa_accumulation, "Accumulate/Aggregate IPA (Inner Product Argument) claims");
    };

    const auto add_scheme_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option(
                "--scheme, -s",
                flags.scheme,
                "The type of proof to be constructed. This can specify a proving system, an accumulation scheme, or a "
                "particular type of circuit to be constructed and proven for some implicit scheme.")
            ->envname("BB_SCHEME")
            ->default_val("ultra_honk")
            ->check(CLI::IsMember({ "client_ivc", "avm", "ultra_honk" }).name("is_member"));
    };

    const auto add_crs_path_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option("--crs_path, -c",
                         flags.crs_path,
                         "Path CRS directory. Missing CRS files will be retrieved from the internet.")
            ->check(CLI::ExistingDirectory);
    };

    const auto add_oracle_hash_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option(
                "--oracle_hash",
                flags.oracle_hash_type,
                "The hash function used by the prover as random oracle standing in for a verifier's challenge "
                "generation. Poseidon2 is to be used for proofs that are intended to be verified inside of a "
                "circuit. Keccak is optimized for verification in an Ethereum smart contract, where Keccak "
                "has a privileged position due to the existence of an EVM precompile. Starknet is optimized "
                "for verification in a Starknet smart contract, which can be generated using the Garaga library.")
            ->check(CLI::IsMember({ "poseidon2", "keccak", "starknet" }).name("is_member"));
    };

    const auto add_write_vk_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--write_vk", flags.write_vk, "Write the provided circuit's verification key");
    };

    const auto remove_zk_option = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--disable_zk",
                                    flags.disable_zk,
                                    "Use a non-zk version of --scheme. This flag is set to false by default.");
    };

    const auto add_bytecode_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--bytecode_path, -b", bytecode_path, "Path to ACIR bytecode generated by Noir.")
            /* ->check(CLI::ExistingFile) OR stdin indicator - */;
    };

    const auto add_witness_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--witness_path, -w", witness_path, "Path to partial witness generated by Noir.")
            /* ->check(CLI::ExistingFile) OR stdin indicator - */;
    };

    const auto add_ivc_inputs_path_options = [&](CLI::App* subcommand) {
        subcommand->add_option(
            "--ivc_inputs_path", ivc_inputs_path, "For IVC, path to input stack with bytecode and witnesses.")
            /* ->check(CLI::ExistingFile) OR stdin indicator - */;
    };

    const auto add_public_inputs_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option(
            "--public_inputs_path, -i", public_inputs_path, "Path to public inputs.") /* ->check(CLI::ExistingFile) */;
    };

    const auto add_proof_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option(
            "--proof_path, -p", proof_path, "Path to a proof.") /* ->check(CLI::ExistingFile) */;
    };

    const auto add_vk_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--vk_path, -k", vk_path, "Path to a verification key.")
            /* ->check(CLI::ExistingFile) */;
    };

    const auto add_verifier_type_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option("--verifier_type",
                         flags.verifier_type,
                         "Is a verification key for use a standalone single circuit verifier (e.g. a SNARK or folding "
                         "recursive verifier) or is it for an ivc verifier? `standalone` produces a verification key "
                         "is sufficient for verifying proofs about a single circuit (including the non-encsapsulated "
                         "use case where an IVC scheme is manually constructed via recursive UltraHonk proof "
                         "verification). `standalone_hiding` is similar to `standalone` but is used for the last step "
                         "where the structured trace is not utilized. `ivc` produces a verification key for verifying "
                         "the stack of run though a dedicated ivc verifier class (currently the only option is the "
                         "ClientIVC class)")
            ->check(CLI::IsMember({ "standalone", "standalone_hiding", "ivc" }).name("is_member"));
    };

    const auto add_verbose_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--verbose, --verbose_logging, -v", flags.verbose, "Output all logs to stderr.");
    };

    const auto add_debug_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--debug_logging, -d", flags.debug, "Output debug logs to stderr.");
    };

    const auto add_include_gates_per_opcode_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--include_gates_per_opcode",
                                    flags.include_gates_per_opcode,
                                    "Include gates_per_opcode in the output of the gates command.");
    };

    const auto add_slow_low_memory_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag(
            "--slow_low_memory", flags.slow_low_memory, "Enable low memory mode (can be 2x slower or more).");
    };

    const auto add_storage_budget_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--storage_budget",
                                      flags.storage_budget,
                                      "Storage budget for FileBackedMemory (e.g. '500m', '2g'). When exceeded, falls "
                                      "back to RAM (requires --slow_low_memory).");
    };

    const auto add_update_inputs_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--update_inputs", flags.update_inputs, "Update inputs if vk check fails.");
    };

    const auto add_optimized_solidity_verifier_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag(
            "--optimized", flags.optimized_solidity_verifier, "Use the optimized Solidity verifier.");
    };

    bool print_bench = false;
    const auto add_print_bench_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag(
            "--print_bench", print_bench, "Pretty print op counts to standard error in a human-readable format.");
    };

    std::string bench_out;
    const auto add_bench_out_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--bench_out", bench_out, "Path to write the op counts in a json.");
    };

    /***************************************************************************************************************
     * Top-level flags
     ***************************************************************************************************************/
    add_verbose_flag(&app);
    add_debug_flag(&app);
    add_crs_path_option(&app);

    /***************************************************************************************************************
     * Builtin flag: --version
     ***************************************************************************************************************/
    app.set_version_flag("--version", BB_VERSION_PLACEHOLDER, "Print the version string.");

    /***************************************************************************************************************
     * Subcommand: check
     ***************************************************************************************************************/
    CLI::App* check = app.add_subcommand(
        "check",
        "A debugging tool to quickly check whether a witness satisfies a circuit The "
        "function constructs the execution trace and iterates through it row by row, applying the "
        "polynomial relations defining the gate types. For client IVC, we check the VKs in the folding stack.");

    add_scheme_option(check);
    add_bytecode_path_option(check);
    add_witness_path_option(check);
    add_ivc_inputs_path_options(check);
    add_update_inputs_flag(check);

    /***************************************************************************************************************
     * Subcommand: gates
     ***************************************************************************************************************/
    CLI::App* gates = app.add_subcommand("gates",
                                         "Construct a circuit from the given bytecode (in particular, expand black box "
                                         "functions) and return the gate count information.");

    add_scheme_option(gates);
    add_verbose_flag(gates);
    add_bytecode_path_option(gates);
    add_include_gates_per_opcode_flag(gates);
    add_oracle_hash_option(gates);
    add_ipa_accumulation_flag(gates);

    /***************************************************************************************************************
     * Subcommand: prove
     ***************************************************************************************************************/
    CLI::App* prove = app.add_subcommand("prove", "Generate a proof.");

    add_scheme_option(prove);
    add_bytecode_path_option(prove);
    add_witness_path_option(prove);
    add_output_path_option(prove, output_path);
    add_ivc_inputs_path_options(prove);
    add_vk_path_option(prove);
    add_verbose_flag(prove);
    add_debug_flag(prove);
    add_crs_path_option(prove);
    add_oracle_hash_option(prove);
    add_write_vk_flag(prove);
    add_ipa_accumulation_flag(prove);
    remove_zk_option(prove);
    add_slow_low_memory_flag(prove);
    add_print_bench_flag(prove);
    add_bench_out_option(prove);
    add_storage_budget_option(prove);

    prove->add_flag("--verify", "Verify the proof natively, resulting in a boolean output. Useful for testing.");

    /***************************************************************************************************************
     * Subcommand: write_vk
     ***************************************************************************************************************/
    CLI::App* write_vk =
        app.add_subcommand("write_vk",
                           "Write the verification key of a circuit. The circuit is constructed using "
                           "quickly generated but invalid witnesses (which must be supplied in Barretenberg in order "
                           "to expand ACIR black box opcodes), and no proof is constructed.");

    add_scheme_option(write_vk);
    add_bytecode_path_option(write_vk);
    add_output_path_option(write_vk, output_path);
    add_ivc_inputs_path_options(write_vk);

    add_verbose_flag(write_vk);
    add_debug_flag(write_vk);
    add_crs_path_option(write_vk);
    add_oracle_hash_option(write_vk);
    add_ipa_accumulation_flag(write_vk);
    add_verifier_type_option(write_vk)->default_val("standalone");
    remove_zk_option(write_vk);

    /***************************************************************************************************************
     * Subcommand: verify
     ***************************************************************************************************************/
    CLI::App* verify = app.add_subcommand("verify", "Verify a proof.");

    add_public_inputs_path_option(verify);
    add_proof_path_option(verify);
    add_vk_path_option(verify);

    add_verbose_flag(verify);
    add_debug_flag(verify);
    add_scheme_option(verify);
    add_crs_path_option(verify);
    add_oracle_hash_option(verify);
    remove_zk_option(verify);
    add_ipa_accumulation_flag(verify);

    /***************************************************************************************************************
     * Subcommand: write_solidity_verifier
     ***************************************************************************************************************/
    CLI::App* write_solidity_verifier =
        app.add_subcommand("write_solidity_verifier",
                           "Write a Solidity smart contract suitable for verifying proofs of circuit "
                           "satisfiability for the circuit with verification key at vk_path. Not all "
                           "hash types are implemented due to efficiency concerns.");

    add_scheme_option(write_solidity_verifier);
    add_vk_path_option(write_solidity_verifier);
    add_output_path_option(write_solidity_verifier, output_path);

    add_verbose_flag(write_solidity_verifier);
    remove_zk_option(write_solidity_verifier);
    add_crs_path_option(write_solidity_verifier);
    add_optimized_solidity_verifier_flag(write_solidity_verifier);

    /***************************************************************************************************************
     * Subcommand: OLD_API
     ***************************************************************************************************************/
    CLI::App* OLD_API = app.add_subcommand("OLD_API", "Access some old API commands");

    /***************************************************************************************************************
     * Subcommand: OLD_API write_arbitrary_valid_client_ivc_proof_and_vk_to_file
     ***************************************************************************************************************/
    CLI::App* OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file =
        OLD_API->add_subcommand("write_arbitrary_valid_client_ivc_proof_and_vk_to_file", "");
    add_verbose_flag(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file);
    add_debug_flag(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file);
    add_crs_path_option(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file);
    std::string arbitrary_valid_proof_path{ "./proofs/proof" };
    add_output_path_option(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file, arbitrary_valid_proof_path);

    /***************************************************************************************************************
     * Subcommand: OLD_API gates
     ***************************************************************************************************************/
    CLI::App* OLD_API_gates = OLD_API->add_subcommand("gates", "");
    add_verbose_flag(OLD_API_gates);
    add_debug_flag(OLD_API_gates);
    add_crs_path_option(OLD_API_gates);
    add_bytecode_path_option(OLD_API_gates);

    /***************************************************************************************************************
     * Subcommand: OLD_API verify
     ***************************************************************************************************************/
    CLI::App* OLD_API_verify = OLD_API->add_subcommand("verify", "");
    add_verbose_flag(OLD_API_verify);
    add_debug_flag(OLD_API_verify);
    add_crs_path_option(OLD_API_verify);
    add_bytecode_path_option(OLD_API_verify);
    add_proof_path_option(OLD_API_verify);
    add_vk_path_option(OLD_API_verify);

    /***************************************************************************************************************
     * Subcommand: OLD_API prove_and_verify
     ***************************************************************************************************************/
    CLI::App* OLD_API_prove_and_verify = OLD_API->add_subcommand("prove_and_verify", "");
    add_verbose_flag(OLD_API_prove_and_verify);
    add_debug_flag(OLD_API_prove_and_verify);
    add_crs_path_option(OLD_API_prove_and_verify);
    add_bytecode_path_option(OLD_API_prove_and_verify);

    std::filesystem::path avm_inputs_path{ "./target/avm_inputs.bin" };
    const auto add_avm_inputs_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--avm-inputs", avm_inputs_path, "");
    };
    std::filesystem::path avm_public_inputs_path{ "./target/avm_public_inputs.bin" };
    const auto add_avm_public_inputs_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--avm-public-inputs", avm_public_inputs_path, "");
    };

    /***************************************************************************************************************
     * Subcommand: avm_simulate
     ***************************************************************************************************************/
    CLI::App* avm_simulate_command = app.add_subcommand("avm_simulate", "");
    avm_simulate_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_simulate_command);
    add_debug_flag(avm_simulate_command);
    add_avm_inputs_option(avm_simulate_command);

    /***************************************************************************************************************
     * Subcommand: avm_prove
     ***************************************************************************************************************/
    CLI::App* avm_prove_command = app.add_subcommand("avm_prove", "");
    avm_prove_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_prove_command);
    add_debug_flag(avm_prove_command);
    add_crs_path_option(avm_prove_command);
    std::filesystem::path avm_prove_output_path{ "./proofs" };
    add_output_path_option(avm_prove_command, avm_prove_output_path);
    add_avm_inputs_option(avm_prove_command);

    /***************************************************************************************************************
     * Subcommand: avm_check_circuit
     ***************************************************************************************************************/
    CLI::App* avm_check_circuit_command = app.add_subcommand("avm_check_circuit", "");
    avm_check_circuit_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_check_circuit_command);
    add_debug_flag(avm_check_circuit_command);
    add_crs_path_option(avm_check_circuit_command);
    add_avm_inputs_option(avm_check_circuit_command);

    /***************************************************************************************************************
     * Subcommand: avm_verify
     ***************************************************************************************************************/
    CLI::App* avm_verify_command = app.add_subcommand("avm_verify", "");
    avm_verify_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_verify_command);
    add_debug_flag(avm_verify_command);
    add_crs_path_option(avm_verify_command);
    add_avm_public_inputs_option(avm_verify_command);
    add_proof_path_option(avm_verify_command);
    add_vk_path_option(avm_verify_command);

    /***************************************************************************************************************
     * Subcommand: msgpack
     ***************************************************************************************************************/
    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");

    // Subcommand: msgpack schema
    CLI::App* msgpack_schema_command =
        msgpack_command->add_subcommand("schema", "Output a msgpack schema encoded as JSON to stdout.");
    add_verbose_flag(msgpack_schema_command);

    // Subcommand: msgpack run
    CLI::App* msgpack_run_command =
        msgpack_command->add_subcommand("run", "Execute msgpack API commands from stdin or file.");
    add_verbose_flag(msgpack_run_command);
    std::string msgpack_input_file;
    msgpack_run_command->add_option(
        "-i,--input", msgpack_input_file, "Input file containing msgpack buffers (defaults to stdin)");

    /***************************************************************************************************************
     * Build the CLI11 App
     ***************************************************************************************************************/

    CLI11_PARSE(app, argc, argv);
    // Immediately after parsing, we can init the global CRS factory. Note this does not yet read or download any
    // points; that is done on-demand.
    srs::init_net_crs_factory(flags.crs_path);
    if ((prove->parsed() || write_vk->parsed()) && output_path != "-") {
        // If writing to an output folder, make sure it exists.
        std::filesystem::create_directories(output_path);
    }
    debug_logging = flags.debug;
    verbose_logging = debug_logging || flags.verbose;
    slow_low_memory = flags.slow_low_memory;
#ifndef __wasm__
    if (!flags.storage_budget.empty()) {
        storage_budget = parse_size_string(flags.storage_budget);
    }
    if (print_bench || !bench_out.empty()) {
        bb::detail::use_bb_bench = true;
    }
#endif

    print_active_subcommands(app);
    info("Scheme is: ", flags.scheme, ", num threads: ", get_num_cpus());
    if (CLI::App* deepest = find_deepest_subcommand(&app)) {
        print_subcommand_options(deepest);
    }

    // TODO(AD): it is inflexible that CIVC shares an API command (prove) with UH this way. The base API class is a
    // poor fit. It would be better to have a separate handling for each scheme with subcommands to prove.
    const auto execute_non_prove_command = [&](API& api) {
        if (check->parsed()) {
            api.check(flags, bytecode_path, witness_path);
            return 0;
        }
        if (gates->parsed()) {
            api.gates(flags, bytecode_path);
            return 0;
        }
        if (write_vk->parsed()) {
            api.write_vk(flags, bytecode_path, output_path);
            return 0;
        }
        if (verify->parsed()) {
            const bool verified = api.verify(flags, public_inputs_path, proof_path, vk_path);
            vinfo("verified: ", verified);
            return verified ? 0 : 1;
        }
        if (write_solidity_verifier->parsed()) {
            api.write_solidity_verifier(flags, output_path, vk_path);
            return 0;
        }
        auto subcommands = app.get_subcommands();
        const std::string message = std::string("No handler for subcommand ") + subcommands[0]->get_name();
        throw_or_abort(message);
        return 1;
    };

    try {
        // MSGPACK
        if (msgpack_schema_command->parsed()) {
            std::cout << bbapi::get_msgpack_schema_as_json() << std::endl;
            return 0;
        }
        if (msgpack_run_command->parsed()) {
            return execute_msgpack_run(msgpack_input_file);
        }
        // AVM
#ifndef DISABLE_AZTEC_VM
        else if (avm_prove_command->parsed()) {
            // This outputs both files: proof and vk, under the given directory.
            avm_prove(avm_inputs_path, avm_prove_output_path);
        } else if (avm_check_circuit_command->parsed()) {
            avm_check_circuit(avm_inputs_path);
        } else if (avm_verify_command->parsed()) {
            return avm_verify(proof_path, avm_public_inputs_path, vk_path) ? 0 : 1;
        } else if (avm_simulate_command->parsed()) {
            avm_simulate(avm_inputs_path);
        }
#else
        else if (avm_prove_command->parsed() || avm_check_circuit_command->parsed() || avm_verify_command->parsed() ||
                 avm_simulate_command->parsed()) {
            throw_or_abort("The Aztec Virtual Machine (AVM) is disabled in this environment!");
        }
#endif
        else if (OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file->parsed()) {
            write_arbitrary_valid_client_ivc_proof_and_vk_to_file(arbitrary_valid_proof_path);
            return 0;
        }
        // NEW STANDARD API
        // NOTE(AD): We likely won't really have a standard API if our main flavours are UH or CIVC, with CIVC so
        // different
        else if (flags.scheme == "client_ivc") {
            ClientIVCAPI api;
            if (prove->parsed()) {
                if (!std::filesystem::exists(ivc_inputs_path)) {
                    throw_or_abort("The prove command for ClientIVC expect a valid file passed with --ivc_inputs_path "
                                   "<ivc-inputs.msgpack> (default ./ivc-inputs.msgpack)");
                }
                api.prove(flags, ivc_inputs_path, output_path);
#ifndef __wasm__
                if (print_bench) {
                    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);
                }
                if (!bench_out.empty()) {
                    std::ofstream file(bench_out);
                    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts(file, 2);
                }
#endif
                return 0;
            }
            if (check->parsed()) {
                if (!std::filesystem::exists(ivc_inputs_path)) {
                    throw_or_abort("The check command for ClientIVC expect a valid file passed with --ivc_inputs_path "
                                   "<ivc-inputs.msgpack> (default ./ivc-inputs.msgpack)");
                }
                return api.check_precomputed_vks(flags, ivc_inputs_path) ? 0 : 1;
            }
            return execute_non_prove_command(api);
        } else if (flags.scheme == "ultra_honk") {
            UltraHonkAPI api;
            if (prove->parsed()) {
                api.prove(flags, bytecode_path, witness_path, vk_path, output_path);
#ifndef __wasm__
                if (print_bench) {
                    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);
                }
                if (!bench_out.empty()) {
                    std::ofstream file(bench_out);
                    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts(file, 2);
                }
#endif
                return 0;
            }
            return execute_non_prove_command(api);
        } else {
            throw_or_abort("No match for API command");
            return 1;
        }
    } catch (std::runtime_error const& err) {
#ifndef BB_NO_EXCEPTIONS
        std::cerr << err.what() << std::endl;
        return 1;
#endif
    }
    return 0;
}
} // namespace bb
