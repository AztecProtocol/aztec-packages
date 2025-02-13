#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wunused-variable"
#pragma GCC diagnostic ignored "-Wunused-but-set-variable"

#include "barretenberg/api/api_client_ivc.hpp"
#include "barretenberg/api/api_ultra_honk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bb11/cli11_formatter.hpp"
#include "barretenberg/common/log.hpp"
#include <format>

using namespace bb;

int main(int argc, char* argv[])
{
    std::string name = "Barretenberg\nYour favo(u)rite zkSNARK library written in C++, a perfectly good computer "
                       "programming language.";
    CLI::App app{ name };
    argv = app.ensure_utf8(argv);
    app.formatter(std::make_shared<Formatter>());
    app.require_subcommand(0, 1); // prevent two or more subcommands being executed

    API::Flags flags{}; // default initialize to start
    // Some paths, with defaults, that may or may not be set by commands
    std::filesystem::path bytecode_path{ "./target/program.json" };
    std::filesystem::path witness_path{ "./target/witness.gz" };
    std::filesystem::path output_path{
        "./out"
    }; // sometimes a directory where things will be written, sometimes the path of a file to be written
    std::filesystem::path proof_path{ "./target/proof" };
    std::filesystem::path vk_path{ "./target/vk" };
    flags.scheme = "ultra_honk";
    flags.oracle_hash_type = "poseidon2";
    flags.output_data_type = "bytes";
    flags.crs_path = []() {
        char* home = std::getenv("HOME");
        std::filesystem::path base = home != nullptr ? std::filesystem::path(home) : "./";
        return base / ".bb-crs";
    }();

    /***************************************************************************************************************
     * Subcommnd: Adders for options that we will create for more than one subcommand
     ***************************************************************************************************************/
    const auto add_verbose_flag = [&](CLI::App* subcommand) {
        return subcommand->add_flag("--verbose, -v", flags.verbose, "Output all logs to stderr.");
    };

    const auto add_scheme_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option(
                "--scheme, -s",
                flags.scheme,
                "The type of proof to be constructed. This can specify a proving system, an accumulation scheme, or a "
                "particular type of circuit to be constructed and proven for some implicit scheme.")
            ->envname("BB_SCHEME")
            ->check(CLI::IsMember({ "client_ivc", "avm", "tube", "ultra_honk", "ultra_keccak_honk", "ultra_plonk" })
                        .name("is_member"));
    };

    const auto add_crs_path_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option("--crs_dir, -c",
                         flags.crs_path,
                         "Path CRS directory. Missing CRS files will be retrieved from the internet.")
            ->check(CLI::ExistingDirectory);
    };

    const auto add_oracle_hash_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option("--oracle_hash",
                         flags.oracle_hash_type,
                         "The hash function used to model a random oracle to the prover to produce verifier "
                         "challenges. Poseidon2 is to be used for proofs that are intended to be verified inside of a "
                         "circuit. Keccak is optimized for verification in an Ethereum smart contract, where Keccak "
                         "has a privileged position due to the existence of an EVM precompile.")
            ->check(CLI::IsMember({ "poseidon2", "keccak" }).name("is_member"));
    };

    // WORKTODO: more documentation on serialization etc
    const auto add_output_data_option = [&](CLI::App* subcommand) {
        return subcommand
            ->add_option(
                "--output_data",
                flags.output_data_type,
                "The type of the data to be written by the command. If bytes, output the raw bytes prefixed with "
                "header information for deserialization. If fields, output a string representation of an array of of "
                "elements of the finite field Fr which is the scalar field of BN254. This is needed for recursive "
                "verification via Noir, where one must feed such a representation of both a verification key and a "
                "proof as witness input to the verify_proof blackbox function. The option bytes_and_fields outputs two "
                "representations of each output datum, one of each of the preceding times. The final option, "
                "fields_msgpack, outputs a msgpack buffer of Fr elements--this is an efficien tbinary representation.")
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

    // WORKTODO: documentation of structure (JSON or msgpack of bytecodes; bytecodes are encoded...)
    // WORKTODO: fine-grained validation?
    // WORKTODO: bytecode path is a bad name since bytecode is sometimes actually just a field in the ACIR?
    const auto add_bytecode_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--bytecode_path, -b", bytecode_path, "Path to ACIR bytecode generated by Noir.")
            ->check(CLI::ExistingFile);
    };

    // WORKTODO: documentation of structure (JSON or msgpack of bytecodes; bytecodes are encoded...)
    const auto add_witness_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--witness_path, -w", witness_path, "Path to partial witness generated by Noir.")
            ->check(CLI::ExistingFile);
    };

    const auto add_output_path_option = [&](CLI::App* subcommand) {
        subcommand->add_option("--output_path, -o",
                               output_path,
                               "Directory to write files or path of file to write, depending on subcomand.");
        // ->check(CLI::ExistingDirectory | CLI::IsMember({ "-" }).name("is_member"))
    };

    const auto add_proof_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option(
            "--proof_path, -p", proof_path, "Path to a proof.") /* ->check(CLI::ExistingFile) */;
    };

    const auto add_vk_path_option = [&](CLI::App* subcommand) {
        return subcommand->add_option("--vk_path, -k", vk_path, "Path to a verification key.")
            /* ->check(CLI::ExistingFile) */;
    };

    /***************************************************************************************************************
     * Subcommnd: version
     ***************************************************************************************************************/
    app.add_subcommand("version", "Print the version string.");

    /***************************************************************************************************************
     * Subcommnd: check_witness
     ***************************************************************************************************************/
    CLI::App* check_witness = app.add_subcommand(
        "check_witness",
        "A debugging tool to quickly check whether a witness is valid, i.e., whether it satisfies the circuit whose "
        "bytecode is provided. Said differently, this command returns true if and only if the prove method would "
        "return a proof that verifies. The result of this check DOES NOT convince a verifier of the result. The "
        "function constructs the execution trace and iterates through it row-by-row/gate-by-gate, applying the "
        "polynomial relations defining the various gate types and checks whether any row does not satisfy these.");

    add_bytecode_path_option(check_witness);
    add_witness_path_option(check_witness);

    /***************************************************************************************************************
     * Subcommand: gates
     ***************************************************************************************************************/
    CLI::App* gates = app.add_subcommand("gates",
                                         "Construct a circuit from the given bytecode (in particular, expand black box "
                                         "functions) and return the gate count information.");

    add_bytecode_path_option(gates);

    /***************************************************************************************************************
     * Subcommnd: prove
     ***************************************************************************************************************/
    CLI::App* prove = app.add_subcommand("prove", "Generate a proof.");

    add_verbose_flag(prove);
    prove->needs(add_scheme_option(prove));
    add_crs_path_option(prove);
    add_oracle_hash_option(prove);
    add_output_data_option(prove);
    add_output_content_option(prove);
    add_input_type_option(prove);
    add_zk_option(prove);
    add_ipa_accumulation_flag(prove);
    add_init_kzg_accumulator_option(prove);

    prove->add_flag("--verify", "Verify the proof natively, resulting in a boolean output. Useful for testing.");

    add_bytecode_path_option(prove);
    add_witness_path_option(prove);
    add_output_path_option(prove);

    /***************************************************************************************************************
     * Subcommnd: write_vk
     ***************************************************************************************************************/
    CLI::App* write_vk =
        app.add_subcommand("write_vk",
                           "Write the verification key of a circuit. The circuit is constructed using "
                           "quickly generated but invalid witnesses (which must be supplied in Barretenberg in order "
                           "to expand ACIR black box opcodes), and no proof is constructed.");

    add_verbose_flag(write_vk);
    write_vk->needs(add_scheme_option(write_vk));
    add_output_data_option(write_vk);
    add_input_type_option(write_vk);
    add_crs_path_option(write_vk); // WORKTODO deprecated
    add_init_kzg_accumulator_option(write_vk);
    add_oracle_hash_option(write_vk);    // WORKTODO: why is this necessary?
    add_ipa_accumulation_flag(write_vk); // WORKTODO: segfault without

    add_bytecode_path_option(write_vk);
    add_output_path_option(write_vk);

    /***************************************************************************************************************
     * Subcommnd: verify
     ***************************************************************************************************************/
    CLI::App* verify = app.add_subcommand("verify", "Verify a proof.");

    add_verbose_flag(verify);
    verify->needs(add_scheme_option(verify));
    add_crs_path_option(verify);
    add_oracle_hash_option(verify);
    add_zk_option(verify);
    add_ipa_accumulation_flag(verify);
    add_init_kzg_accumulator_option(verify);

    add_proof_path_option(verify);
    add_vk_path_option(verify);

    /***************************************************************************************************************
     * Subcommand: contract
     ***************************************************************************************************************/
    CLI::App* contract = app.add_subcommand("contract",
                                            "Write a smart contract suitable for verifying proofs of circuit "
                                            "satisfiability for the circuit with verification key at vk_path. Not all "
                                            "hash types are implemented due to efficiency concerns.");

    /***************************************************************************************************************
     * Build app
     ***************************************************************************************************************/
    CLI11_PARSE(app, argc, argv);
    info(flags);

    // prob this construction is too much
    const auto execute_command = [&](API& api) {
        if (check_witness->parsed()) {
            api.check_witness(flags, bytecode_path, witness_path);
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
        if (contract->parsed()) {
            api.contract(flags, output_path, vk_path);
            return 0;
        }
        auto subcommands = app.get_subcommands();
        // ASSERT(subcommands.size()==1); // should already be constrained by CLI11 to be 0 or 1
        // WORKTODO: these are gratuitous right? Remove after dev
        throw_or_abort(std::format("No handler for subcommand {}", subcommands[0]->get_name()));
        return 1;
    };

    try {
        if (flags.scheme == "ultra_honk") {
            UltraHonkAPI api;
            return execute_command(api);
        }
        if (flags.scheme == "client_ivc") {
            ClientIVCAPI api;
            return execute_command(api);
        }
        throw_or_abort(std::format("No handler for  scheme {}", flags.scheme));
        return 1;
    } catch (const std::runtime_error& err) {
        std::cerr << err.what() << std::endl;
        return 1;
    }
}
