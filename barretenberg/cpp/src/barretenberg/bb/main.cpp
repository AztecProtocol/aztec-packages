#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wunused-variable"
#pragma GCC diagnostic ignored "-Wunused-but-set-variable"

#include "barretenberg/api/api.hpp"
#include "barretenberg/api/api_client_ivc.hpp"
#include "barretenberg/api/api_ultra_honk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bb11/cli11_formatter.hpp"
#include "barretenberg/common/benchmark.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/timer.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_proofs/acir_composer.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"

#ifndef DISABLE_AZTEC_VM
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/stats.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#endif

using namespace bb;

const std::filesystem::path current_path = std::filesystem::current_path();
const auto current_dir = current_path.filename().string();

// Initializes without loading G1
// TODO(https://github.com/AztecProtocol/barretenberg/issues/811) adapt for grumpkin
acir_proofs::AcirComposer verifier_init()
{
    acir_proofs::AcirComposer acir_composer(0, verbose_logging);
    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    return acir_composer;
}

std::string vk_to_json(std::vector<bb::fr> const& data)
{
    // We need to move vk_hash to the front...
    std::vector<bb::fr> rotated(data.begin(), data.end() - 1);
    rotated.insert(rotated.begin(), data.at(data.size() - 1));

    return format("[", join(map(rotated, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

// CLIENT IVC

/**
 * @brief Constructs a barretenberg circuit from program bytecode and reports the resulting gate counts
 * @details IVC circuits utilize the Mega arithmetization and a structured execution trace. This method reports the
 * number of each gate type present in the circuit vs the fixed max number allowed by the structured trace.
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 */
void gate_count_for_ivc(const std::string& bytecode_path)
{
    // All circuit reports will be built into the string below
    std::string functions_string = "{\"functions\": [\n  ";
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1181): Use enum for honk_recursion.
    auto constraint_systems = get_constraint_systems(bytecode_path, /*honk_recursion=*/0);

    // Initialize an SRS to make the ClientIVC constructor happy
    init_bn254_crs(1 << CONST_PG_LOG_N);
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
    TraceSettings trace_settings{ E2E_FULL_TEST_STRUCTURE };

    size_t i = 0;
    for (const auto& constraint_system : constraint_systems) {
        acir_format::AcirProgram program{ constraint_system };
        const auto& ivc_constraints = constraint_system.ivc_recursion_constraints;
        acir_format::ProgramMetadata metadata{ .ivc = ivc_constraints.empty() ? nullptr
                                                                              : create_mock_ivc_from_constraints(
                                                                                    ivc_constraints, trace_settings),
                                               .collect_gates_per_opcode = true };

        auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        size_t circuit_size = builder.num_gates;

        // Print the details of the gate types within the structured execution trace
        builder.blocks.set_fixed_block_sizes(trace_settings);
        builder.blocks.summarize();

        // Build individual circuit report
        std::string gates_per_opcode_str;
        for (size_t j = 0; j < program.constraints.gates_per_opcode.size(); j++) {
            gates_per_opcode_str += std::to_string(program.constraints.gates_per_opcode[j]);
            if (j != program.constraints.gates_per_opcode.size() - 1) {
                gates_per_opcode_str += ",";
            }
        }

        auto result_string = format("{\n        \"acir_opcodes\": ",
                                    program.constraints.num_acir_opcodes,
                                    ",\n        \"circuit_size\": ",
                                    circuit_size,
                                    ",\n        \"gates_per_opcode\": [",
                                    gates_per_opcode_str,
                                    "]\n  }");

        // Attach a comma if there are more circuit reports to generate
        if (i != (constraint_systems.size() - 1)) {
            result_string = format(result_string, ",");
        }

        functions_string = format(functions_string, result_string);

        i++;
    }
    functions_string = format(functions_string, "\n]}");

    const char* jsonData = functions_string.c_str();
    size_t length = strlen(jsonData);
    std::vector<uint8_t> data(jsonData, jsonData + length);
    write_bytes_to_stdout(data);
}

/**
 * @brief Computes the number of Barretenberg specific gates needed to create a proof for the specific ACIR circuit.
 *
 * Communication:
 * - stdout: A JSON string of the number of ACIR opcodes and final backend circuit size.
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1126): split this into separate Plonk and Honk functions as
 * their gate count differs
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 */
template <typename Builder = UltraCircuitBuilder>
void gate_count(const std::string& bytecode_path, bool recursive, uint32_t honk_recursion)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1180): Try to only do this when necessary.
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);

    // All circuit reports will be built into the string below
    std::string functions_string = "{\"functions\": [\n  ";
    auto constraint_systems = get_constraint_systems(bytecode_path, honk_recursion);

    const acir_format::ProgramMetadata metadata{ .recursive = recursive,
                                                 .honk_recursion = honk_recursion,
                                                 .collect_gates_per_opcode = true };
    size_t i = 0;
    for (const auto& constraint_system : constraint_systems) {
        acir_format::AcirProgram program{ constraint_system };
        auto builder = acir_format::create_circuit<Builder>(program, metadata);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        size_t circuit_size = builder.num_gates;
        vinfo("Calculated circuit size in gate_count: ", circuit_size);

        // Build individual circuit report
        std::string gates_per_opcode_str;
        for (size_t j = 0; j < program.constraints.gates_per_opcode.size(); j++) {
            gates_per_opcode_str += std::to_string(program.constraints.gates_per_opcode[j]);
            if (j != program.constraints.gates_per_opcode.size() - 1) {
                gates_per_opcode_str += ",";
            }
        }

        auto result_string = format("{\n        \"acir_opcodes\": ",
                                    program.constraints.num_acir_opcodes,
                                    ",\n        \"circuit_size\": ",
                                    circuit_size,
                                    ",\n        \"gates_per_opcode\": [",
                                    gates_per_opcode_str,
                                    "]\n  }");

        // Attach a comma if there are more circuit reports to generate
        if (i != (constraint_systems.size() - 1)) {
            result_string = format(result_string, ",");
        }

        functions_string = format(functions_string, result_string);

        i++;
    }
    functions_string = format(functions_string, "\n]}");

    const char* jsonData = functions_string.c_str();
    size_t length = strlen(jsonData);
    std::vector<uint8_t> data(jsonData, jsonData + length);
    write_bytes_to_stdout(data);
}

/**
 * @brief Write an arbitrary but valid ClientIVC proof and VK to files
 * @details used to test the prove_tube flow
 *
 * @param flags
 * @param output_dir
 */
void write_arbitrary_valid_client_ivc_proof_and_vk_to_file(const std::filesystem::path& output_dir)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
    init_bn254_crs(1 << CONST_PG_LOG_N);
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);

    ClientIVC ivc{ { CLIENT_IVC_BENCH_STRUCTURE } };

    // Construct and accumulate a series of mocked private function execution circuits
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    size_t NUM_CIRCUITS = 2;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit);
    }

    ClientIVC::Proof proof = ivc.prove();

    // Write the proof and verification keys into the working directory in 'binary' format
    vinfo("writing ClientIVC proof and vk...");
    write_file(output_dir / "proof", to_buffer(proof));

    auto eccvm_vk = std::make_shared<ECCVMFlavor::VerificationKey>(ivc.goblin.get_eccvm_proving_key());
    auto translator_vk = std::make_shared<TranslatorFlavor::VerificationKey>(ivc.goblin.get_translator_proving_key());
    write_file(output_dir / "vk", to_buffer(ClientIVC::VerificationKey{ ivc.honk_vk, eccvm_vk, translator_vk }));
};

// ULTRA HONK
/**
 * @brief Write a toml file containing recursive verifier inputs for a given program + witness
 *
 * @tparam Flavor
 * @param bytecode_path Path to the file containing the serialized circuit
 * @param witness_path Path to the file containing the serialized witness
 * @param output_path Path to write toml file
 */
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1172): update the flow to generate recursion inputs for
// double_verify_honk_proof as well
template <IsUltraFlavor Flavor>
void write_recursion_inputs_ultra_honk(const std::string& bytecode_path,
                                       const std::string& witness_path,
                                       const std::string& output_path)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;

    uint32_t honk_recursion = 0;
    bool ipa_accumulation = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
        init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
        ipa_accumulation = true;
    }
    const acir_format::ProgramMetadata metadata{ .recursive = true, .honk_recursion = honk_recursion };

    acir_format::AcirProgram program;
    program.constraints = get_constraint_system(bytecode_path, metadata.honk_recursion);
    program.witness = get_witness(witness_path);
    auto builder = acir_format::create_circuit<Builder>(program, metadata);

    // Construct Honk proof and verification key
    Prover prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    std::vector<FF> proof = prover.construct_proof();
    VerificationKey verification_key(prover.proving_key->proving_key);

    // Construct a string with the content of the toml file (vk hash, proof, public inputs, vk)
    const std::string toml_content =
        acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(proof, verification_key, ipa_accumulation);

    // Write all components to the TOML file
    const std::string toml_path = output_path + "/Prover.toml";
    write_file(toml_path, { toml_content.begin(), toml_content.end() });
}

// ULTRA PLONK

/**
 * @brief Creates a proof for an ACIR circuit
 *
 * Communication:
 * - stdout: The proof is written to stdout as a byte array
 * - Filesystem: The proof is written to the path specified by output_path
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 * @param witness_path Path to the file containing the serialized witness
 * @param output_path Path to write the proof to
 * @param recursive Whether to use recursive proof generation of non-recursive
 */
void prove_ultra_plonk(const std::string& bytecode_path,
                       const std::string& witness_path,
                       const std::string& output_path,
                       const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecode_path, /*honk_recursion=*/0);
    auto witness = get_witness(witness_path);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive, witness);
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    acir_composer.init_proving_key();
    auto proof = acir_composer.create_proof();

    if (output_path == "-") {
        write_bytes_to_stdout(proof);
        vinfo("proof written to stdout");
    } else {
        write_file(output_path, proof);
        vinfo("proof written to: ", output_path);
    }
}

/**
 * @brief Creates a proof for an ACIR circuit, outputs the proof and verification key in binary and 'field' format
 *
 * Communication:
 * - Filesystem: The proof is written to the path specified by output_path
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 * @param witness_path Path to the file containing the serialized witness
 * @param output_path Directory into which we write the proof and verification key data
 * @param recursive Whether to a build SNARK friendly proof
 */
void prove_output_all_ultra_plonk(const std::string& bytecode_path,
                                  const std::string& witness_path,
                                  const std::string& output_path,
                                  const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecode_path, /*honk_recursion=*/0);
    auto witness = get_witness(witness_path);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive, witness);
    acir_composer.finalize_circuit();
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    acir_composer.init_proving_key();
    auto proof = acir_composer.create_proof();

    // We have been given a directory, we will write the proof and verification key
    // into the directory in both 'binary' and 'fields' formats
    std::string vk_output_path = output_path + "/vk";
    std::string proof_path = output_path + "/proof";
    std::string vk_fields_output_path = output_path + "/vk_fields.json";
    std::string proof_field_path = output_path + "/proof_fields.json";

    std::shared_ptr<bb::plonk::verification_key> vk = acir_composer.init_verification_key();

    // Write the 'binary' proof
    write_file(proof_path, proof);
    vinfo("proof written to: ", proof_path);

    // Write the proof as fields
    auto proofAsFields = acir_composer.serialize_proof_into_fields(proof, vk->as_data().num_public_inputs);
    std::string proof_json = to_json(proofAsFields);
    write_file(proof_field_path, { proof_json.begin(), proof_json.end() });
    info("proof as fields written to: ", proof_field_path);

    // Write the vk as binary
    auto serialized_vk = to_buffer(*vk);
    write_file(vk_output_path, serialized_vk);
    vinfo("vk written to: ", vk_output_path);

    // Write the vk as fields
    auto data = acir_composer.serialize_verification_key_into_fields();
    std::string vk_json = vk_to_json(data);
    write_file(vk_fields_output_path, { vk_json.begin(), vk_json.end() });
    vinfo("vk as fields written to: ", vk_fields_output_path);
}

/**
 * @brief Verifies a proof for an ACIR circuit
 *
 * Note: The fact that the proof was computed originally by parsing an ACIR circuit is not of importance
 * because this method uses the verification key to verify the proof.
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param vk_path Path to the file containing the serialized verification key
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
bool verify_ultra_plonk(const std::string& proof_path, const std::string& vk_path)
{
    auto acir_composer = verifier_init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    acir_composer.load_verification_key(std::move(vk_data));
    auto verified = acir_composer.verify_proof(read_file(proof_path));

    vinfo("verified: ", verified);
    return verified;
}

/**
 * @brief Proves and verifies an ACIR circuit
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 * @param witness_path Path to the file containing the serialized witness
 * @param recursive Whether to use recursive proof generation of non-recursive
 * @return true if the proof is valid
 * @return false if the proof is invalid
 */
bool prove_and_verify_ultra_plonk(const std::string& bytecode_path,
                                  const bool recursive,
                                  const std::string& witness_path)
{
    auto constraint_system = get_constraint_system(bytecode_path, /*honk_recursion=*/0);
    auto witness = get_witness(witness_path);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive, witness);
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());

    Timer pk_timer;
    acir_composer.init_proving_key();
    write_benchmark("pk_construction_time", pk_timer.milliseconds(), "acir_test", current_dir);

    write_benchmark("gate_count", acir_composer.get_finalized_total_circuit_size(), "acir_test", current_dir);
    write_benchmark("subgroup_size", acir_composer.get_finalized_dyadic_circuit_size(), "acir_test", current_dir);

    Timer proof_timer;
    auto proof = acir_composer.create_proof();
    write_benchmark("proof_construction_time", proof_timer.milliseconds(), "acir_test", current_dir);

    Timer vk_timer;
    acir_composer.init_verification_key();
    write_benchmark("vk_construction_time", vk_timer.milliseconds(), "acir_test", current_dir);

    auto verified = acir_composer.verify_proof(proof);

    return verified;
}

/**
 * @brief Writes a Solidity verifier contract for an ACIR circuit to a file
 *
 * Communication:
 * - stdout: The Solidity verifier contract is written to stdout as a string
 * - Filesystem: The Solidity verifier contract is written to the path specified by output_path
 *
 * Note: The fact that the contract was computed is for an ACIR circuit is not of importance
 * because this method uses the verification key to compute the Solidity verifier contract
 *
 * @param output_path Path to write the contract to
 * @param vk_path Path to the file containing the serialized verification key
 */
void contract_ultra_plonk(const std::string& output_path, const std::string& vk_path)
{
    auto acir_composer = verifier_init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    acir_composer.load_verification_key(std::move(vk_data));
    auto contract = acir_composer.get_solidity_verifier();

    if (output_path == "-") {
        write_string_to_stdout(contract);
        vinfo("contract written to stdout");
    } else {
        write_file(output_path, { contract.begin(), contract.end() });
        vinfo("contract written to: ", output_path);
    }
}

/**
 * @brief Writes a verification key for an ACIR circuit to a file
 *
 * Communication:
 * - stdout: The verification key is written to stdout as a byte array
 * - Filesystem: The verification key is written to the path specified by output_path
 *
 * @param bytecode_path Path to the file containing the serialized circuit
 * @param output_path Path to write the verification key to
 * @param recursive Whether to create a SNARK friendly circuit and key
 */
void write_vk_ultra_plonk(const std::string& bytecode_path, const std::string& output_path, const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecode_path, false);
    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive);
    acir_composer.finalize_circuit();
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    acir_composer.init_proving_key();
    auto vk = acir_composer.init_verification_key();
    auto serialized_vk = to_buffer(*vk);
    if (output_path == "-") {
        write_bytes_to_stdout(serialized_vk);
        vinfo("vk written to stdout");
    } else {
        write_file(output_path, serialized_vk);
        vinfo("vk written to: ", output_path);
    }
}

void write_pk_ultra_plonk(const std::string& bytecode_path, const std::string& output_path, const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecode_path, /*honk_recursion=*/0);
    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive);
    acir_composer.finalize_circuit();
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    auto pk = acir_composer.init_proving_key();
    auto serialized_pk = to_buffer(*pk);

    if (output_path == "-") {
        write_bytes_to_stdout(serialized_pk);
        vinfo("pk written to stdout");
    } else {
        write_file(output_path, serialized_pk);
        vinfo("pk written to: ", output_path);
    }
}

/**
 * @brief Converts a proof from a byte array into a list of field elements
 *
 * Why is this needed?
 *
 * The proof computed by the non-recursive proof system is a byte array. This is fine since the proof will be
 * verified either natively or in a Solidity verifier. For the recursive proof system, the proof is verified in a
 * circuit where it is cheaper to work with field elements than byte arrays. This method converts the proof into a
 * list of field elements which can be used in the recursive proof system.
 *
 * This is an optimization which unfortunately leaks through the API. The repercussions of this are that users need
 * to convert proofs which are byte arrays to proofs which are lists of field elements, using the below method.
 *
 * Ideally, we find out what is the cost to convert this in the circuit and if it is not too expensive, we pass the
 * byte array directly to the circuit and convert it there. This also applies to the `vkAsFields` method.
 *
 * Communication:
 * - stdout: The proof as a list of field elements is written to stdout as a string
 * - Filesystem: The proof as a list of field elements is written to the path specified by output_path
 *
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param vk_path Path to the file containing the serialized verification key
 * @param output_path Path to write the proof to
 */
void proof_as_fields(const std::string& proof_path, std::string const& vk_path, const std::string& output_path)
{
    auto acir_composer = verifier_init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    auto data = acir_composer.serialize_proof_into_fields(read_file(proof_path), vk_data.num_public_inputs);
    auto json = to_json(data);

    if (output_path == "-") {
        write_string_to_stdout(json);
        vinfo("proof as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("proof as fields written to: ", output_path);
    }
}

/**
 * @brief Converts a verification key from a byte array into a list of field elements
 *
 * Why is this needed?
 * This follows the same rationale as `proofAsFields`.
 *
 * Communication:
 * - stdout: The verification key as a list of field elements is written to stdout as a string
 * - Filesystem: The verification key as a list of field elements is written to the path specified by output_path
 *
 * @param vk_path Path to the file containing the serialized verification key
 * @param output_path Path to write the verification key to
 */
void vk_as_fields(const std::string& vk_path, const std::string& output_path)
{
    auto acir_composer = verifier_init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    acir_composer.load_verification_key(std::move(vk_data));
    auto data = acir_composer.serialize_verification_key_into_fields();

    auto json = vk_to_json(data);
    if (output_path == "-") {
        write_string_to_stdout(json);
        vinfo("vk as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("vk as fields written to: ", output_path);
    }
}

/**
 * @brief Creates a Honk Proof for the Tube circuit responsible for recursively verifying a ClientIVC proof.
 *
 * @param output_path the working directory from which the proof and verification data are read
 * @param num_unused_public_inputs
 */
void prove_tube(const std::string& output_path)
{
    using namespace stdlib::recursion::honk;

    using Builder = UltraCircuitBuilder;
    using GrumpkinVk = bb::VerifierCommitmentKey<curve::Grumpkin>;

    std::string vkPath = output_path + "/vk";
    std::string proof_path = output_path + "/proof";

    // Note: this could be decreased once we optimise the size of the ClientIVC recursiveve rifier
    init_bn254_crs(1 << 25);
    init_grumpkin_crs(1 << 18);

    // Read the proof  and verification data from given files
    auto proof = from_buffer<ClientIVC::Proof>(read_file(proof_path));
    auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(vkPath));

    // We don't serialise and deserialise the Grumkin SRS so initialise with circuit_size + 1 to be able to recursively
    // IPA. The + 1 is to satisfy IPA verification key requirements.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1025)
    vk.eccvm->pcs_verification_key = std::make_shared<GrumpkinVk>(vk.eccvm->circuit_size + 1);

    auto builder = std::make_shared<Builder>();

    // Preserve the public inputs that should be passed to the base rollup by making them public inputs to the tube
    // circuit
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1048): INSECURE - make this tube proof actually use
    // these public inputs by turning proof into witnesses and calling set_public on each witness
    auto num_inner_public_inputs = static_cast<uint32_t>(static_cast<uint256_t>(proof.mega_proof[1]));
    num_inner_public_inputs -= bb::PAIRING_POINT_ACCUMULATOR_SIZE; // don't add the agg object

    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        auto offset = bb::HONK_PROOF_PUBLIC_INPUT_OFFSET;
        builder->add_public_variable(proof.mega_proof[i + offset]);
    }
    ClientIVCRecursiveVerifier verifier{ builder, vk };

    ClientIVCRecursiveVerifier::Output client_ivc_rec_verifier_output = verifier.verify(proof);

    PairingPointAccumulatorIndices current_aggregation_object =
        stdlib::recursion::init_default_agg_obj_indices<Builder>(*builder);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): Add aggregation to goblin recursive verifiers.
    // This is currently just setting the aggregation object to the default one.
    builder->add_pairing_point_accumulator(current_aggregation_object);

    // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
    builder->add_ipa_claim(client_ivc_rec_verifier_output.opening_claim.get_witness_indices());
    builder->ipa_proof = convert_stdlib_proof_to_native(client_ivc_rec_verifier_output.ipa_transcript->proof_data);
    ASSERT(builder->ipa_proof.size() && "IPA proof should not be empty");

    using Prover = UltraProver_<UltraRollupFlavor>;
    using Verifier = UltraVerifier_<UltraRollupFlavor>;
    Prover tube_prover{ *builder };
    auto tube_proof = tube_prover.construct_proof();
    std::string tubeProofPath = output_path + "/proof";
    write_file(tubeProofPath, to_buffer<true>(tube_proof));

    std::string tubeProofAsFieldsPath = output_path + "/proof_fields.json";
    auto proof_data = to_json(tube_proof);
    write_file(tubeProofAsFieldsPath, { proof_data.begin(), proof_data.end() });

    std::string tubeVkPath = output_path + "/vk";
    auto tube_verification_key =
        std::make_shared<typename UltraRollupFlavor::VerificationKey>(tube_prover.proving_key->proving_key);
    write_file(tubeVkPath, to_buffer(tube_verification_key));

    std::string tubeAsFieldsVkPath = output_path + "/vk_fields.json";
    auto field_els = tube_verification_key->to_field_elements();
    info("verificaton key length in fields:", field_els.size());
    auto data = to_json(field_els);
    write_file(tubeAsFieldsVkPath, { data.begin(), data.end() });

    info("Native verification of the tube_proof");
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    Verifier tube_verifier(tube_verification_key, ipa_verification_key);

    // Break up the tube proof into the honk portion and the ipa portion
    const size_t HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS =
        UltraRollupFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + PAIRING_POINT_ACCUMULATOR_SIZE + IPA_CLAIM_SIZE;
    // The extra calculation is for the IPA proof length.
    ASSERT(tube_proof.size() == HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS + num_inner_public_inputs);
    // split out the ipa proof
    const std::ptrdiff_t honk_proof_with_pub_inputs_length = static_cast<std::ptrdiff_t>(
        HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS - IPA_PROOF_LENGTH + num_inner_public_inputs);
    auto ipa_proof = HonkProof(tube_proof.begin() + honk_proof_with_pub_inputs_length, tube_proof.end());
    auto tube_honk_proof = HonkProof(tube_proof.begin(), tube_proof.end() + honk_proof_with_pub_inputs_length);
    bool verified = tube_verifier.verify_proof(tube_honk_proof, ipa_proof);
    info("Tube proof verification: ", verified);
}

// AVM

#ifndef DISABLE_AZTEC_VM
void print_avm_stats()
{
#ifdef AVM_TRACK_STATS
    info("------- STATS -------");
    const auto& stats = avm_trace::Stats::get();
    const int levels = std::getenv("AVM_STATS_DEPTH") != nullptr ? std::stoi(std::getenv("AVM_STATS_DEPTH")) : 2;
    info(stats.to_string(levels));
#endif
}

/**
 * @brief Performs "check circuit" on the AVM circuit for the given public inputs and hints.
 *
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 */
void avm_check_circuit(const std::filesystem::path& public_inputs_path, const std::filesystem::path& hints_path)
{

    const auto avm_public_inputs = AvmPublicInputs::from(read_file(public_inputs_path));
    const auto avm_hints = bb::avm_trace::ExecutionHints::from(read_file(hints_path));
    avm_hints.print_sizes();

    vinfo("initializing crs with size: ", avm_trace::Execution::SRS_SIZE);
    init_bn254_crs(avm_trace::Execution::SRS_SIZE);

    avm_trace::Execution::check_circuit(avm_public_inputs, avm_hints);

    print_avm_stats();
}

/**
 * @brief Writes an avm proof and corresponding (incomplete) verification key to files.
 *
 * Communication:
 * - Filesystem: The proof and vk are written to the paths output_path/proof and output_path/{vk, vk_fields.json}
 *
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 * @param output_path Path (directory) to write the output proof and verification keys
 */
void avm_prove(const std::filesystem::path& public_inputs_path,
               const std::filesystem::path& hints_path,
               const std::filesystem::path& output_path)
{

    const auto avm_public_inputs = AvmPublicInputs::from(read_file(public_inputs_path));
    const auto avm_hints = bb::avm_trace::ExecutionHints::from(read_file(hints_path));
    avm_hints.print_sizes();

    vinfo("initializing crs with size: ", avm_trace::Execution::SRS_SIZE);
    init_bn254_crs(avm_trace::Execution::SRS_SIZE);

    // Prove execution and return vk
    auto const [verification_key, proof] =
        AVM_TRACK_TIME_V("prove/all", avm_trace::Execution::prove(avm_public_inputs, avm_hints));

    std::vector<fr> vk_as_fields = verification_key.to_field_elements();

    vinfo("vk fields size: ", vk_as_fields.size());
    vinfo("circuit size: ", static_cast<uint64_t>(vk_as_fields[0]));
    vinfo("num of pub inputs: ", static_cast<uint64_t>(vk_as_fields[1]));

    std::string vk_json = to_json(vk_as_fields);
    const auto proof_path = output_path / "proof";
    const auto vk_path = output_path / "vk";
    const auto vk_fields_path = output_path / "vk_fields.json";

    write_file(proof_path, to_buffer(proof));
    vinfo("proof written to: ", proof_path);
    write_file(vk_path, to_buffer(vk_as_fields));
    vinfo("vk written to: ", vk_path);
    write_file(vk_fields_path, { vk_json.begin(), vk_json.end() });
    vinfo("vk as fields written to: ", vk_fields_path);

    print_avm_stats();
}

void avm2_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));

    // This is bigger than CIRCUIT_SUBGROUP_SIZE because of BB inefficiencies.
    init_bn254_crs(avm2::CIRCUIT_SUBGROUP_SIZE * 2);
    auto [proof, vk] = avm.prove(inputs);

    // NOTE: As opposed to Avm1 and other proof systems, the public inputs are NOT part of the proof.
    write_file(output_path / "proof", to_buffer(proof));
    write_file(output_path / "vk", vk);

    print_avm_stats();
}

void avm2_check_circuit(const std::filesystem::path& inputs_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));

    bool res = avm.check_circuit(inputs);
    info("circuit check: ", res ? "success" : "failure");

    print_avm_stats();
}

/**
 * @brief Verifies an avm proof and writes the result to stdout
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param vk_path Path to the file containing the serialized verification key
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
bool avm_verify(const std::filesystem::path& proof_path, const std::filesystem::path& vk_path)
{
    using Commitment = bb::avm::AvmFlavorSettings::Commitment;
    std::vector<fr> const proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    std::vector<fr> vk_as_fields = many_from_buffer<fr>(vk_bytes);

    vinfo("initializing crs with size: ", 1);
    init_bn254_crs(1);

    auto circuit_size = uint64_t(vk_as_fields[0]);
    auto num_public_inputs = uint64_t(vk_as_fields[1]);
    std::span vk_span(vk_as_fields);

    vinfo("vk fields size: ", vk_as_fields.size());
    vinfo("circuit size: ", circuit_size, " (next or eq power: 2^", numeric::round_up_power_2(circuit_size), ")");
    vinfo("num of pub inputs: ", num_public_inputs);

    if (vk_as_fields.size() != AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS) {
        info("The supplied avm vk has incorrect size. Number of fields: ",
             vk_as_fields.size(),
             " but expected: ",
             AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS);
        return false;
    }

    std::array<Commitment, bb::avm::AvmFlavor::NUM_PRECOMPUTED_ENTITIES> precomputed_cmts;
    for (size_t i = 0; i < bb::avm::AvmFlavor::NUM_PRECOMPUTED_ENTITIES; i++) {
        // Start at offset 2 and adds 4 (NUM_FRS_COM) fr elements per commitment. Therefore, index = 4 * i + 2.
        precomputed_cmts[i] = field_conversion::convert_from_bn254_frs<Commitment>(
            vk_span.subspan(bb::avm::AvmFlavor::NUM_FRS_COM * i + 2, bb::avm::AvmFlavor::NUM_FRS_COM));
    }

    auto vk = bb::avm::AvmFlavor::VerificationKey(circuit_size, num_public_inputs, precomputed_cmts);

    const bool verified = AVM_TRACK_TIME_V("verify/all", avm_trace::Execution::verify(vk, proof));
    vinfo("verified: ", verified);

    print_avm_stats();
    return verified;
}

// NOTE: The proof should NOT include the public inputs.
bool avm2_verify(const std::filesystem::path& proof_path,
                 const std::filesystem::path& public_inputs_path,
                 const std::filesystem::path& vk_path)
{
    const auto proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    auto public_inputs = avm2::PublicInputs::from(read_file(public_inputs_path));

    init_bn254_crs(1);
    avm2::AvmAPI avm;
    bool res = avm.verify(proof, public_inputs, vk_bytes);
    info("verification: ", res ? "success" : "failure");

    print_avm_stats();
    return res;
}
#endif

// Helper function to recursively print active subcommands for CLI11 app debugging
void print_active_subcommands(const CLI::App& app, const std::string& prefix = "command: ")
{
    // get_subcommands() returns a vector of pointers to subcommands
    for (auto subcmd : app.get_subcommands()) {
        // Check if this subcommand was activated (nonzero count)
        if (subcmd->count() > 0) {
            info(prefix, subcmd->get_name());
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

    API::Flags flags{}; // default initialize to start
    // Some paths, with defaults, that may or may not be set by commands
    std::filesystem::path bytecode_path{ "./target/program.json" };
    std::filesystem::path witness_path{ "./target/witness.gz" };
    std::filesystem::path output_path{
        "./out"
    }; // sometimes a directory where things will be written, sometimes the path of a file to be written
    std::filesystem::path proof_path{ "./target/proof" };
    std::filesystem::path vk_path{ "./target/vk" };
    flags.scheme = ""; //  WORKTODO: defaulting to ultra_honk leads to OLD_API being caught as unhandled
    flags.oracle_hash_type = "poseidon2";
    flags.output_data_type = "bytes";
    flags.crs_path = []() {
        char* home = std::getenv("HOME");
        std::filesystem::path base = home != nullptr ? std::filesystem::path(home) : "./";
        return base / ".bb-crs";
    }();

    /***************************************************************************************************************
     * Subcommand: OLD FLAG INFO
     ***************************************************************************************************************/

    // // const std::string bytecode_path = get_option(args, "-b", "./target/program.json");
    // std::string bytecode_path = "./target/program.json";
    // // const std::string witness_path = get_option(args, "-w", "./target/witness.gz");
    // std::string witness_path = "./target/witness.gz";
    // // const std::string proof_path = get_option(args, "-p", "./target/proof");
    // std::string proof_path = "./target/proof";
    // // const std::string vk_path = get_option(args, "-k", "./target/vk");
    // std::string vk_path = "./target/vk";

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
            ->check(CLI::IsMember({ "client_ivc", "avm", "tube", "ultra_honk", "ultra_keccak_honk", "ultra_plonk" })
                        .name("is_member"));
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
            /* ->check(CLI::ExistingFile) OR stdin indicator - */;
    };

    // WORKTODO: documentation of structure (JSON or msgpack of bytecodes; bytecodes are encoded...)
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
        return subcommand->add_flag(
            "--debug_logging, --debug_logging_logging, -d", debug_logging, "Output debug logs to stderr.");
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
     * Subcommand: check_witness
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

    add_verbose_flag(gates);
    add_bytecode_path_option(gates);

    /***************************************************************************************************************
     * Subcommand: prove
     ***************************************************************************************************************/
    CLI::App* prove = app.add_subcommand("prove", "Generate a proof.");

    add_verbose_flag(prove);
    add_scheme_option(prove);
    add_crs_path_option(prove);
    add_oracle_hash_option(prove);
    add_output_data_option(prove);
    add_output_content_option(prove)->default_val("proof");
    add_input_type_option(prove);
    add_zk_option(prove);
    add_ipa_accumulation_flag(prove);
    add_init_kzg_accumulator_option(prove);
    add_honk_recursion_option(prove);
    add_bytecode_path_option(prove);
    add_witness_path_option(prove);
    add_output_path_option(prove, output_path);
    add_recursive_flag(prove);

    prove->add_flag("--verify", "Verify the proof natively, resulting in a boolean output. Useful for testing.");

    /***************************************************************************************************************
     * Subcommand: write_vk
     ***************************************************************************************************************/
    CLI::App* write_vk =
        app.add_subcommand("write_vk",
                           "Write the verification key of a circuit. The circuit is constructed using "
                           "quickly generated but invalid witnesses (which must be supplied in Barretenberg in order "
                           "to expand ACIR black box opcodes), and no proof is constructed.");

    add_verbose_flag(write_vk);
    add_scheme_option(write_vk);
    add_output_data_option(write_vk);
    add_input_type_option(write_vk);
    add_crs_path_option(write_vk); // WORKTODO deprecated
    add_init_kzg_accumulator_option(write_vk);
    add_oracle_hash_option(write_vk);    // WORKTODO: why is this necessary?
    add_ipa_accumulation_flag(write_vk); // WORKTODO: segfault without
    add_honk_recursion_option(write_vk);
    add_recursive_flag(write_vk);

    add_bytecode_path_option(write_vk);
    add_output_path_option(write_vk, output_path);

    /***************************************************************************************************************
     * Subcommand: verify
     ***************************************************************************************************************/
    CLI::App* verify = app.add_subcommand("verify", "Verify a proof.");

    add_verbose_flag(verify);
    add_scheme_option(verify);
    add_crs_path_option(verify);
    add_oracle_hash_option(verify);
    add_zk_option(verify);
    add_ipa_accumulation_flag(verify);
    add_init_kzg_accumulator_option(verify);
    add_honk_recursion_option(verify);
    add_recursive_flag(verify);

    add_proof_path_option(verify);
    add_vk_path_option(verify);

    /***************************************************************************************************************
     * Subcommand: contract
     ***************************************************************************************************************/
    CLI::App* contract = app.add_subcommand("contract",
                                            "Write a smart contract suitable for verifying proofs of circuit "
                                            "satisfiability for the circuit with verification key at vk_path. Not all "
                                            "hash types are implemented due to efficiency concerns.");
    add_verbose_flag(contract);
    add_scheme_option(contract);
    add_crs_path_option(contract);
    add_zk_option(contract);
    add_vk_path_option(contract);
    add_output_path_option(contract, output_path);

    /***************************************************************************************************************
     * Subcommand: OLD_API
     ***************************************************************************************************************/
    CLI::App* OLD_API = app.add_subcommand("OLD_API", "Access some old API commands");

    /***************************************************************************************************************
     * Subcommand: OLD_API gates_for_ivc
     ***************************************************************************************************************/
    CLI::App* OLD_API_gates_for_ivc = OLD_API->add_subcommand("gates_for_ivc", "IOU");
    add_verbose_flag(OLD_API_gates_for_ivc);
    add_debug_flag(OLD_API_gates_for_ivc);
    add_crs_path_option(OLD_API_gates_for_ivc);
    add_bytecode_path_option(OLD_API_gates_for_ivc);

    /***************************************************************************************************************
     * Subcommand: OLD_API gates_mega_honk
     ***************************************************************************************************************/
    CLI::App* OLD_API_gates_mega_honk = OLD_API->add_subcommand("gates_mega_honk", "IOU");
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
        OLD_API->add_subcommand("write_arbitrary_valid_client_ivc_proof_and_vk_to_file", "IOU");
    add_verbose_flag(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file);
    add_debug_flag(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file);
    add_crs_path_option(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file);
    std::string arbitrary_valid_proof_path{ "./proofs/proof" };
    add_output_path_option(OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file, arbitrary_valid_proof_path);

    /***************************************************************************************************************
     * Subcommand: OLD_API write_recursion_inputs_ultra_honk
     ***************************************************************************************************************/
    CLI::App* OLD_API_write_recursion_inputs_ultra_honk =
        OLD_API->add_subcommand("write_recursion_inputs_ultra_honk", "IOU");
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
    CLI::App* OLD_API_gates = OLD_API->add_subcommand("gates", "IOU");
    add_verbose_flag(OLD_API_gates);
    add_debug_flag(OLD_API_gates);
    add_crs_path_option(OLD_API_gates);
    add_recursive_flag(OLD_API_gates);
    add_honk_recursion_option(OLD_API_gates);
    add_bytecode_path_option(OLD_API_gates);

    /***************************************************************************************************************
     * Subcommand: OLD_API prove
     ***************************************************************************************************************/
    CLI::App* OLD_API_prove = OLD_API->add_subcommand("prove", "IOU");
    add_verbose_flag(OLD_API_prove);
    add_debug_flag(OLD_API_prove);
    add_crs_path_option(OLD_API_prove);
    add_recursive_flag(OLD_API_prove);
    std::string plonk_prove_output_path{ "./proofs/proof" };
    add_output_path_option(OLD_API_prove, plonk_prove_output_path);
    add_bytecode_path_option(OLD_API_prove);

    /***************************************************************************************************************
     * Subcommand: OLD_API prove_output_all
     ***************************************************************************************************************/
    CLI::App* OLD_API_prove_output_all = OLD_API->add_subcommand("prove_output_all", "IOU");
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
    CLI::App* OLD_API_verify = OLD_API->add_subcommand("verify", "IOU");
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
    CLI::App* OLD_API_prove_and_verify = OLD_API->add_subcommand("prove_and_verify", "IOU");
    add_verbose_flag(OLD_API_prove_and_verify);
    add_debug_flag(OLD_API_prove_and_verify);
    add_crs_path_option(OLD_API_prove_and_verify);
    add_recursive_flag(OLD_API_prove_and_verify);
    add_bytecode_path_option(OLD_API_prove_and_verify);

    /***************************************************************************************************************
     * Subcommand: OLD_API contract
     ***************************************************************************************************************/
    CLI::App* OLD_API_contract = OLD_API->add_subcommand("contract", "IOU");
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
    CLI::App* OLD_API_write_vk = OLD_API->add_subcommand("write_vk", "IOU");
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
    CLI::App* OLD_API_write_pk = OLD_API->add_subcommand("write_pk", "IOU");
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
    CLI::App* OLD_API_proof_as_fields = OLD_API->add_subcommand("proof_as_fields", "IOU");
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
    CLI::App* OLD_API_vk_as_fields = OLD_API->add_subcommand("vk_as_fields", "IOU");
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
    add_avm_dump_trace_option(avm_check_circuit_command);

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
    add_avm_hints_option(avm_prove_command);
    add_avm_public_inputs_option(avm_prove_command);
    add_avm_dump_trace_option(avm_prove_command);

    /***************************************************************************************************************
     * Subcommand: avm_verify
     ***************************************************************************************************************/
    CLI::App* avm_verify_command = app.add_subcommand("avm_verify", "");
    avm_verify_command->group(""); // hide from list of subcommands
    add_verbose_flag(avm_verify_command);
    add_debug_flag(avm_verify_command);
    add_crs_path_option(avm_verify_command);
#endif

    /***************************************************************************************************************
     * Subcommand: OLD_API prove_tube
     ***************************************************************************************************************/
    CLI ::App* OLD_API_prove_tube = OLD_API->add_subcommand("prove_tube", "");
    add_verbose_flag(OLD_API_prove_tube);
    add_debug_flag(OLD_API_prove_tube);
    add_crs_path_option(OLD_API_prove_tube);
    std::string prove_tube_output_path{ "./target" };
    add_output_path_option(OLD_API_prove_tube, prove_tube_output_path);

    /***************************************************************************************************************
     * Subcommand: OLD_API verify_tube
     ***************************************************************************************************************/
    CLI::App* OLD_API_verify_tube = OLD_API->add_subcommand("verify_tube", "IOU");
    add_verbose_flag(OLD_API_verify_tube);
    add_debug_flag(OLD_API_verify_tube);
    add_crs_path_option(OLD_API_verify_tube);
    // WORKTODO doesn't make sense that this is set by -o but that's how it was
    std::string tube_proof_and_vk_path{ "./target" };
    add_output_path_option(OLD_API_verify_tube, tube_proof_and_vk_path);

    /***************************************************************************************************************
     * Build the CLI11 App
     ***************************************************************************************************************/

    CLI11_PARSE(app, argc, argv);
    print_active_subcommands(app);
    info(flags);
    verbose_logging = debug_logging || flags.verbose;
    info("bytecode_path: ", bytecode_path);
    info("output_path: ", output_path);

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
        throw_or_abort(std::format("No handler for subcommand {}", subcommands[0]->get_name()));
        return 1;
    };

    try {
        if (version->parsed()) {
            write_string_to_stdout(BB_VERSION);
            return 0;
        }
        // CLIENT IVC
        else if (flags.scheme == "client_ivc") {
            ClientIVCAPI api;
            return execute_command(api);
        } else if (OLD_API_gates_for_ivc->parsed()) {
            gate_count_for_ivc(bytecode_path);
        } else if (OLD_API_gates_mega_honk->parsed()) {
            gate_count<MegaCircuitBuilder>(bytecode_path, flags.recursive, flags.honk_recursion);
        } else if (OLD_API_write_arbitrary_valid_client_ivc_proof_and_vk_to_file->parsed()) {
            write_arbitrary_valid_client_ivc_proof_and_vk_to_file(arbitrary_valid_proof_path);
            return 0;
        }
        // ULTRA HONK
        else if (flags.scheme == "ultra_honk") {
            UltraHonkAPI api;
            return execute_command(api);
        } else if (OLD_API_write_recursion_inputs_ultra_honk->parsed()) {
            if (flags.ipa_accumulation) {
                write_recursion_inputs_ultra_honk<UltraRollupFlavor>(
                    bytecode_path, witness_path, recursion_inputs_output_path);
            } else {
                write_recursion_inputs_ultra_honk<UltraFlavor>(
                    bytecode_path, witness_path, recursion_inputs_output_path);
            }
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
        else if (OLD_API_prove_tube->parsed()) {
            prove_tube(prove_tube_output_path);
        } else if (OLD_API_verify_tube->parsed()) {
            auto tube_proof_path = tube_proof_and_vk_path + "/proof";
            auto tube_vk_path = tube_proof_and_vk_path + "/vk";
            UltraHonkAPI api;
            return api.verify({ .ipa_accumulation = true }, tube_proof_path, tube_vk_path) ? 0 : 1;
        } else {
            info("No match for API command");
            return 1;
        }
    } catch (std::runtime_error const& err) {
        std::cerr << err.what() << std::endl;
        return 1;
    }
}
