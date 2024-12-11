#include "barretenberg/bb/api.hpp"
#include "barretenberg/bb/api_client_ivc.hpp"
#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/benchmark.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/timer.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/acir_composer.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"

#ifndef DISABLE_AZTEC_VM
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/stats.hpp"
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

std::string to_json(std::vector<bb::fr>& data)
{
    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

std::string vk_to_json(std::vector<bb::fr> const& data)
{
    // We need to move vk_hash to the front...
    std::vector<bb::fr> rotated(data.begin(), data.end() - 1);
    rotated.insert(rotated.begin(), data.at(data.size() - 1));

    return format("[", join(map(rotated, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

std::string honk_vk_to_json(std::vector<bb::fr>& data)
{
    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

/**
 * @brief Proves and verifies an ACIR circuit
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param recursive Whether to use recursive proof generation of non-recursive
 * @return true if the proof is valid
 * @return false if the proof is invalid
 */
bool proveAndVerify(const std::string& bytecodePath, const bool recursive, const std::string& witnessPath)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    auto witness = get_witness(witnessPath);

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

    vinfo("verified: ", verified);
    return verified;
}

template <IsUltraFlavor Flavor>
bool proveAndVerifyHonkAcirFormat(acir_format::AcirFormat constraint_system,
                                  const bool recursive,
                                  acir_format::WitnessVector witness)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    // Construct a bberg circuit from the acir representation
    auto builder = acir_format::create_circuit<Builder>(constraint_system, recursive, 0, witness, honk_recursion);

    // Construct Honk proof
    Prover prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();

    // Verify Honk proof
    auto verification_key = std::make_shared<VerificationKey>(prover.proving_key->proving_key);

    Verifier verifier{ verification_key };

    return verifier.verify_proof(proof);
}

/**
 * @brief Constructs and verifies a Honk proof for an acir-generated circuit
 *
 * @tparam Flavor
 * @param bytecodePath Path to serialized acir circuit data
 * @param witnessPath Path to serialized acir witness data
 */
template <IsUltraFlavor Flavor>
bool proveAndVerifyHonk(const std::string& bytecodePath, const bool recursive, const std::string& witnessPath)
{
    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    // Populate the acir constraint system and witness from gzipped data
    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    auto witness = get_witness(witnessPath);

    return proveAndVerifyHonkAcirFormat<Flavor>(constraint_system, recursive, witness);
}

/**
 * @brief Constructs and verifies multiple Honk proofs for an ACIR-generated program.
 *
 * @tparam Flavor
 * @param bytecodePath Path to serialized acir program data. An ACIR program contains a list of circuits.
 * @param witnessPath Path to serialized acir witness stack data. This dictates the execution trace the backend should
 * follow.
 */
template <IsUltraFlavor Flavor>
bool proveAndVerifyHonkProgram(const std::string& bytecodePath, const bool recursive, const std::string& witnessPath)
{
    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    auto program_stack = acir_format::get_acir_program_stack(bytecodePath, witnessPath, honk_recursion);
    while (!program_stack.empty()) {
        auto stack_item = program_stack.back();
        if (!proveAndVerifyHonkAcirFormat<Flavor>(stack_item.constraints, recursive, stack_item.witness)) {
            return false;
        }
        program_stack.pop_back();
    }
    return true;
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

    using GoblinVerifierInput = ClientIVCRecursiveVerifier::GoblinVerifierInput;
    using VerifierInput = ClientIVCRecursiveVerifier::VerifierInput;
    using Builder = UltraCircuitBuilder;
    using GrumpkinVk = bb::VerifierCommitmentKey<curve::Grumpkin>;

    std::string vkPath = output_path + "/client_ivc_vk";
    std::string proofPath = output_path + "/client_ivc_proof";

    // Note: this could be decreased once we optimise the size of the ClientIVC recursiveve rifier
    init_bn254_crs(1 << 25);
    init_grumpkin_crs(1 << 18);

    // Read the proof  and verification data from given files
    auto proof = from_buffer<ClientIVC::Proof>(read_file(proofPath));
    auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(vkPath));

    // We don't serialise and deserialise the Grumkin SRS so initialise with circuit_size + 1 to be able to recursively
    // IPA. The + 1 is to satisfy IPA verification key requirements.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1025)
    vk.eccvm->pcs_verification_key = std::make_shared<GrumpkinVk>(vk.eccvm->circuit_size + 1);

    GoblinVerifierInput goblin_verifier_input{ vk.eccvm, vk.translator };
    VerifierInput input{ vk.mega, goblin_verifier_input };
    auto builder = std::make_shared<Builder>();

    // Preserve the public inputs that should be passed to the base rollup by making them public inputs to the tube
    // circuit
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1048): INSECURE - make this tube proof actually use
    // these public inputs by turning proof into witnesses and calling set_public on each witness
    auto num_public_inputs = static_cast<uint32_t>(static_cast<uint256_t>(proof.mega_proof[1]));
    num_public_inputs -= bb::PAIRING_POINT_ACCUMULATOR_SIZE; // don't add the agg object

    for (size_t i = 0; i < num_public_inputs; i++) {
        auto offset = bb::HONK_PROOF_PUBLIC_INPUT_OFFSET;
        builder->add_public_variable(proof.mega_proof[i + offset]);
    }
    ClientIVCRecursiveVerifier verifier{ builder, input };

    ClientIVCRecursiveVerifier::Output client_ivc_rec_verifier_output = verifier.verify(proof);

    PairingPointAccumulatorIndices current_aggregation_object =
        stdlib::recursion::init_default_agg_obj_indices<Builder>(*builder);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): Add aggregation to goblin recursive verifiers.
    // This is currently just setting the aggregation object to the default one.
    builder->add_pairing_point_accumulator(current_aggregation_object);

    // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1154): We shouldn't add these to the public inputs for
    // now since we don't handle them correctly. Uncomment when we start using UltraRollupHonk in the rollup.
    // builder->add_ipa_claim(client_ivc_rec_verifier_output.opening_claim.get_witness_indices());
    // builder->ipa_proof = convert_stdlib_proof_to_native(client_ivc_rec_verifier_output.ipa_transcript->proof_data);

    using Prover = UltraProver_<UltraFlavor>;
    using Verifier = UltraVerifier_<UltraFlavor>;
    Prover tube_prover{ *builder };
    auto tube_proof = tube_prover.construct_proof();
    std::string tubeProofPath = output_path + "/proof";
    write_file(tubeProofPath, to_buffer<true>(tube_proof));

    std::string tubeProofAsFieldsPath = output_path + "/proof_fields.json";
    auto proof_data = to_json(tube_proof);
    write_file(tubeProofAsFieldsPath, { proof_data.begin(), proof_data.end() });

    std::string tubeVkPath = output_path + "/vk";
    auto tube_verification_key =
        std::make_shared<typename UltraFlavor::VerificationKey>(tube_prover.proving_key->proving_key);
    write_file(tubeVkPath, to_buffer(tube_verification_key));

    std::string tubeAsFieldsVkPath = output_path + "/vk_fields.json";
    auto field_els = tube_verification_key->to_field_elements();
    info("verificaton key length in fields:", field_els.size());
    auto data = to_json(field_els);
    write_file(tubeAsFieldsVkPath, { data.begin(), data.end() });

    info("Native verification of the tube_proof");
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    Verifier tube_verifier(tube_verification_key, ipa_verification_key);
    bool verified = tube_verifier.verify_proof(tube_proof, builder->ipa_proof);
    info("Tube proof verification: ", verified);
}

/**
 * @brief Creates a proof for an ACIR circuit
 *
 * Communication:
 * - stdout: The proof is written to stdout as a byte array
 * - Filesystem: The proof is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param outputPath Path to write the proof to
 * @param recursive Whether to use recursive proof generation of non-recursive
 */
void prove(const std::string& bytecodePath,
           const std::string& witnessPath,
           const std::string& outputPath,
           const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    auto witness = get_witness(witnessPath);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive, witness);
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    acir_composer.init_proving_key();
    auto proof = acir_composer.create_proof();

    if (outputPath == "-") {
        writeRawBytesToStdout(proof);
        vinfo("proof written to stdout");
    } else {
        write_file(outputPath, proof);
        vinfo("proof written to: ", outputPath);
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
 * @param bytecodePath Path to the file containing the serialized circuit
 */
template <typename Builder = UltraCircuitBuilder>
void gateCount(const std::string& bytecodePath, bool recursive, bool honk_recursion)
{
    // All circuit reports will be built into the string below
    std::string functions_string = "{\"functions\": [\n  ";
    auto constraint_systems = get_constraint_systems(bytecodePath, honk_recursion);
    size_t i = 0;
    for (auto constraint_system : constraint_systems) {
        auto builder = acir_format::create_circuit<Builder>(
            constraint_system, recursive, 0, {}, honk_recursion, std::make_shared<bb::ECCOpQueue>(), true);
        builder.finalize_circuit(/*ensure_nonzero=*/true);
        size_t circuit_size = builder.num_gates;
        vinfo("Calculated circuit size in gateCount: ", circuit_size);

        // Build individual circuit report
        std::string gates_per_opcode_str;
        for (size_t j = 0; j < constraint_system.gates_per_opcode.size(); j++) {
            gates_per_opcode_str += std::to_string(constraint_system.gates_per_opcode[j]);
            if (j != constraint_system.gates_per_opcode.size() - 1) {
                gates_per_opcode_str += ",";
            }
        }

        auto result_string = format("{\n        \"acir_opcodes\": ",
                                    constraint_system.num_acir_opcodes,
                                    ",\n        \"circuit_size\": ",
                                    circuit_size,
                                    ",\n        \"gates_per_opcode\": [",
                                    gates_per_opcode_str,
                                    "]\n  }");

        // Attach a comma if we still circuit reports to generate
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
    writeRawBytesToStdout(data);
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
 * - Filesystem: The verification key is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param outputPath Path to write the verification key to
 * @param recursive Whether to create a SNARK friendly circuit and key
 */
void write_vk(const std::string& bytecodePath, const std::string& outputPath, const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecodePath, false);
    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive);
    acir_composer.finalize_circuit();
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    acir_composer.init_proving_key();
    auto vk = acir_composer.init_verification_key();
    auto serialized_vk = to_buffer(*vk);
    if (outputPath == "-") {
        writeRawBytesToStdout(serialized_vk);
        vinfo("vk written to stdout");
    } else {
        write_file(outputPath, serialized_vk);
        vinfo("vk written to: ", outputPath);
    }
}

void write_pk(const std::string& bytecodePath, const std::string& outputPath, const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive);
    acir_composer.finalize_circuit();
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    auto pk = acir_composer.init_proving_key();
    auto serialized_pk = to_buffer(*pk);

    if (outputPath == "-") {
        writeRawBytesToStdout(serialized_pk);
        vinfo("pk written to stdout");
    } else {
        write_file(outputPath, serialized_pk);
        vinfo("pk written to: ", outputPath);
    }
}

/**
 * @brief Writes a Solidity verifier contract for an ACIR circuit to a file
 *
 * Communication:
 * - stdout: The Solidity verifier contract is written to stdout as a string
 * - Filesystem: The Solidity verifier contract is written to the path specified by outputPath
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
        writeStringToStdout(contract);
        vinfo("contract written to stdout");
    } else {
        write_file(output_path, { contract.begin(), contract.end() });
        vinfo("contract written to: ", output_path);
    }
}

/**
 * @brief Writes a Honk Solidity verifier contract for an ACIR circuit to a file
 *
 * Communication:
 * - stdout: The Solidity verifier contract is written to stdout as a string
 * - Filesystem: The Solidity verifier contract is written to the path specified by outputPath
 *
 * Note: The fact that the contract was computed is for an ACIR circuit is not of importance
 * because this method uses the verification key to compute the Solidity verifier contract
 *
 * @param output_path Path to write the contract to
 * @param vk_path Path to the file containing the serialized verification key
 */
void contract_honk(const std::string& output_path, const std::string& vk_path)
{
    using VerificationKey = UltraKeccakFlavor::VerificationKey;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;

    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(read_file(vk_path)));
    vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();

    std::string contract = get_honk_solidity_verifier(std::move(vk));

    if (output_path == "-") {
        writeStringToStdout(contract);
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
 * - Filesystem: The proof as a list of field elements is written to the path specified by outputPath
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
        writeStringToStdout(json);
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
 * - Filesystem: The verification key as a list of field elements is written to the path specified by outputPath
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
        writeStringToStdout(json);
        vinfo("vk as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("vk as fields written to: ", output_path);
    }
}

#ifndef DISABLE_AZTEC_VM
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

    // Using [0] is fine now for the top-level call, but we might need to index by address in future
    vinfo("bytecode size: ", avm_hints.all_contract_bytecode[0].bytecode.size());
    vinfo("hints.storage_read_hints size: ", avm_hints.storage_read_hints.size());
    vinfo("hints.storage_write_hints size: ", avm_hints.storage_write_hints.size());
    vinfo("hints.nullifier_read_hints size: ", avm_hints.nullifier_read_hints.size());
    vinfo("hints.nullifier_write_hints size: ", avm_hints.nullifier_write_hints.size());
    vinfo("hints.note_hash_read_hints size: ", avm_hints.note_hash_read_hints.size());
    vinfo("hints.note_hash_write_hints size: ", avm_hints.note_hash_write_hints.size());
    vinfo("hints.l1_to_l2_message_read_hints size: ", avm_hints.l1_to_l2_message_read_hints.size());
    vinfo("hints.contract_instance_hints size: ", avm_hints.contract_instance_hints.size());
    vinfo("hints.contract_bytecode_hints size: ", avm_hints.all_contract_bytecode.size());

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

#ifdef AVM_TRACK_STATS
    info("------- STATS -------");
    const auto& stats = avm_trace::Stats::get();
    const int levels = std::getenv("AVM_STATS_DEPTH") != nullptr ? std::stoi(std::getenv("AVM_STATS_DEPTH")) : 2;
    info(stats.to_string(levels));
#endif
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
    return verified;
}
#endif

/**
 * @brief Create a Honk a prover from program bytecode and an optional witness
 *
 * @tparam Flavor
 * @param bytecodePath
 * @param witnessPath
 * @return UltraProver_<Flavor>
 */
template <typename Flavor>
UltraProver_<Flavor> compute_valid_prover(const std::string& bytecodePath,
                                          const std::string& witnessPath,
                                          const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;

    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor>) {
        honk_recursion = true;
    }
    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    acir_format::WitnessVector witness = {};
    if (!witnessPath.empty()) {
        witness = get_witness(witnessPath);
    }

    auto builder = acir_format::create_circuit<Builder>(constraint_system, recursive, 0, witness, honk_recursion);
    auto prover = Prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    return std::move(prover);
}

/**
 * @brief Creates a proof for an ACIR circuit
 *
 * Communication:
 * - stdout: The proof is written to stdout as a byte array
 * - Filesystem: The proof is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param outputPath Path to write the proof to
 */
template <IsUltraFlavor Flavor>
void prove_honk(const std::string& bytecodePath,
                const std::string& witnessPath,
                const std::string& outputPath,
                const bool recursive)
{
    using Prover = UltraProver_<Flavor>;

    // Construct Honk proof
    Prover prover = compute_valid_prover<Flavor>(bytecodePath, witnessPath, recursive);
    auto proof = prover.construct_proof();
    if (outputPath == "-") {
        writeRawBytesToStdout(to_buffer</*include_size=*/true>(proof));
        vinfo("proof written to stdout");
    } else {
        write_file(outputPath, to_buffer</*include_size=*/true>(proof));
        vinfo("proof written to: ", outputPath);
    }
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
template <IsUltraFlavor Flavor> bool verify_honk(const std::string& proof_path, const std::string& vk_path)
{
    using VerificationKey = Flavor::VerificationKey;
    using Verifier = UltraVerifier_<Flavor>;

    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    auto proof = from_buffer<std::vector<bb::fr>>(read_file(proof_path));
    auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(read_file(vk_path)));
    vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1154): Remove this and pass in the IPA proof to the
    // verifier.
    std::shared_ptr<VerifierCommitmentKey<curve::Grumpkin>> ipa_verification_key = nullptr;
    if constexpr (HasIPAAccumulator<Flavor>) {
        init_grumpkin_crs(1 << 16);
        vk->contains_ipa_claim = false;
        ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    }
    Verifier verifier{ vk, ipa_verification_key };

    bool verified = verifier.verify_proof(proof);

    vinfo("verified: ", verified);
    return verified;
}

/**
 * @brief Writes a Honk verification key for an ACIR circuit to a file
 *
 * Communication:
 * - stdout: The verification key is written to stdout as a byte array
 * - Filesystem: The verification key is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param outputPath Path to write the verification key to
 */
template <IsUltraFlavor Flavor>
void write_vk_honk(const std::string& bytecodePath, const std::string& outputPath, const bool recursive)
{
    using Prover = UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    // Construct a verification key from a partial form of the proving key which only has precomputed entities
    Prover prover = compute_valid_prover<Flavor>(bytecodePath, "", recursive);
    VerificationKey vk(prover.proving_key->proving_key);

    auto serialized_vk = to_buffer(vk);
    if (outputPath == "-") {
        writeRawBytesToStdout(serialized_vk);
        vinfo("vk written to stdout");
    } else {
        write_file(outputPath, serialized_vk);
        vinfo("vk written to: ", outputPath);
    }
}

/**
 * @brief Compute and write to file a MegaHonk VK for a circuit to be accumulated in the IVC
 * @note This method differes from write_vk_honk<MegaFlavor> in that it handles kernel circuits which require special
 * treatment (i.e. construction of mock IVC state to correctly complete the kernel logic).
 *
 * @param bytecodePath
 * @param witnessPath
 */
void write_vk_for_ivc(const std::string& bytecodePath, const std::string& outputPath)
{
    using Builder = ClientIVC::ClientCircuit;
    using Prover = ClientIVC::MegaProver;
    using DeciderProvingKey = ClientIVC::DeciderProvingKey;
    using VerificationKey = ClientIVC::MegaVerificationKey;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
    init_bn254_crs(1 << 20);
    init_grumpkin_crs(1 << 15);

    auto constraints = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    acir_format::WitnessVector witness = {};

    TraceSettings trace_settings{ E2E_FULL_TEST_STRUCTURE };

    // The presence of ivc recursion constraints determines whether or not the program is a kernel
    bool is_kernel = !constraints.ivc_recursion_constraints.empty();

    Builder builder;
    if (is_kernel) {
        // Create a mock IVC instance based on the IVC recursion constraints in the kernel program
        ClientIVC mock_ivc = create_mock_ivc_from_constraints(constraints.ivc_recursion_constraints, trace_settings);
        builder = acir_format::create_kernel_circuit(constraints, mock_ivc, witness);
    } else {
        builder = acir_format::create_circuit<Builder>(
            constraints, /*recursive=*/false, 0, witness, /*honk_recursion=*/false);
    }
    // Add public inputs corresponding to pairing point accumulator
    builder.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(builder));

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    auto proving_key = std::make_shared<DeciderProvingKey>(builder, trace_settings);
    Prover prover{ proving_key };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    VerificationKey vk(prover.proving_key->proving_key);

    // Write the VK to file as a buffer
    auto serialized_vk = to_buffer(vk);
    if (outputPath == "-") {
        writeRawBytesToStdout(serialized_vk);
        vinfo("vk written to stdout");
    } else {
        write_file(outputPath, serialized_vk);
        vinfo("vk written to: ", outputPath);
    }
}

/**
 * @brief Write a toml file containing recursive verifier inputs for a given program + witness
 *
 * @tparam Flavor
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param outputPath Path to write toml file
 */
template <IsUltraFlavor Flavor>
void write_recursion_inputs_honk(const std::string& bytecodePath,
                                 const std::string& witnessPath,
                                 const std::string& outputPath,
                                 const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;

    bool honk_recursion = true;
    auto constraints = get_constraint_system(bytecodePath, honk_recursion);
    auto witness = get_witness(witnessPath);
    auto builder = acir_format::create_circuit<Builder>(constraints, recursive, 0, witness, honk_recursion);

    // Construct Honk proof and verification key
    Prover prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    std::vector<FF> proof = prover.construct_proof();
    VerificationKey verification_key(prover.proving_key->proving_key);

    // Construct a string with the content of the toml file (vk hash, proof, public inputs, vk)
    std::string toml_content = acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(proof, verification_key);

    // Write all components to the TOML file
    std::string toml_path = outputPath + "/Prover.toml";
    write_file(toml_path, { toml_content.begin(), toml_content.end() });
}

/**
 * @brief Outputs proof as vector of field elements in readable format.
 *
 * Communication:
 * - stdout: The proof as a list of field elements is written to stdout as a string
 * - Filesystem: The proof as a list of field elements is written to the path specified by outputPath
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
        writeStringToStdout(json);
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
 * - Filesystem: The verification key as a list of field elements is written to the path specified by outputPath
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
        writeStringToStdout(json);
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
 * - Filesystem: The proof is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param outputPath Directory into which we write the proof and verification key data
 * @param recursive Whether to a build SNARK friendly proof
 */
void prove_output_all(const std::string& bytecodePath,
                      const std::string& witnessPath,
                      const std::string& outputPath,
                      const bool recursive)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    auto witness = get_witness(witnessPath);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_finalized_circuit(constraint_system, recursive, witness);
    acir_composer.finalize_circuit();
    init_bn254_crs(acir_composer.get_finalized_dyadic_circuit_size());
    acir_composer.init_proving_key();
    auto proof = acir_composer.create_proof();

    // We have been given a directory, we will write the proof and verification key
    // into the directory in both 'binary' and 'fields' formats
    std::string vkOutputPath = outputPath + "/vk";
    std::string proofPath = outputPath + "/proof";
    std::string vkFieldsOutputPath = outputPath + "/vk_fields.json";
    std::string proofFieldsPath = outputPath + "/proof_fields.json";

    std::shared_ptr<bb::plonk::verification_key> vk = acir_composer.init_verification_key();

    // Write the 'binary' proof
    write_file(proofPath, proof);
    vinfo("proof written to: ", proofPath);

    // Write the proof as fields
    auto proofAsFields = acir_composer.serialize_proof_into_fields(proof, vk->as_data().num_public_inputs);
    std::string proofJson = to_json(proofAsFields);
    write_file(proofFieldsPath, { proofJson.begin(), proofJson.end() });
    info("proof as fields written to: ", proofFieldsPath);

    // Write the vk as binary
    auto serialized_vk = to_buffer(*vk);
    write_file(vkOutputPath, serialized_vk);
    vinfo("vk written to: ", vkOutputPath);

    // Write the vk as fields
    auto data = acir_composer.serialize_verification_key_into_fields();
    std::string vk_json = vk_to_json(data);
    write_file(vkFieldsOutputPath, { vk_json.begin(), vk_json.end() });
    vinfo("vk as fields written to: ", vkFieldsOutputPath);
}

/**
 * @brief Creates a Honk proof for an ACIR circuit, outputs the proof and verification key in binary and 'field' format
 *
 * Communication:
 * - Filesystem: The proof is written to the path specified by outputPath
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 * @param witnessPath Path to the file containing the serialized witness
 * @param outputPath Directory into which we write the proof and verification key data
 * @param recursive Whether to build a SNARK friendly proof
 */
template <IsUltraFlavor Flavor>
void prove_honk_output_all(const std::string& bytecodePath,
                           const std::string& witnessPath,
                           const std::string& outputPath,
                           const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor>) {
        honk_recursion = true;
    }

    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    auto witness = get_witness(witnessPath);

    auto builder = acir_format::create_circuit<Builder>(constraint_system, recursive, 0, witness, honk_recursion);

    // Construct Honk proof
    Prover prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();

    // We have been given a directory, we will write the proof and verification key
    // into the directory in both 'binary' and 'fields' formats
    std::string vkOutputPath = outputPath + "/vk";
    std::string proofPath = outputPath + "/proof";
    std::string vkFieldsOutputPath = outputPath + "/vk_fields.json";
    std::string proofFieldsPath = outputPath + "/proof_fields.json";

    VerificationKey vk(
        prover.proving_key->proving_key); // uses a partial form of the proving key which only has precomputed entities

    // Write the 'binary' proof
    write_file(proofPath, to_buffer</*include_size=*/true>(proof));
    vinfo("binary proof written to: ", proofPath);

    // Write the proof as fields
    std::string proofJson = to_json(proof);
    write_file(proofFieldsPath, { proofJson.begin(), proofJson.end() });
    vinfo("proof as fields written to: ", proofFieldsPath);

    // Write the vk as binary
    auto serialized_vk = to_buffer(vk);
    write_file(vkOutputPath, serialized_vk);
    vinfo("vk written to: ", vkOutputPath);

    // Write the vk as fields
    std::vector<bb::fr> vk_data = vk.to_field_elements();
    auto vk_json = honk_vk_to_json(vk_data);
    write_file(vkFieldsOutputPath, { vk_json.begin(), vk_json.end() });
    vinfo("vk as fields written to: ", vkFieldsOutputPath);
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

        const API::Flags flags = [&args]() {
            return API::Flags{ .output_type = get_option(args, "--output_type", "fields_msgpack"),
                               .input_type = get_option(args, "--input_type", "compiletime_stack"),
                               .no_auto_verify = flag_present(args, "--no_auto_verify") };
        }();

        const std::string command = args[0];
        vinfo("bb command is: ", command);
        const std::string proof_system = get_option(args, "--scheme", "");
        const std::string bytecode_path = get_option(args, "-b", "./target/program.json");
        const std::string witness_path = get_option(args, "-w", "./target/witness.gz");
        const std::string proof_path = get_option(args, "-p", "./proofs/proof");
        const std::string vk_path = get_option(args, "-k", "./target/vk");
        const std::string pk_path = get_option(args, "-r", "./target/pk");

        const bool honk_recursion = flag_present(args, "-h");
        const bool recursive = flag_present(args, "--recursive");
        CRS_PATH = get_option(args, "-c", CRS_PATH);

        const auto execute_command = [&](const std::string& command, const API::Flags& flags, API& api) {
            ASSERT(flags.input_type.has_value());
            ASSERT(flags.output_type.has_value());
            if (command == "prove") {
                const std::filesystem::path output_dir = get_option(args, "-o", "./target");
                // TODO(#7371): remove this (msgpack version...)
                api.prove(flags, bytecode_path, witness_path, output_dir);
                return 0;
            }

            if (command == "verify") {
                const std::filesystem::path output_dir = get_option(args, "-o", "./target");
                const std::filesystem::path proof_path = output_dir / "client_ivc_proof";
                const std::filesystem::path vk_path = output_dir / "client_ivc_vk";

                return api.verify(flags, proof_path, vk_path) ? 0 : 1;
            }

            if (command == "prove_and_verify") {
                return api.prove_and_verify(flags, bytecode_path, witness_path) ? 0 : 1;
            }

            throw_or_abort("Invalid command passed to execute_command in bb");
            return 1;
        };

        // Skip CRS initialization for any command which doesn't require the CRS.
        if (command == "--version") {
            writeStringToStdout(BB_VERSION);
            return 0;
        }

        if (proof_system == "client_ivc") {
            ClientIVCAPI api;
            execute_command(command, flags, api);
        } else if (command == "prove_and_verify") {
            return proveAndVerify(bytecode_path, recursive, witness_path) ? 0 : 1;
        } else if (command == "prove_and_verify_ultra_honk") {
            return proveAndVerifyHonk<UltraFlavor>(bytecode_path, recursive, witness_path) ? 0 : 1;
        } else if (command == "prove_and_verify_ultra_honk_program") {
            return proveAndVerifyHonkProgram<UltraFlavor>(bytecode_path, recursive, witness_path) ? 0 : 1;
        } else if (command == "prove") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs");
            prove_output_all(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_ultra_honk_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs");
            prove_honk_output_all<UltraFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_ultra_rollup_honk_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk_output_all<UltraRollupFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_ultra_keccak_honk_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk_output_all<UltraKeccakFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_mega_honk_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs");
            prove_honk_output_all<MegaFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_tube") {
            std::string output_path = get_option(args, "-o", "./target");
            prove_tube(output_path);
        } else if (command == "verify_tube") {
            std::string output_path = get_option(args, "-o", "./target");
            auto tube_proof_path = output_path + "/proof";
            auto tube_vk_path = output_path + "/vk";
            return verify_honk<UltraFlavor>(tube_proof_path, tube_vk_path) ? 0 : 1;
        } else if (command == "gates") {
            gateCount<UltraCircuitBuilder>(bytecode_path, recursive, honk_recursion);
        } else if (command == "gates_mega_honk") {
            gateCount<MegaCircuitBuilder>(bytecode_path, recursive, honk_recursion);
        } else if (command == "verify") {
            return verify(proof_path, vk_path) ? 0 : 1;
        } else if (command == "contract") {
            std::string output_path = get_option(args, "-o", "./target/contract.sol");
            contract(output_path, vk_path);
        } else if (command == "contract_ultra_honk") {
            std::string output_path = get_option(args, "-o", "./target/contract.sol");
            contract_honk(output_path, vk_path);
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
        } else if (command == "write_recursion_inputs_honk") {
            std::string output_path = get_option(args, "-o", "./target");
            write_recursion_inputs_honk<UltraFlavor>(bytecode_path, witness_path, output_path, recursive);
#ifndef DISABLE_AZTEC_VM
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
        } else if (command == "prove_ultra_honk") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk<UltraFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_ultra_keccak_honk") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk<UltraKeccakFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "prove_ultra_rollup_honk") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk<UltraRollupFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "verify_ultra_honk") {
            return verify_honk<UltraFlavor>(proof_path, vk_path) ? 0 : 1;
        } else if (command == "verify_ultra_keccak_honk") {
            return verify_honk<UltraKeccakFlavor>(proof_path, vk_path) ? 0 : 1;
        } else if (command == "write_vk_ultra_honk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_honk<UltraFlavor>(bytecode_path, output_path, recursive);
        } else if (command == "write_vk_ultra_keccak_honk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_honk<UltraKeccakFlavor>(bytecode_path, output_path, recursive);
        } else if (command == "write_vk_ultra_rollup_honk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_honk<UltraRollupFlavor>(bytecode_path, output_path, recursive);
        } else if (command == "prove_mega_honk") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk<MegaFlavor>(bytecode_path, witness_path, output_path, recursive);
        } else if (command == "verify_mega_honk") {
            return verify_honk<MegaFlavor>(proof_path, vk_path) ? 0 : 1;
        } else if (command == "write_vk_mega_honk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_honk<MegaFlavor>(bytecode_path, output_path, recursive);
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
        } else if (command == "vk_as_fields_mega_honk") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields_honk<MegaFlavor>(vk_path, output_path);
        } else {
            std::cerr << "Unknown command: " << command << "\n";
            return 1;
        }
    } catch (std::runtime_error const& err) {
        std::cerr << err.what() << std::endl;
        return 1;
    }
}
