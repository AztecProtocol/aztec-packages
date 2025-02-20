#include "barretenberg/api/api_avm.hpp"
#include "barretenberg/api/api_client_ivc.hpp"
#include "barretenberg/api/api_ultra_honk.hpp"
#include "barretenberg/api/api_ultra_plonk.hpp"
#include "barretenberg/api/gate_count.hpp"
#include "barretenberg/api/prove_tube.hpp"
#include "barretenberg/bb/cli11_formatter.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"

using namespace bb;

const char* BB_VERSION_PLACEHOLDER = "00000000.00000000.00000000";

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1257): Remove unused/seemingly unnecessary flags.
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1258): Improve defaults.

// Helper function to recursively print active subcommands for CLI11 app debugging
void print_active_subcommands(const CLI::App& app, const std::string& prefix = "bb command: ")
{
    // get_subcommands() returns a vector of pointers to subcommands
    for (auto subcmd : app.get_subcommands()) {
        // Check if this subcommand was activated (nonzero count)
        if (subcmd->count() > 0) {
            vinfo(prefix, subcmd->get_name());
            // Recursively print any subcommands of this subcommand
            print_active_subcommands(*subcmd, prefix + "  ");
        }
    }
}

int main(int argc, char* argv[])
{
    std::string name = "Barretenberg\nYour favo(u)rite zkSNARK library written in C++, a perfectly good computer "
                       "programming language.";

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
    std::filesystem::path output_path{
        "./out"
    }; // sometimes a directory where things will be written, sometimes the path of a file to be written
    std::filesystem::path proof_path{ "./target/proof" };
    std::filesystem::path vk_path{ "./target/vk" };
    flags.scheme = "";
    flags.oracle_hash_type = "poseidon2";
    flags.output_data_type = "bytes";
    flags.crs_path = []() {
        char* home = std::getenv("HOME");
        std::filesystem::path base = home != nullptr ? std::filesystem::path(home) : "./";
        return base / ".bb-crs";
    }();

    const auto add_output_path_option = [&](CLI::App* subcommand, auto& _output_path) {
        return subcommand->add_option("--output_path, -o",
                                      _output_path,
                                      "Directory to write files or path of file to write, depending on subcommand.");
    };

    /***************************************************************************************************************
     * Subcommand: Adders for options that we will create for more than one subcommand
     ***************************************************************************************************************/

    const auto add_recursive_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag(
            "--recursive", flags.recursive, "Do some things relating to recursive verification and KZG...");
    };

    const auto add_honk_recursion_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--honk_recursion",
                                      flags.honk_recursion,
                                      "Do some things relating to recursive verification, possibly IPA...");
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
            ->add_option("--oracle_hash",
                         flags.oracle_hash_type,
                         "The hash function used by the prover as random oracle standing in for a verifier's challenge "
                         "generation. Poseidon2 is to be used for proofs that are intended to be verified inside of a "
                         "circuit. Keccak is optimized for verification in an Ethereum smart contract, where Keccak "
                         "has a privileged position due to the existence of an EVM precompile.")
            ->check(CLI::IsMember({ "poseidon2", "keccak" }).name("is_member"));
    };

    const auto add_output_data_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option(
                "--output_data",
                flags.output_data_type,
                "The type of the data to be written by the command. If bytes, output the raw bytes prefixed with "
                "header information for deserialization. If fields, output a string representation of an array of "
                "field elements. If bytes_and_fields do both. If fields_msgpack, outputs a msgpack buffer of Fr "
                "elements.")
            ->check(CLI::IsMember({ "bytes", "fields", "bytes_and_fields", "fields_msgpack" }).name("is_member"));
    };

    const auto add_output_content_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option("--output_content",
                         flags.output_content_type,
                         "The data to be written. Options are: a proof, a verification key, or both.")
            ->check(CLI::IsMember({ "proof", "vk", "proof_and_vk" }).name("is_member"));
    };

    const auto add_input_type_option = [&](CLI::App* subcommand) {
        auto* input_type_option =
            subcommand
                ->add_option("--input_type",
                             flags.input_type,
                             "Is the input a single circuit, a compile-time stack or a run-time stack?")
                ->check(CLI::IsMember({ "single_circuit", "compiletime_stack", "runtime_stack" }).name("is_member"));
        return input_type_option;
    };

    const auto add_ipa_accumulation_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--ipa_accumulation",
                                    flags.ipa_accumulation,
                                    "Does the protocol accumulate/aggregate IPA (Inner Product Argument) claims?");
    };

    const auto add_zk_option = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--zk", flags.zk, "Use a zk version of --scheme, if available.");
    };

    const auto add_init_kzg_accumulator_option = [&](CLI::App* subcommand) {
        return subcommand->add_flag(
            "--init_kzg_accumulator", flags.init_kzg_accumulator, "Initialize pairing point accumulator.");
    };

    const auto add_bytecode_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--bytecode_path, -b", bytecode_path, "Path to ACIR bytecode generated by Noir.")
            /* ->check(CLI::ExistingFile) OR stdin indicator - */;
    };

    const auto add_witness_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--witness_path, -w", witness_path, "Path to partial witness generated by Noir.")
            /* ->check(CLI::ExistingFile) OR stdin indicator - */;
    };

    const auto add_proof_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option(
            "--proof_path, -p", proof_path, "Path to a proof.") /* ->check(CLI::ExistingFile) */;
    };

    const auto add_vk_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--vk_path, -k", vk_path, "Path to a verification key.")
            /* ->check(CLI::ExistingFile) */;
    };

    const auto add_verbose_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--verbose, --verbose_logging, -v", flags.verbose, "Output all logs to stderr.");
    };

    const auto add_debug_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--debug_logging, -d", flags.debug, "Output debug logs to stderr.");
    };

    /***************************************************************************************************************
     * Top-level flags
     ***************************************************************************************************************/
    add_verbose_flag(&app);
    add_debug_flag(&app);
    add_crs_path_option(&app);

    /***************************************************************************************************************
     * Subcommand: version
     ***************************************************************************************************************/
    CLI::App* version = app.add_subcommand("version", "Print the version string.");

    /***************************************************************************************************************
     * Subcommand: check
     ***************************************************************************************************************/
    CLI::App* check =
        app.add_subcommand("check",
                           "A debugging tool to quickly check whether a witness satisfies a circuit The "
                           "function constructs the execution trace and iterates through it row by row, applying the "
                           "polynomial relations defining the gate types.");

    add_bytecode_path_option(check);
    add_witness_path_option(check);

    /***************************************************************************************************************
     * Subcommand: gates
     ***************************************************************************************************************/
    CLI::App* gates = app.add_subcommand("gates",
                                         "Construct a circuit from the given bytecode (in particular, expand black box "
                                         "functions) and return the gate count information.");

    add_verbose_flag(gates);
    add_bytecode_path_option(gates);

    /***************************************************************************************************************
     * Subcommand: prove
     ***************************************************************************************************************/
    CLI::App* prove = app.add_subcommand("prove", "Generate a proof.");

    add_scheme_option(prove);
    add_bytecode_path_option(prove);
    add_witness_path_option(prove);
    add_output_path_option(prove, output_path);

    add_verbose_flag(prove);
    add_debug_flag(prove);
    add_crs_path_option(prove);
    add_oracle_hash_option(prove);
    add_output_data_option(prove);
    add_output_content_option(prove)->default_val("proof");
    add_input_type_option(prove);
    add_zk_option(prove);
    add_init_kzg_accumulator_option(prove);
    add_ipa_accumulation_flag(prove);
    add_recursive_flag(prove);
    add_honk_recursion_option(prove);

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

    add_verbose_flag(write_vk);
    add_debug_flag(write_vk);
    add_output_data_option(write_vk);
    add_input_type_option(write_vk);
    add_crs_path_option(write_vk);
    add_init_kzg_accumulator_option(write_vk);
    add_oracle_hash_option(write_vk);
    add_ipa_accumulation_flag(write_vk);
    add_honk_recursion_option(write_vk);
    add_recursive_flag(write_vk);

    /***************************************************************************************************************
     * Subcommand: verify
     ***************************************************************************************************************/
    CLI::App* verify = app.add_subcommand("verify", "Verify a proof.");

    add_proof_path_option(verify);
    add_vk_path_option(verify);

    add_verbose_flag(verify);
    add_debug_flag(verify);
    add_scheme_option(verify);
    add_crs_path_option(verify);
    add_oracle_hash_option(verify);
    add_zk_option(verify);
    add_ipa_accumulation_flag(verify);
    add_init_kzg_accumulator_option(verify);
    add_honk_recursion_option(verify);
    add_recursive_flag(verify);

    /***************************************************************************************************************
     * Subcommand: write_contract
     ***************************************************************************************************************/
    CLI::App* write_contract =
        app.add_subcommand("write_contract",
                           "Write a smart contract suitable for verifying proofs of circuit "
                           "satisfiability for the circuit with verification key at vk_path. Not all "
                           "hash types are implemented due to efficiency concerns.");

    add_scheme_option(write_contract);
    add_vk_path_option(write_contract);
    add_output_path_option(write_contract, output_path);

    add_verbose_flag(write_contract);
    add_zk_option(write_contract);
    add_crs_path_option(write_contract);

    /***************************************************************************************************************
     * Subcommand: OLD_API
     ***************************************************************************************************************/
    CLI::App* OLD_API = app.add_subcommand("OLD_API", "Access some old API commands");

    /***************************************************************************************************************
     * Subcommand: OLD_API gates_for_ivc
     ***************************************************************************************************************/
    CLI::App* OLD_API_gates_for_ivc = OLD_API->add_subcommand("gates_for_ivc", "");
    add_verbose_flag(OLD_API_gates_for_ivc);
    add_debug_flag(OLD_API_gates_for_ivc);
    add_crs_path_option(OLD_API_gates_for_ivc);
    add_bytecode_path_option(OLD_API_gates_for_ivc);

    /***************************************************************************************************************
     * Subcommand: OLD_API gates_mega_honk
     ***************************************************************************************************************/
    CLI::App* OLD_API_gates_mega_honk = OLD_API->add_subcommand("gates_mega_honk", "");
    add_verbose_flag(OLD_API_gates_mega_honk);
    add_debug_flag(OLD_API_gates_mega_honk);
    add_crs_path_option(OLD_API_gates_mega_honk);
    add_recursive_flag(OLD_API_gates_mega_honk);
    add_honk_recursion_option(OLD_API_gates_mega_honk);
    add_bytecode_path_option(OLD_API_gates_mega_honk);

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
     * Subcommand: OLD_API write_recursion_inputs_ultra_honk
     ***************************************************************************************************************/
    CLI::App* OLD_API_write_recursion_inputs_ultra_honk =
        OLD_API->add_subcommand("write_recursion_inputs_ultra_honk", "");
    add_verbose_flag(OLD_API_write_recursion_inputs_ultra_honk);
    add_debug_flag(OLD_API_write_recursion_inputs_ultra_honk);
    add_crs_path_option(OLD_API_write_recursion_inputs_ultra_honk);
    std::string recursion_inputs_output_path{ "./target" };
    add_output_path_option(OLD_API_write_recursion_inputs_ultra_honk, recursion_inputs_output_path);
    add_ipa_accumulation_flag(OLD_API_write_recursion_inputs_ultra_honk);
    add_recursive_flag(OLD_API_write_recursion_inputs_ultra_honk);
    add_bytecode_path_option(OLD_API_write_recursion_inputs_ultra_honk);

    /***************************************************************************************************************
     * Subcommand: OLD_API gates
     ***************************************************************************************************************/
    CLI::App* OLD_API_gates = OLD_API->add_subcommand("gates", "");
    add_verbose_flag(OLD_API_gates);
    add_debug_flag(OLD_API_gates);
    add_crs_path_option(OLD_API_gates);
    add_recursive_flag(OLD_API_gates);
    add_honk_recursion_option(OLD_API_gates);
    add_bytecode_path_option(OLD_API_gates);

    /***************************************************************************************************************
     * Subcommand: OLD_API prove
     ***************************************************************************************************************/
    CLI::App* OLD_API_prove = OLD_API->add_subcommand("prove", "");
    add_verbose_flag(OLD_API_prove);
    add_debug_flag(OLD_API_prove);
    add_crs_path_option(OLD_API_prove);
    add_recursive_flag(OLD_API_prove);
    std::string plonk_prove_output_path{ "./proofs/proof" };
    add_output_path_option(OLD_API_prove, plonk_prove_output_path);
    add_bytecode_path_option(OLD_API_prove);
    add_witness_path_option(OLD_API_prove);

    /***************************************************************************************************************
     * Subcommand: OLD_API prove_output_all
     ***************************************************************************************************************/
    CLI::App* OLD_API_prove_output_all = OLD_API->add_subcommand("prove_output_all", "");
    add_verbose_flag(OLD_API_prove_output_all);
    add_debug_flag(OLD_API_prove_output_all);
    add_crs_path_option(OLD_API_prove_output_all);
    add_recursive_flag(OLD_API_prove_output_all);
    std::string plonk_prove_output_all_output_path{ "./proofs" };
    add_output_path_option(OLD_API_prove_output_all, plonk_prove_output_all_output_path);
    add_bytecode_path_option(OLD_API_prove_output_all);

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
    add_recursive_flag(OLD_API_verify);

    /***************************************************************************************************************
     * Subcommand: OLD_API prove_and_verify
     ***************************************************************************************************************/
    CLI::App* OLD_API_prove_and_verify = OLD_API->add_subcommand("prove_and_verify", "");
    add_verbose_flag(OLD_API_prove_and_verify);
    add_debug_flag(OLD_API_prove_and_verify);
    add_crs_path_option(OLD_API_prove_and_verify);
    add_recursive_flag(OLD_API_prove_and_verify);
    add_bytecode_path_option(OLD_API_prove_and_verify);

    /***************************************************************************************************************
     * Subcommand: OLD_API contract
     ***************************************************************************************************************/
    CLI::App* OLD_API_contract = OLD_API->add_subcommand("contract", "");
    add_verbose_flag(OLD_API_contract);
    add_debug_flag(OLD_API_contract);
    add_crs_path_option(OLD_API_contract);
    std::string plonk_contract_output_path{ "./target/contract.sol" };
    add_output_path_option(OLD_API_contract, plonk_contract_output_path);
    add_bytecode_path_option(OLD_API_contract);
    add_vk_path_option(OLD_API_contract);

    /***************************************************************************************************************
     * Subcommand: OLD_API write_vk
     ***************************************************************************************************************/
    CLI::App* OLD_API_write_vk = OLD_API->add_subcommand("write_vk", "");
    add_verbose_flag(OLD_API_write_vk);
    add_debug_flag(OLD_API_write_vk);
    add_crs_path_option(OLD_API_write_vk);
    add_recursive_flag(OLD_API_write_vk);
    std::string plonk_vk_output_path{ "./target/vk" };
    add_output_path_option(OLD_API_write_vk, plonk_vk_output_path);
    add_bytecode_path_option(OLD_API_write_vk);

    /***************************************************************************************************************
     * Subcommand: OLD_API write_pk
     ***************************************************************************************************************/
    CLI::App* OLD_API_write_pk = OLD_API->add_subcommand("write_pk", "");
    add_verbose_flag(OLD_API_write_pk);
    add_debug_flag(OLD_API_write_pk);
    add_crs_path_option(OLD_API_write_pk);
    add_recursive_flag(OLD_API_write_pk);
    std::string plonk_pk_output_path{ "./target/pk" };
    add_output_path_option(OLD_API_write_pk, plonk_pk_output_path);
    add_bytecode_path_option(OLD_API_write_pk);

    /***************************************************************************************************************
     * Subcommand: OLD_API proof_as_fields
     ***************************************************************************************************************/
    CLI::App* OLD_API_proof_as_fields = OLD_API->add_subcommand("proof_as_fields", "");
    add_verbose_flag(OLD_API_proof_as_fields);
    add_debug_flag(OLD_API_proof_as_fields);
    add_crs_path_option(OLD_API_proof_as_fields);
    std::string plonk_proof_as_fields_output_path;
    auto* output_path_option = add_output_path_option(OLD_API_proof_as_fields, plonk_proof_as_fields_output_path);
    add_proof_path_option(OLD_API_proof_as_fields);
    add_vk_path_option(OLD_API_proof_as_fields);
    // Attach a final callback to the subcommand (or the main app) that will run after parsing.
    // This callback will update the output path default if the user did not supply an explicit value.
    OLD_API_proof_as_fields->final_callback([&]() {
        // If the output option was not set (i.e. its count is 0), update it.
        if (output_path_option->count() == 0) {
            // Update the default output based on the (possibly changed) proof_path.
            plonk_proof_as_fields_output_path = proof_path.stem().string() + "_fields.json";
        }
    });

    /***************************************************************************************************************
     * Subcommand: OLD_API vk_as_fields
     ***************************************************************************************************************/
    CLI::App* OLD_API_vk_as_fields = OLD_API->add_subcommand("vk_as_fields", "");
    add_verbose_flag(OLD_API_vk_as_fields);
    add_debug_flag(OLD_API_vk_as_fields);
    add_crs_path_option(OLD_API_vk_as_fields);
    std::string plonk_vk_as_fields_output_path{ vk_path / "_fields.json" };
    add_output_path_option(OLD_API_vk_as_fields, plonk_vk_as_fields_output_path);
    add_vk_path_option(OLD_API_vk_as_fields);

#ifndef DISABLE_AZTEC_VM
    std::filesystem::path avm_inputs_path{ "./target/avm_inputs.bin" };
    const auto add_avm_inputs_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--avm-inputs", avm_inputs_path, "");
    };
    std::filesystem::path avm_hints_path{ "./target/avm_hints.bin" };
    const auto add_avm_hints_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--avm-hints", avm_hints_path, "");
    };
    std::filesystem::path avm_public_inputs_path{ "./target/avm_public_inputs.bin" };
    const auto add_avm_public_inputs_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--avm-public-inputs", avm_public_inputs_path, "");
    };
    extern std::filesystem::path avm_dump_trace_path;
    const auto add_avm_dump_trace_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--avm-dump-trace", avm_dump_trace_path, "");
    };
    bool check_circuit_only{ false };
    const auto add_check_circuit_only_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--check-circuit-only", check_circuit_only, "");
    };

    /***************************************************************************************************************
     * Subcommand: avm2_prove
     ***************************************************************************************************************/
    CLI::App* avm2_prove_command = app.add_subcommand("avm2_prove", "");
    avm2_prove_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm2_prove_command);
    add_debug_flag(avm2_prove_command);
    add_crs_path_option(avm2_prove_command);
    std::filesystem::path avm2_prove_output_path{ "./proofs" };
    add_output_path_option(avm2_prove_command, avm2_prove_output_path);
    add_avm_inputs_option(avm2_prove_command);

    /***************************************************************************************************************
     * Subcommand: avm2_check_circuit
     ***************************************************************************************************************/
    CLI::App* avm2_check_circuit_command = app.add_subcommand("avm2_check_circuit", "");
    avm2_check_circuit_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm2_check_circuit_command);
    add_debug_flag(avm2_check_circuit_command);
    add_crs_path_option(avm2_check_circuit_command);
    add_avm_inputs_option(avm2_check_circuit_command);

    /***************************************************************************************************************
     * Subcommand: avm2_verify
     ***************************************************************************************************************/
    CLI::App* avm2_verify_command = app.add_subcommand("avm2_verify", "");
    avm2_verify_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm2_verify_command);
    add_debug_flag(avm2_verify_command);
    add_crs_path_option(avm2_verify_command);
    add_avm_public_inputs_option(avm2_verify_command);
    add_proof_path_option(avm2_verify_command);
    add_vk_path_option(avm2_verify_command);

    /***************************************************************************************************************
     * Subcommand: avm_check_circuit
     ***************************************************************************************************************/
    CLI::App* avm_check_circuit_command = app.add_subcommand("avm_check_circuit", "");
    avm_check_circuit_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_check_circuit_command);
    add_debug_flag(avm_check_circuit_command);
    add_crs_path_option(avm_check_circuit_command);
    add_avm_hints_option(avm_check_circuit_command);
    add_avm_public_inputs_option(avm_check_circuit_command);
    add_output_path_option(avm_check_circuit_command, output_path);
    add_avm_dump_trace_option(avm_check_circuit_command);
    add_check_circuit_only_flag(avm_check_circuit_command);

    /***************************************************************************************************************
     * Subcommand: avm_prove
     ***************************************************************************************************************/
    CLI::App* avm_prove_command = app.add_subcommand("avm_prove", "");
    avm_prove_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_prove_command);
    add_debug_flag(avm_prove_command);
    add_crs_path_option(avm_prove_command);
    std::filesystem::path avm_prove_output_path{ "./proofs" };
    add_avm_hints_option(avm_prove_command);
    add_avm_public_inputs_option(avm_prove_command);
    add_output_path_option(avm_prove_command, avm_prove_output_path);
    add_avm_dump_trace_option(avm_prove_command);
    add_check_circuit_only_flag(avm_prove_command);

    /***************************************************************************************************************
     * Subcommand: avm_verify
     ***************************************************************************************************************/
    CLI::App* avm_verify_command = app.add_subcommand("avm_verify", "");
    avm_verify_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_verify_command);
    add_debug_flag(avm_verify_command);
    add_crs_path_option(avm_verify_command);
    add_avm_hints_option(avm_verify_command);
    add_avm_public_inputs_option(avm_verify_command);
    add_output_path_option(avm_verify_command, output_path);
    add_check_circuit_only_flag(avm_verify_command);
    add_proof_path_option(avm_verify_command);
    add_vk_path_option(avm_verify_command);
#endif

    /***************************************************************************************************************
     * Subcommand: prove_tube
     ***************************************************************************************************************/
    CLI ::App* prove_tube_command = app.add_subcommand("prove_tube", "");
    prove_tube_command->group(""); // hide from list of subcommands
    add_verbose_flag(prove_tube_command);
    add_debug_flag(prove_tube_command);
    add_crs_path_option(prove_tube_command);
    std::string prove_tube_output_path{ "./target" };
    add_output_path_option(prove_tube_command, prove_tube_output_path);

    /***************************************************************************************************************
     * Subcommand: verify_tube
     ***************************************************************************************************************/
    CLI::App* verify_tube_command = app.add_subcommand("verify_tube", "");
    verify_tube_command->group(""); // hide from list of subcommands
    add_verbose_flag(verify_tube_command);
    add_debug_flag(verify_tube_command);
    add_crs_path_option(verify_tube_command);
    // doesn't make sense that this is set by -o but that's how it was
    std::string tube_proof_and_vk_path{ "./target" };
    add_output_path_option(verify_tube_command, tube_proof_and_vk_path);

    /***************************************************************************************************************
     * Build the CLI11 App
     ***************************************************************************************************************/

    CLI11_PARSE(app, argc, argv);
    print_active_subcommands(app);
    vinfo(flags);

    debug_logging = flags.debug;
    verbose_logging = debug_logging || flags.verbose;

    // prob this construction is too much
    const auto execute_command = [&](API& api) {
        if (check->parsed()) {
            api.check(flags, bytecode_path, witness_path);
            return 0;
        }
        if (gates->parsed()) {
            api.gates(flags, bytecode_path);
            return 0;
        }
        if (prove->parsed()) {
            api.prove(flags, bytecode_path, witness_path, output_path);
            return 0;
        }
        if (write_vk->parsed()) {
            api.write_vk(flags, bytecode_path, output_path);
            return 0;
        }
        if (verify->parsed()) {
            return api.verify(flags, proof_path, vk_path) ? 0 : 1;
        }
        if (write_contract->parsed()) {
            api.write_contract(flags, output_path, vk_path);
            return 0;
        }
        auto subcommands = app.get_subcommands();
        const std::string message = std::string("No handler for subcommand ") + subcommands[0]->get_name();
        throw_or_abort(message);
        return 1;
    };

    try {
        if (version->parsed()) {
            // Placeholder that we replace inside the binary as a pre-release step.
            // Compared to the prevs CMake injection strategy, this avoids full rebuilds.
            std::cout << BB_VERSION_PLACEHOLDER << std::endl;
            return 0;
        }
        // ULTRA PLONK
        else if (OLD_API_gates->parsed()) {
            gate_count<UltraCircuitBuilder>(bytecode_path, flags.recursive, flags.honk_recursion);
        } else if (OLD_API_prove->parsed()) {
            prove_ultra_plonk(bytecode_path, witness_path, plonk_prove_output_path, flags.recursive);
        } else if (OLD_API_prove_output_all->parsed()) {
            prove_output_all_ultra_plonk(
                bytecode_path, witness_path, plonk_prove_output_all_output_path, flags.recursive);
        } else if (OLD_API_verify->parsed()) {
            return verify_ultra_plonk(proof_path, vk_path) ? 0 : 1;
        } else if (OLD_API_prove_and_verify->parsed()) {
            return prove_and_verify_ultra_plonk(bytecode_path, flags.recursive, witness_path) ? 0 : 1;
        } else if (OLD_API_contract->parsed()) {
            contract_ultra_plonk(plonk_contract_output_path, vk_path);
        } else if (OLD_API_write_vk->parsed()) {
            write_vk_ultra_plonk(bytecode_path, plonk_vk_output_path, flags.recursive);
        } else if (OLD_API_write_pk->parsed()) {
            write_pk_ultra_plonk(bytecode_path, plonk_pk_output_path, flags.recursive);
        } else if (OLD_API_proof_as_fields->parsed()) {
            proof_as_fields(proof_path, vk_path, plonk_proof_as_fields_output_path);
        } else if (OLD_API_vk_as_fields->parsed()) {
            vk_as_fields(vk_path, plonk_vk_as_fields_output_path);
        }
        // AVM
#ifndef DISABLE_AZTEC_VM
        else if (avm2_prove_command->parsed()) {
            // This outputs both files: proof and vk, under the given directory.
            avm2_prove(avm_inputs_path, avm2_prove_output_path);
        } else if (avm2_check_circuit_command->parsed()) {
            avm2_check_circuit(avm_inputs_path);
        } else if (avm2_verify_command->parsed()) {
            return avm2_verify(proof_path, avm_public_inputs_path, vk_path) ? 0 : 1;
        } else if (avm_check_circuit_command->parsed()) {
            avm_check_circuit(avm_public_inputs_path, avm_hints_path);
        } else if (avm_prove_command->parsed()) {
            // This outputs both files: proof and vk, under the given directory.
            avm_prove(avm_public_inputs_path, avm_hints_path, avm_prove_output_path);
        } else if (avm_verify_command->parsed()) {
            return avm_verify(proof_path, vk_path) ? 0 : 1;
        }
#endif
        // TUBE
        else if (prove_tube_command->parsed()) {
            prove_tube(prove_tube_output_path);
        } else if (verify_tube_command->parsed()) {
            auto tube_proof_path = tube_proof_and_vk_path + "/proof";
            auto tube_vk_path = tube_proof_and_vk_path + "/vk";
            UltraHonkAPI api;
            return api.verify({ .ipa_accumulation = true }, tube_proof_path, tube_vk_path) ? 0 : 1;
        }
        // CLIENT IVC EXTRA COMMAND
        else if (OLD_API_gates_for_ivc->parsed()) {
            gate_count_for_ivc(bytecode_path);
        } else if (OLD_API_gates_mega_honk->parsed()) {
            gate_count<MegaCircuitBuilder>(bytecode_path, flags.recursive, flags.honk_recursion);
        } else if (OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file->parsed()) {
            write_arbitrary_valid_client_ivc_proof_and_vk_to_file(arbitrary_valid_proof_path);
            return 0;
        }
        // ULTRA HONK EXTRA COMMANDS
        else if (OLD_API_write_recursion_inputs_ultra_honk->parsed()) {
            if (flags.ipa_accumulation) {
                write_recursion_inputs_ultra_honk<UltraRollupFlavor>(
                    bytecode_path, witness_path, recursion_inputs_output_path);
            } else {
                write_recursion_inputs_ultra_honk<UltraFlavor>(
                    bytecode_path, witness_path, recursion_inputs_output_path);
            }
        }
        // NEW STANDARD API
        else if (flags.scheme == "client_ivc") {
            ClientIVCAPI api;
            return execute_command(api);
        } else if (flags.scheme == "ultra_honk") {
            UltraHonkAPI api;
            return execute_command(api);
        } else {
            throw_or_abort("No match for API command");
            return 1;
        }
    } catch (std::runtime_error const& err) {
        std::cerr << err.what() << std::endl;
        return 1;
    }
}
