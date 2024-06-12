#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
#ifndef DISABLE_AZTEC_VM
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_execution.hpp"
#endif
#include "config.hpp"
#include "get_bn254_crs.hpp"
#include "get_bytecode.hpp"
#include "get_grumpkin_crs.hpp"
#include "log.hpp"
#include <barretenberg/common/benchmark.hpp>
#include <barretenberg/common/container.hpp>
#include <barretenberg/common/log.hpp>
#include <barretenberg/common/timer.hpp>
#include <barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp>
#include <barretenberg/dsl/acir_proofs/acir_composer.hpp>
#include <barretenberg/srs/global_crs.hpp>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace bb;

std::string getHomeDir()
{
    char* home = std::getenv("HOME");
    return home != nullptr ? std::string(home) : "./";
}

std::string CRS_PATH = getHomeDir() + "/.bb-crs";

const std::filesystem::path current_path = std::filesystem::current_path();
const auto current_dir = current_path.filename().string();

/**
 * @brief Initialize the global crs_factory for bn254 based on a known dyadic circuit size
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 */
void init_bn254_crs(size_t dyadic_circuit_size)
{
    // Must +1 for Plonk only!
    auto bn254_g1_data = get_bn254_g1_data(CRS_PATH, dyadic_circuit_size + 1);
    auto bn254_g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory(bn254_g1_data, bn254_g2_data);
}

/**
 * @brief Initialize the global crs_factory for grumpkin based on a known dyadic circuit size
 * @details Grumpkin crs is required only for the ECCVM
 *
 * @param dyadic_circuit_size power-of-2 circuit size
 */
void init_grumpkin_crs(size_t eccvm_dyadic_circuit_size)
{
    auto grumpkin_g1_data = get_grumpkin_g1_data(CRS_PATH, eccvm_dyadic_circuit_size);
    srs::init_grumpkin_crs_factory(grumpkin_g1_data);
}

// Initializes without loading G1
// TODO(https://github.com/AztecProtocol/barretenberg/issues/811) adapt for grumpkin
acir_proofs::AcirComposer verifier_init()
{
    acir_proofs::AcirComposer acir_composer(0, verbose_logging);
    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    return acir_composer;
}

acir_format::WitnessVector get_witness(std::string const& witness_path)
{
    auto witness_data = get_bytecode(witness_path);
    return acir_format::witness_buf_to_witness_data(witness_data);
}

acir_format::AcirFormat get_constraint_system(std::string const& bytecode_path, bool honk_recursion)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::circuit_buf_to_acir_format(bytecode, honk_recursion);
}

acir_format::WitnessVectorStack get_witness_stack(std::string const& witness_path)
{
    auto witness_data = get_bytecode(witness_path);
    return acir_format::witness_buf_to_witness_stack(witness_data);
}

std::vector<acir_format::AcirFormat> get_constraint_systems(std::string const& bytecode_path, bool honk_recursion)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::program_buf_to_acir_format(bytecode, honk_recursion);
}

std::string to_json(std::vector<bb::fr>& data)
{
    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

std::string vk_to_json(std::vector<bb::fr>& data)
{
    // We need to move vk_hash to the front...
    std::rotate(data.begin(), data.end() - 1, data.end());

    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

std::string honk_vk_to_json(std::vector<bb::fr>& data)
{
    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

/**
 * @brief Proves and Verifies an ACIR circuit
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
bool proveAndVerify(const std::string& bytecodePath, const std::string& witnessPath)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    auto witness = get_witness(witnessPath);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_circuit(constraint_system, witness);

    init_bn254_crs(acir_composer.get_dyadic_circuit_size());

    Timer pk_timer;
    acir_composer.init_proving_key();
    write_benchmark("pk_construction_time", pk_timer.milliseconds(), "acir_test", current_dir);

    write_benchmark("gate_count", acir_composer.get_total_circuit_size(), "acir_test", current_dir);
    write_benchmark("subgroup_size", acir_composer.get_dyadic_circuit_size(), "acir_test", current_dir);

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
bool proveAndVerifyHonkAcirFormat(acir_format::AcirFormat constraint_system, acir_format::WitnessVector witness)
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
    auto builder = acir_format::create_circuit<Builder>(constraint_system, 0, witness, honk_recursion);

    auto num_extra_gates = builder.get_num_gates_added_to_ensure_nonzero_polynomials();
    size_t srs_size = builder.get_circuit_subgroup_size(builder.get_total_circuit_size() + num_extra_gates);
    init_bn254_crs(srs_size);

    // Construct Honk proof
    Prover prover{ builder };
    auto proof = prover.construct_proof();

    // Verify Honk proof
    auto verification_key = std::make_shared<VerificationKey>(prover.instance->proving_key);
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
template <IsUltraFlavor Flavor> bool proveAndVerifyHonk(const std::string& bytecodePath, const std::string& witnessPath)
{
    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    // Populate the acir constraint system and witness from gzipped data
    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    auto witness = get_witness(witnessPath);

    return proveAndVerifyHonkAcirFormat<Flavor>(constraint_system, witness);
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
bool proveAndVerifyHonkProgram(const std::string& bytecodePath, const std::string& witnessPath)
{
    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    auto program_stack = acir_format::get_acir_program_stack(bytecodePath, witnessPath, honk_recursion);

    while (!program_stack.empty()) {
        auto stack_item = program_stack.back();

        if (!proveAndVerifyHonkAcirFormat<Flavor>(stack_item.constraints, stack_item.witness)) {
            return false;
        }
        program_stack.pop_back();
    }
    return true;
}

bool foldAndVerifyProgram(const std::string& bytecodePath, const std::string& witnessPath)
{
    using Flavor = MegaFlavor; // This is the only option
    using Builder = Flavor::CircuitBuilder;

    init_bn254_crs(1 << 18);
    init_grumpkin_crs(1 << 14);

    ClientIVC ivc;
    ivc.structured_flag = true;

    auto program_stack = acir_format::get_acir_program_stack(
        bytecodePath, witnessPath, false); // TODO(https://github.com/AztecProtocol/barretenberg/issues/1013): this
                                           // assumes that folding is never done with ultrahonk.

    // Accumulate the entire program stack into the IVC
    while (!program_stack.empty()) {
        auto stack_item = program_stack.back();

        // Construct a bberg circuit from the acir representation
        auto circuit = acir_format::create_circuit<Builder>(
            stack_item.constraints, 0, stack_item.witness, false, ivc.goblin.op_queue);

        ivc.accumulate(circuit);

        program_stack.pop_back();
    }
    return ivc.prove_and_verify();
}

/**
 * @brief Recieves an ACIR Program stack that gets accumulated with the ClientIVC logic and produces a client IVC proof.
 *
 * @param bytecodePath Path to the serialised circuit
 * @param witnessPath Path to witness data
 * @param outputPath Path to the folder where the proof and verification data are goingt obe wr itten (in practice this
 * going to be specified when bb main is called, i.e. as the working directory in typescript).
 */
void client_ivc_prove_output_all(const std::string& bytecodePath,
                                 const std::string& witnessPath,
                                 const std::string& outputPath)
{
    using Flavor = MegaFlavor; // This is the only option
    using Builder = Flavor::CircuitBuilder;
    using ECCVMVK = ECCVMFlavor::VerificationKey;
    using TranslatorVK = TranslatorFlavor::VerificationKey;

    init_bn254_crs(1 << 18);
    init_grumpkin_crs(1 << 14);

    ClientIVC ivc;
    ivc.structured_flag = true;

    auto program_stack = acir_format::get_acir_program_stack(
        bytecodePath, witnessPath, false); // TODO(https://github.com/AztecProtocol/barretenberg/issues/1013): this
                                           // assumes that folding is never done with ultrahonk.

    // Accumulate the entire program stack into the IVC
    while (!program_stack.empty()) {
        auto stack_item = program_stack.back();

        // Construct a bberg circuit from the acir representation
        auto circuit = acir_format::create_circuit<Builder>(
            stack_item.constraints, 0, stack_item.witness, false, ivc.goblin.op_queue);

        ivc.accumulate(circuit);

        program_stack.pop_back();
    }

    // Write the proof and verification keys into the working directory in  'binary' format (in practice it seems this
    // directory is passed by bb.js)
    std::string vkPath = outputPath + "/inst_vk"; // the vk of the last instance
    std::string accPath = outputPath + "/pg_acc";
    std::string proofPath = outputPath + "/client_ivc_proof";
    std::string translatorVkPath = outputPath + "/translator_vk";
    std::string eccVkPath = outputPath + "/ecc_vk";

    auto proof = ivc.prove();
    auto eccvm_vk = std::make_shared<ECCVMVK>(ivc.goblin.get_eccvm_proving_key());
    auto translator_vk = std::make_shared<TranslatorVK>(ivc.goblin.get_translator_proving_key());

    auto last_instance = std::make_shared<ClientIVC::VerifierInstance>(ivc.instance_vk);
    vinfo("ensure valid proof: ", ivc.verify(proof, { ivc.verifier_accumulator, last_instance }));

    vinfo("write proof and vk data to files..");
    write_file(proofPath, to_buffer(proof));
    write_file(vkPath, to_buffer(ivc.instance_vk)); // maybe dereference
    write_file(accPath, to_buffer(ivc.verifier_accumulator));
    write_file(translatorVkPath, to_buffer(translator_vk));
    write_file(eccVkPath, to_buffer(eccvm_vk));
}

/**
 * @brief Creates a Honk Proof for the Tube circuit responsible for recursively verifying a ClientIVC proof.
 *
 * @param outputPath the working directory from which the proof and verification data are read
 */
void prove_tube(const std::string& outputPath)
{
    using ClientIVC = stdlib::recursion::honk::ClientIVCRecursiveVerifier;
    using NativeInstance = ClientIVC::FoldVerifierInput::Instance;
    using InstanceFlavor = MegaFlavor;
    using ECCVMVk = ECCVMFlavor::VerificationKey;
    using TranslatorVk = TranslatorFlavor::VerificationKey;
    using FoldVerifierInput = ClientIVC::FoldVerifierInput;
    using GoblinVerifierInput = ClientIVC::GoblinVerifierInput;
    using VerifierInput = ClientIVC::VerifierInput;
    using Builder = UltraCircuitBuilder;
    using GrumpkinVk = bb::VerifierCommitmentKey<curve::Grumpkin>;

    std::string vkPath = outputPath + "/inst_vk"; // the vk of the last instance
    std::string accPath = outputPath + "/pg_acc";
    std::string proofPath = outputPath + "/client_ivc_proof";
    std::string translatorVkPath = outputPath + "/translator_vk";
    std::string eccVkPath = outputPath + "/ecc_vk";

    // Note: this could be decreased once we optimise the size of the ClientIVC recursiveve rifier
    init_bn254_crs(1 << 25);
    init_grumpkin_crs(1 << 18);

    // Read the proof  and verification data from given files
    auto proof = from_buffer<ClientIVC::Proof>(read_file(proofPath));
    std::shared_ptr<InstanceFlavor::VerificationKey> instance_vk = std::make_shared<InstanceFlavor::VerificationKey>(
        from_buffer<InstanceFlavor::VerificationKey>(read_file(vkPath)));
    std::shared_ptr<NativeInstance> verifier_accumulator =
        std::make_shared<NativeInstance>(from_buffer<NativeInstance>(read_file(accPath)));
    std::shared_ptr<TranslatorVk> translator_vk =
        std::make_shared<TranslatorVk>(from_buffer<TranslatorVk>(read_file(translatorVkPath)));
    std::shared_ptr<ECCVMVk> eccvm_vk = std::make_shared<ECCVMVk>(from_buffer<ECCVMVk>(read_file(eccVkPath)));
    // We don't serialise and deserialise the Grumkin SRS so initialise with circuit_size + 1 to be able to recursively
    // IPA. The + 1 is to satisfy IPA verification key requirements.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1025)
    eccvm_vk->pcs_verification_key = std::make_shared<GrumpkinVk>(eccvm_vk->circuit_size + 1);

    FoldVerifierInput fold_verifier_input{ verifier_accumulator, { instance_vk } };
    GoblinVerifierInput goblin_verifier_input{ eccvm_vk, translator_vk };
    VerifierInput input{ fold_verifier_input, goblin_verifier_input };
    auto builder = std::make_shared<Builder>();
    ClientIVC verifier{ builder, input };

    verifier.verify(proof);
    info("num gates: ", builder->get_num_gates());
    info("generating proof");
    using Prover = UltraProver_<UltraFlavor>;

    Prover tube_prover{ *builder };
    auto tube_proof = tube_prover.construct_proof();

    std::string tubeProofPath = outputPath + "/proof";
    write_file(tubeProofPath, to_buffer<true>(tube_proof));

    std::string tubeVkPath = outputPath + "/vk";
    auto tube_verification_key =
        std::make_shared<typename UltraFlavor::VerificationKey>(tube_prover.instance->proving_key);
    write_file(tubeVkPath, to_buffer(tube_verification_key));
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
 * @param recursive Whether to use recursive proof generation of non-recursive
 * @param outputPath Path to write the proof to
 */
void prove(const std::string& bytecodePath, const std::string& witnessPath, const std::string& outputPath)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    auto witness = get_witness(witnessPath);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_circuit(constraint_system, witness);
    init_bn254_crs(acir_composer.get_dyadic_circuit_size());
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
 * @brief Computes the number of Barretenberg specific gates needed to create a proof for the specific ACIR circuit
 *
 * Communication:
 * - stdout: A JSON string of the number of ACIR opcodes and final backend circuit size
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 */
void gateCount(const std::string& bytecodePath, bool honk_recursion)
{
    // All circuit reports will be built into the string below
    std::string functions_string = "{\"functions\": [\n  ";
    auto constraint_systems = get_constraint_systems(bytecodePath, honk_recursion);
    size_t i = 0;
    for (auto constraint_system : constraint_systems) {
        acir_proofs::AcirComposer acir_composer(0, verbose_logging);
        acir_composer.create_circuit(constraint_system);
        auto circuit_size = acir_composer.get_total_circuit_size();

        // Build individual circuit report
        auto result_string = format("{\n        \"acir_opcodes\": ",
                                    constraint_system.num_acir_opcodes,
                                    ",\n        \"circuit_size\": ",
                                    circuit_size,
                                    "\n  }");

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
 */
void write_vk(const std::string& bytecodePath, const std::string& outputPath)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_circuit(constraint_system);
    init_bn254_crs(acir_composer.get_dyadic_circuit_size());
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

void write_pk(const std::string& bytecodePath, const std::string& outputPath)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_circuit(constraint_system);
    init_bn254_crs(acir_composer.get_dyadic_circuit_size());
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
 * @param bytecode_path Path to the file containing the serialised bytecode
 * @param calldata_path Path to the file containing the serialised calldata (could be empty)
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 * @param output_path Path (directory) to write the output proof and verification keys
 */
void avm_prove(const std::filesystem::path& bytecode_path,
               const std::filesystem::path& calldata_path,
               const std::filesystem::path& public_inputs_path,
               const std::filesystem::path& hints_path,
               const std::filesystem::path& output_path)
{
    std::vector<uint8_t> const bytecode = read_file(bytecode_path);
    std::vector<fr> const calldata = many_from_buffer<fr>(read_file(calldata_path));
    std::vector<fr> const public_inputs_vec = many_from_buffer<fr>(read_file(public_inputs_path));
    auto const avm_hints = bb::avm_trace::ExecutionHints::from(read_file(hints_path));

    vinfo("bytecode size: ", bytecode.size());
    vinfo("calldata size: ", calldata.size());
    vinfo("public_inputs size: ", public_inputs_vec.size());
    vinfo("hints.storage_value_hints size: ", avm_hints.storage_value_hints.size());
    vinfo("hints.note_hash_exists_hints size: ", avm_hints.note_hash_exists_hints.size());
    vinfo("hints.nullifier_exists_hints size: ", avm_hints.nullifier_exists_hints.size());
    vinfo("hints.l1_to_l2_message_exists_hints size: ", avm_hints.l1_to_l2_message_exists_hints.size());
    vinfo("hints.externalcall_hints size: ", avm_hints.externalcall_hints.size());
    vinfo("hints.contract_instance_hints size: ", avm_hints.contract_instance_hints.size());

    // Hardcoded circuit size for now, with enough to support 16-bit range checks
    init_bn254_crs(1 << 17);

    // Prove execution and return vk
    auto const [verification_key, proof] =
        avm_trace::Execution::prove(bytecode, calldata, public_inputs_vec, avm_hints);
    vinfo("------- PROVING DONE -------");

    // TODO(ilyas): <#4887>: Currently we only need these two parts of the vk, look into pcs_verification key reqs
    std::vector<uint64_t> vk_vector = { verification_key.circuit_size, verification_key.num_public_inputs };
    std::vector<fr> vk_as_fields = { verification_key.circuit_size, verification_key.num_public_inputs };
    std::string vk_json = vk_to_json(vk_as_fields);

    const auto proof_path = output_path / "proof";
    const auto vk_path = output_path / "vk";
    const auto vk_fields_path = output_path / "vk_fields.json";

    write_file(proof_path, to_buffer(proof));
    vinfo("proof written to: ", proof_path);
    write_file(vk_path, to_buffer(vk_vector));
    vinfo("vk written to: ", vk_path);
    write_file(vk_fields_path, { vk_json.begin(), vk_json.end() });
    vinfo("vk as fields written to: ", vk_fields_path);
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
    std::vector<fr> const proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    auto circuit_size = from_buffer<size_t>(vk_bytes, 0);
    auto num_public_inputs = from_buffer<size_t>(vk_bytes, sizeof(size_t));
    auto vk = AvmFlavor::VerificationKey(circuit_size, num_public_inputs);

    const bool verified = avm_trace::Execution::verify(vk, proof);
    vinfo("verified: ", verified);
    return verified;
}
#endif

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
void prove_honk(const std::string& bytecodePath, const std::string& witnessPath, const std::string& outputPath)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;

    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    auto witness = get_witness(witnessPath);

    auto builder = acir_format::create_circuit<Builder>(constraint_system, 0, witness, honk_recursion);

    auto num_extra_gates = builder.get_num_gates_added_to_ensure_nonzero_polynomials();
    size_t srs_size = builder.get_circuit_subgroup_size(builder.get_total_circuit_size() + num_extra_gates);
    init_bn254_crs(srs_size);

    // Construct Honk proof
    Prover prover{ builder };
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
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;

    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    auto proof = from_buffer<std::vector<bb::fr>>(read_file(proof_path));
    auto verification_key = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(read_file(vk_path)));
    verification_key->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();

    Verifier verifier{ verification_key };

    bool verified = verifier.verify_proof(proof);

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
 */
template <IsUltraFlavor Flavor> void write_vk_honk(const std::string& bytecodePath, const std::string& outputPath)
{
    using Builder = Flavor::CircuitBuilder;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    bool honk_recursion = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = true;
    }
    auto constraint_system = get_constraint_system(bytecodePath, honk_recursion);
    auto builder = acir_format::create_circuit<Builder>(constraint_system, 0, {}, honk_recursion);

    auto num_extra_gates = builder.get_num_gates_added_to_ensure_nonzero_polynomials();
    size_t srs_size = builder.get_circuit_subgroup_size(builder.get_total_circuit_size() + num_extra_gates);
    init_bn254_crs(srs_size);

    ProverInstance prover_inst(builder);
    VerificationKey vk(
        prover_inst.proving_key); // uses a partial form of the proving key which only has precomputed entities

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
 */
void prove_output_all(const std::string& bytecodePath, const std::string& witnessPath, const std::string& outputPath)
{
    auto constraint_system = get_constraint_system(bytecodePath, /*honk_recursion=*/false);
    auto witness = get_witness(witnessPath);

    acir_proofs::AcirComposer acir_composer{ 0, verbose_logging };
    acir_composer.create_circuit(constraint_system, witness);
    init_bn254_crs(acir_composer.get_dyadic_circuit_size());
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

        std::string command = args[0];

        std::string bytecode_path = get_option(args, "-b", "./target/program.json");
        std::string witness_path = get_option(args, "-w", "./target/witness.gz");
        std::string proof_path = get_option(args, "-p", "./proofs/proof");
        std::string vk_path = get_option(args, "-k", "./target/vk");
        std::string pk_path = get_option(args, "-r", "./target/pk");
        bool honk_recursion = flag_present(args, "-h");
        CRS_PATH = get_option(args, "-c", CRS_PATH);

        // Skip CRS initialization for any command which doesn't require the CRS.
        if (command == "--version") {
            writeStringToStdout(BB_VERSION);
            return 0;
        }
        if (command == "prove_and_verify") {
            return proveAndVerify(bytecode_path, witness_path) ? 0 : 1;
        }
        if (command == "prove_and_verify_ultra_honk") {
            return proveAndVerifyHonk<UltraFlavor>(bytecode_path, witness_path) ? 0 : 1;
        }
        if (command == "prove_and_verify_mega_honk") {
            return proveAndVerifyHonk<MegaFlavor>(bytecode_path, witness_path) ? 0 : 1;
        }
        if (command == "prove_and_verify_ultra_honk_program") {
            return proveAndVerifyHonkProgram<UltraFlavor>(bytecode_path, witness_path) ? 0 : 1;
        }
        if (command == "prove_and_verify_mega_honk_program") {
            return proveAndVerifyHonkProgram<MegaFlavor>(bytecode_path, witness_path) ? 0 : 1;
        }
        if (command == "fold_and_verify_program") {
            return foldAndVerifyProgram(bytecode_path, witness_path) ? 0 : 1;
        }

        if (command == "prove") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove(bytecode_path, witness_path, output_path);
        } else if (command == "prove_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs");
            prove_output_all(bytecode_path, witness_path, output_path);
        } else if (command == "client_ivc_prove_output_all") {
            std::string output_path = get_option(args, "-o", "./proofs");
            client_ivc_prove_output_all(bytecode_path, witness_path, output_path);
        } else if (command == "prove_tube") {
            std::string output_path = get_option(args, "-o", "./proofs");
            prove_tube(output_path);
        } else if (command == "verify_tube") {
            std::string output_path = get_option(args, "-o", "./proofs");
            auto tube_proof_path = output_path + "/proof";
            auto tube_vk_path = output_path + "/vk";
            return verify_honk<UltraFlavor>(tube_proof_path, tube_vk_path) ? 0 : 1;
        } else if (command == "gates") {
            gateCount(bytecode_path, honk_recursion);
        } else if (command == "verify") {
            return verify(proof_path, vk_path) ? 0 : 1;
        } else if (command == "contract") {
            std::string output_path = get_option(args, "-o", "./target/contract.sol");
            contract(output_path, vk_path);
        } else if (command == "write_vk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk(bytecode_path, output_path);
        } else if (command == "write_pk") {
            std::string output_path = get_option(args, "-o", "./target/pk");
            write_pk(bytecode_path, output_path);
        } else if (command == "proof_as_fields") {
            std::string output_path = get_option(args, "-o", proof_path + "_fields.json");
            proof_as_fields(proof_path, vk_path, output_path);
        } else if (command == "vk_as_fields") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields(vk_path, output_path);
#ifndef DISABLE_AZTEC_VM
        } else if (command == "avm_prove") {
            std::filesystem::path avm_bytecode_path = get_option(args, "--avm-bytecode", "./target/avm_bytecode.bin");
            std::filesystem::path avm_calldata_path = get_option(args, "--avm-calldata", "./target/avm_calldata.bin");
            std::filesystem::path avm_public_inputs_path =
                get_option(args, "--avm-public-inputs", "./target/avm_public_inputs.bin");
            std::filesystem::path avm_hints_path = get_option(args, "--avm-hints", "./target/avm_hints.bin");
            // This outputs both files: proof and vk, under the given directory.
            std::filesystem::path output_path = get_option(args, "-o", "./proofs");
            extern std::filesystem::path avm_dump_trace_path;
            avm_dump_trace_path = get_option(args, "--avm-dump-trace", "");
            avm_prove(avm_bytecode_path, avm_calldata_path, avm_public_inputs_path, avm_hints_path, output_path);
        } else if (command == "avm_verify") {
            return avm_verify(proof_path, vk_path) ? 0 : 1;
#endif
        } else if (command == "prove_ultra_honk") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk<UltraFlavor>(bytecode_path, witness_path, output_path);
        } else if (command == "verify_ultra_honk") {
            return verify_honk<UltraFlavor>(proof_path, vk_path) ? 0 : 1;
        } else if (command == "write_vk_ultra_honk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_honk<UltraFlavor>(bytecode_path, output_path);
        } else if (command == "prove_mega_honk") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove_honk<MegaFlavor>(bytecode_path, witness_path, output_path);
        } else if (command == "verify_mega_honk") {
            return verify_honk<MegaFlavor>(proof_path, vk_path) ? 0 : 1;
        } else if (command == "write_vk_mega_honk") {
            std::string output_path = get_option(args, "-o", "./target/vk");
            write_vk_honk<MegaFlavor>(bytecode_path, output_path);
        } else if (command == "proof_as_fields_honk") {
            std::string output_path = get_option(args, "-o", proof_path + "_fields.json");
            proof_as_fields_honk(proof_path, output_path);
        } else if (command == "vk_as_fields_ultra_honk") {
            std::string output_path = get_option(args, "-o", vk_path + "_fields.json");
            vk_as_fields_honk<UltraFlavor>(vk_path, output_path);
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
