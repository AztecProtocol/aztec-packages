#include "barretenberg/bb/api.hpp"
#include "barretenberg/bb/api_client_ivc.hpp"
#include "barretenberg/bb/api_ultra_honk.hpp"
#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/common/benchmark.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/timer.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/acir_composer.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
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
bool prove_and_verify(const std::string& bytecode_path, const bool recursive, const std::string& witness_path)
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
void prove(const std::string& bytecode_path,
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
bool verify(const std::string& proof_path, const std::string& vk_path)
{
    auto acir_composer = verifier_init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    acir_composer.load_verification_key(std::move(vk_data));
    auto verified = acir_composer.verify_proof(read_file(proof_path));

    vinfo("verified: ", verified);
    return verified;
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
void write_vk(const std::string& bytecode_path, const std::string& output_path, const bool recursive)
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

void write_pk(const std::string& bytecode_path, const std::string& output_path, const bool recursive)
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
void contract(const std::string& output_path, const std::string& vk_path)
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

/**
 * @brief Compute and write to file a MegaHonk VK for a circuit to be accumulated in the IVC
 * @note This method differes from write_vk_honk<MegaFlavor> in that it handles kernel circuits which require special
 * treatment (i.e. construction of mock IVC state to correctly complete the kernel logic).
 *
 * @param bytecode_path
 * @param witness_path
 */
void write_vk_for_ivc(const std::string& bytecode_path, const std::string& output_path)
{
    using Builder = ClientIVC::ClientCircuit;
    using Prover = ClientIVC::MegaProver;
    using DeciderProvingKey = ClientIVC::DeciderProvingKey;
    using VerificationKey = ClientIVC::MegaVerificationKey;
    using Program = acir_format::AcirProgram;
    using ProgramMetadata = acir_format::ProgramMetadata;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
    init_bn254_crs(1 << CONST_PG_LOG_N);
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);

    Program program{ get_constraint_system(bytecode_path, /*honk_recursion=*/0), /*witness=*/{} };
    auto& ivc_constraints = program.constraints.ivc_recursion_constraints;

    TraceSettings trace_settings{ E2E_FULL_TEST_STRUCTURE };

    const ProgramMetadata metadata{ .ivc = ivc_constraints.empty()
                                               ? nullptr
                                               : create_mock_ivc_from_constraints(ivc_constraints, trace_settings) };
    Builder builder = acir_format::create_circuit<Builder>(program, metadata);

    // Add public inputs corresponding to pairing point accumulator
    builder.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(builder));

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    auto proving_key = std::make_shared<DeciderProvingKey>(builder, trace_settings);
    Prover prover{ proving_key };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    VerificationKey vk(prover.proving_key->proving_key);

    // Write the VK to file as a buffer
    auto serialized_vk = to_buffer(vk);
    if (output_path == "-") {
        write_bytes_to_stdout(serialized_vk);
        vinfo("vk written to stdout");
    } else {
        write_file(output_path, serialized_vk);
        vinfo("vk written to: ", output_path);
    }
}

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
void write_recursion_inputs_honk(const std::string& bytecode_path,
                                 const std::string& witness_path,
                                 const std::string& output_path,
                                 const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;

    ASSERT(recursive);

    uint32_t honk_recursion = 0;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
        init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
    }
    const acir_format::ProgramMetadata metadata{ .recursive = recursive, .honk_recursion = honk_recursion };

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
    std::string toml_content =
        acir_format::ProofSurgeon::construct_recursion_inputs_toml_data<Flavor>(proof, verification_key);

    // Write all components to the TOML file
    std::string toml_path = output_path + "/Prover.toml";
    write_file(toml_path, { toml_content.begin(), toml_content.end() });
}

/**
 * @brief Outputs proof as vector of field elements in readable format.
 *
 * Communication:
 * - stdout: The proof as a list of field elements is written to stdout as a string
 * - Filesystem: The proof as a list of field elements is written to the path specified by output_path
 *
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param output_path Path to write the proof to
 */
void proof_as_fields_honk(const std::string& proof_path, const std::string& output_path)
{
    auto proof = from_buffer<std::vector<bb::fr>>(read_file(proof_path));
    auto json = to_json(proof);

    if (output_path == "-") {
        write_string_to_stdout(json);
        vinfo("proof as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("proof as fields written to: ", output_path);
    }
}

/**
 * @brief Converts a verification key from a byte array into a list of field elements.
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
template <IsUltraFlavor Flavor> void vk_as_fields_honk(const std::string& vk_path, const std::string& output_path)
{
    using VerificationKey = Flavor::VerificationKey;

    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(read_file(vk_path)));
    std::vector<bb::fr> data = verification_key->to_field_elements();
    auto json = honk_vk_to_json(data);
    if (output_path == "-") {
        write_string_to_stdout(json);
        vinfo("vk as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("vk as fields written to: ", output_path);
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
void prove_output_all(const std::string& bytecode_path,
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

bool flag_present(std::vector<std::string>& args, const std::string& flag)
{
    return std::find(args.begin(), args.end(), flag) != args.end();
}

std::string get_option(std::vector<std::string>& args, const std::string& option, const std::string& defaultValue)
{
    auto itr = std::find(args.begin(), args.end(), option);
    return (itr != args.end() && std::next(itr) != args.end()) ? *(std::next(itr)) : defaultValue;
}

int main(int argc, char* argv[])
{
    try {
        std::vector<std::string> args(argv + 1, argv + argc);
        debug_logging = flag_present(args, "-d") || flag_present(args, "--debug_logging");
        verbose_logging = debug_logging || flag_present(args, "-v") || flag_present(args, "--verbose_logging");
        if (args.empty()) {
            std::cerr << "No command provided.\n";
            return 1;
        }

        const std::string command = args[0];
        vinfo("bb command is: ", command);
        const std::string proof_system = get_option(args, "--scheme", "");
        const std::string bytecode_path = get_option(args, "-b", "./target/program.json");
        const std::string witness_path = get_option(args, "-w", "./target/witness.gz");
        const std::string proof_path = get_option(args, "-p", "./target/proof");
        const std::string vk_path = get_option(args, "-k", "./target/vk");
        const std::string pk_path = get_option(args, "-r", "./target/pk");

        const uint32_t honk_recursion = static_cast<uint32_t>(stoi(get_option(args, "-h", "0")));
        const bool recursive = flag_present(args, "--recursive");
        CRS_PATH = get_option(args, "-c", CRS_PATH);

        const API::Flags flags = [&args]() {
            return API::Flags{
                .initialize_pairing_point_accumulator = get_option(args, "--initialize_accumulator", "false"),
                .ipa_accumulation = get_option(args, "--ipa_accumulation", "false"),
                .oracle_hash = get_option(args, "--oracle_hash", "poseidon2"),
                .output_type = get_option(args, "--output_type", "fields_msgpack"),
                .input_type = get_option(args, "--input_type", "compiletime_stack"),
                .output_content = get_option(args, "--output_content", "proof"),
            };
        }();

        // trigger build
        const auto execute_command = [&](const std::string& command, const API::Flags& flags, API& api) {
            info(flags);
            if (command == "prove") {
                const std::filesystem::path output_dir = get_option(args, "-o", "./target");
                // TODO(#7371): remove this (msgpack version...)
                api.prove(flags, bytecode_path, witness_path, output_dir);
                return 0;
            } else if (command == "verify") {
                return api.verify(flags, proof_path, vk_path) ? 0 : 1;
            } else if (command == "prove_and_verify") {
                return api.prove_and_verify(flags, bytecode_path, witness_path) ? 0 : 1;
            } else if (command == "write_vk") {
                std::string output_path = get_option(args, "-o", "./target/vk");
                info("writing vk to ", output_path);
                api.write_vk(flags, bytecode_path, output_path);
                return 0;
            } else if (command == "write_arbitrary_valid_proof_and_vk_to_file") {
                const std::filesystem::path output_dir = get_option(args, "-o", "./target");
                api.write_arbitrary_valid_proof_and_vk_to_file(flags, output_dir);
                return 0;
            } else if (command == "contract") {
                const std::filesystem::path output_path = get_option(args, "-o", "./contract.sol");
                api.contract(flags, output_path, vk_path);
                return 0;
            } else {
                throw_or_abort(std::format("Command passed to execute_command in bb is {}", command));
                return 1;
            }
        };

        // Skip CRS initialization for any command which doesn't require the CRS.
        if (command == "--version") {
            write_string_to_stdout(BB_VERSION);
            return 0;
        }

        if (proof_system == "client_ivc") {
            ClientIVCAPI api;
            execute_command(command, flags, api);
        } else if (proof_system == "ultra_honk") {
            UltraHonkAPI api;
            execute_command(command, flags, api);
        } else if (command == "prove_and_verify") {
            return prove_and_verify(bytecode_path, recursive, witness_path) ? 0 : 1;
        } else if (command == "prove") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs");
            prove_output_all(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_tube") {
            std::string output_path = get_option(args, "-o", "./target");
            prove_tube(output_path);
        } else if (command == "verify_tube") {
            std::string output_path = get_option(args, "-o", "./target");
            auto tube_proof_path = output_path + "/proof";
            auto tube_vk_path = output_path + "/vk";
            UltraHonkAPI api;
            return api.verify({ .ipa_accumulation = "true" }, tube_proof_path, tube_vk_path) ? 0 : 1;
        } else if (command == "gates") {
            gate_count<UltraCircuitBuilder>(bytecode_path, recursive, honk_recursion);
        } else if (command == "gates_mega_honk") {
            gate_count<MegaCircuitBuilder>(bytecode_path, recursive, honk_recursion);
        } else if (command == "gates_for_ivc") {
            gate_count_for_ivc(bytecode_path);
        } else if (command == "verify") {
            return verify(proof_path, vk_path) ? 0 : 1;
        } else if (command == "contract") {
            std::string output_path = get_option(args, "-o", "./target/contract.sol");
            contract(output_path, vk_path);
        } else if (command == "write_vk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk(bytecode_path, output_path, recursive);
        } else if (command == "write_pk") {
            std::string output_path = get_option(args, "-o", "./target/pk");
            write_pk(bytecode_path, output_path, recursive);
        } else if (command == "proof_as_fields") {
            std::string output_path = get_option(args, "-o", proof_path + "_fields.json");
            proof_as_fields(proof_path, vk_path, output_path);
        } else if (command == "vk_as_fields") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields(vk_path, output_path);
        } else if (command == "write_recursion_inputs_ultra_honk") {
            std::string output_path = get_option(args, "-o", "./target");
            write_recursion_inputs_honk<UltraFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "write_recursion_inputs_rollup_honk") {
            std::string output_path = get_option(args, "-o", "./target");
            write_recursion_inputs_honk<UltraRollupFlavor>(bytecode_path, witness_path, output_path, recursive);
#ifndef DISABLE_AZTEC_VM
        } else if (command == "avm2_prove") {
            std::filesystem::path inputs_path = get_option(args, "--avm-inputs", "./target/avm_inputs.bin");
            // This outputs both files: proof and vk, under the given directory.
            std::filesystem::path output_path = get_option(args, "-o", "./proofs");
            avm2_prove(inputs_path, output_path);
        } else if (command == "avm2_check_circuit") {
            std::filesystem::path inputs_path = get_option(args, "--avm-inputs", "./target/avm_inputs.bin");
            avm2_check_circuit(inputs_path);
        } else if (command == "avm2_verify") {
            std::filesystem::path public_inputs_path =
                get_option(args, "--avm-public-inputs", "./target/avm_public_inputs.bin");
            return avm2_verify(proof_path, public_inputs_path, vk_path) ? 0 : 1;
        } else if (command == "avm_check_circuit") {
            std::filesystem::path avm_public_inputs_path =
                get_option(args, "--avm-public-inputs", "./target/avm_public_inputs.bin");
            std::filesystem::path avm_hints_path = get_option(args, "--avm-hints", "./target/avm_hints.bin");
            extern std::filesystem::path avm_dump_trace_path;
            avm_dump_trace_path = get_option(args, "--avm-dump-trace", "");
            avm_check_circuit(avm_public_inputs_path, avm_hints_path);
        } else if (command == "avm_prove") {
            std::filesystem::path avm_public_inputs_path =
                get_option(args, "--avm-public-inputs", "./target/avm_public_inputs.bin");
            std::filesystem::path avm_hints_path = get_option(args, "--avm-hints", "./target/avm_hints.bin");
            // This outputs both files: proof and vk, under the given directory.
            std::filesystem::path output_path = get_option(args, "-o", "./proofs");
            extern std::filesystem::path avm_dump_trace_path;
            avm_dump_trace_path = get_option(args, "--avm-dump-trace", "");
            avm_prove(avm_public_inputs_path, avm_hints_path, output_path);
        } else if (command == "avm_verify") {
            return avm_verify(proof_path, vk_path) ? 0 : 1;
#endif
        } else if (command == "write_vk_for_ivc") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_for_ivc(bytecode_path, output_path);
        } else if (command == "proof_as_fields_honk") {
            std::string output_path = get_option(args, "-o", proof_path + "_fields.json");
            proof_as_fields_honk(proof_path, output_path);
        } else if (command == "vk_as_fields_ultra_honk") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields_honk<UltraFlavor>(vk_path, output_path);
        } else if (command == "vk_as_fields_ultra_keccak_honk") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields_honk<UltraKeccakFlavor>(vk_path, output_path);
        } else if (command == "vk_as_fields_ultra_rollup_honk") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields_honk<UltraRollupFlavor>(vk_path, output_path);
        } else {
            std::cerr << "Unknown command: " << command << "\n";
            return 1;
        }
    } catch (std::runtime_error const& err) {
        std::cerr << err.what() << std::endl;
        return 1;
    }
}
