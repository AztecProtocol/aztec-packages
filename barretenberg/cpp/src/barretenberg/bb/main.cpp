#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "config.hpp"
#include "get_bytecode.hpp"
#include "get_crs.hpp"
#include "get_witness.hpp"
#include "log.hpp"
#include <barretenberg/common/benchmark.hpp>
#include <barretenberg/common/container.hpp>
#include <barretenberg/common/timer.hpp>
#include <barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp>
#include <barretenberg/dsl/acir_proofs/acir_composer.hpp>
#include <barretenberg/srs/global_crs.hpp>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace barretenberg;
std::string CRS_PATH = "./crs";
bool verbose = false;

const std::filesystem::path current_path = std::filesystem::current_path();
const auto current_dir = current_path.filename().string();

acir_proofs::AcirComposer init(acir_format::acir_format& constraint_system)
{
    acir_proofs::AcirComposer acir_composer(0, verbose);
    acir_composer.create_circuit(constraint_system);
    auto subgroup_size = acir_composer.get_circuit_subgroup_size();

    // Must +1!
    auto g1_data = get_g1_data(CRS_PATH, subgroup_size + 1);
    auto g2_data = get_g2_data(CRS_PATH);
    srs::init_crs_factory(g1_data, g2_data);

    return acir_composer;
}

acir_proofs::AcirComposer init()
{
    acir_proofs::AcirComposer acir_composer(0, verbose);
    auto g2_data = get_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    return acir_composer;
}

acir_format::WitnessVector get_witness(std::string const& witness_path)
{
    auto witness_data = get_witness_data(witness_path);
    return acir_format::witness_buf_to_witness_data(witness_data);
}

acir_format::acir_format get_constraint_system(std::string const& bytecode_path)
{
    auto bytecode = get_bytecode(bytecode_path);
    return acir_format::circuit_buf_to_acir_format(bytecode);
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
bool proveAndVerify(const std::string& bytecodePath, const std::string& witnessPath, bool recursive)
{
    auto constraint_system = get_constraint_system(bytecodePath);
    auto witness = get_witness(witnessPath);

    auto acir_composer = init(constraint_system);

    Timer pk_timer;
    acir_composer.init_proving_key(constraint_system);
    write_benchmark("pk_construction_time", pk_timer.milliseconds(), "acir_test", current_dir);
    write_benchmark("gate_count", acir_composer.get_total_circuit_size(), "acir_test", current_dir);
    write_benchmark("subgroup_size", acir_composer.get_circuit_subgroup_size(), "acir_test", current_dir);

    Timer proof_timer;
    auto proof = acir_composer.create_proof(constraint_system, witness, recursive);
    write_benchmark("proof_construction_time", proof_timer.milliseconds(), "acir_test", current_dir);

    Timer vk_timer;
    acir_composer.init_verification_key();
    write_benchmark("vk_construction_time", vk_timer.milliseconds(), "acir_test", current_dir);

    auto verified = acir_composer.verify_proof(proof, recursive);

    vinfo("verified: ", verified);
    return verified;
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
void prove(const std::string& bytecodePath,
           const std::string& witnessPath,
           bool recursive,
           const std::string& outputPath)
{
    auto constraint_system = get_constraint_system(bytecodePath);
    auto witness = get_witness(witnessPath);
    auto acir_composer = init(constraint_system);
    auto proof = acir_composer.create_proof(constraint_system, witness, recursive);

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
 * - stdout: The number of gates is written to stdout
 *
 * @param bytecodePath Path to the file containing the serialized circuit
 */
void gateCount(const std::string& bytecodePath)
{
    auto constraint_system = get_constraint_system(bytecodePath);
    auto acir_composer = init(constraint_system);
    auto gate_count = acir_composer.get_total_circuit_size();

    writeUint64AsRawBytesToStdout(static_cast<uint64_t>(gate_count));
    vinfo("gate count: ", gate_count);
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
 * @param recursive Whether to use recursive proof generation of non-recursive
 * @param vk_path Path to the file containing the serialized verification key
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
bool verify(const std::string& proof_path, bool recursive, const std::string& vk_path)
{
    auto acir_composer = init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    acir_composer.load_verification_key(std::move(vk_data));
    auto verified = acir_composer.verify_proof(read_file(proof_path), recursive);

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
    auto constraint_system = get_constraint_system(bytecodePath);
    auto acir_composer = init(constraint_system);
    acir_composer.init_proving_key(constraint_system);
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
    auto constraint_system = get_constraint_system(bytecodePath);
    auto acir_composer = init(constraint_system);
    auto pk = acir_composer.init_proving_key(constraint_system);
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
    auto acir_composer = init();
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
 * The proof computed by the non-recursive proof system is a byte array. This is fine since the proof will be verified
 * either natively or in a Solidity verifier. For the recursive proof system, the proof is verified in a circuit where
 * it is cheaper to work with field elements than byte arrays. This method converts the proof into a list of field
 * elements which can be used in the recursive proof system.
 *
 * This is an optimization which unfortunately leaks through the API. The repercussions of this are that users need to
 * convert proofs which are byte arrays to proofs which are lists of field elements, using the below method.
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
    auto acir_composer = init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    auto data = acir_composer.serialize_proof_into_fields(read_file(proof_path), vk_data.num_public_inputs);
    auto json = format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");

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
    auto acir_composer = init();
    auto vk_data = from_buffer<plonk::verification_key_data>(read_file(vk_path));
    acir_composer.load_verification_key(std::move(vk_data));
    auto data = acir_composer.serialize_verification_key_into_fields();

    // We need to move vk_hash to the front...
    std::rotate(data.begin(), data.end() - 1, data.end());

    auto json = format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
    if (output_path == "-") {
        writeStringToStdout(json);
        vinfo("vk as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("vk as fields written to: ", output_path);
    }
}

/**
 * @brief Returns ACVM related backend information
 *
 * Communication:
 * - stdout: The json string is written to stdout
 * - Filesystem: The json string is written to the path specified
 *
 * @param output_path Path to write the information to
 */
void acvm_info(const std::string& output_path)
{

    const char* jsonData = R"({
    "language": {
        "name" : "PLONK-CSAT",
        "width" : 3
    },
    "opcodes_supported" : ["arithmetic", "directive", "brillig", "memory_init", "memory_op"],
    "black_box_functions_supported" : ["and", "xor", "range", "sha256", "blake2s", "keccak256", "schnorr_verify", "pedersen", "pedersen_hash", "hash_to_field_128_security", "ecdsa_secp256k1", "ecdsa_secp256r1", "fixed_base_scalar_mul", "recursive_aggregation"]
    })";

    size_t length = strlen(jsonData);
    std::vector<uint8_t> data(jsonData, jsonData + length);

    if (output_path == "-") {
        writeRawBytesToStdout(data);
        vinfo("info written to stdout");
    } else {
        write_file(output_path, data);
        vinfo("info written to: ", output_path);
    }
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
        verbose = flag_present(args, "-v") || flag_present(args, "--verbose");

        if (args.empty()) {
            std::cerr << "No command provided.\n";
            return 1;
        }

        std::string command = args[0];

        std::string bytecode_path = get_option(args, "-b", "./target/acir.gz");
        std::string witness_path = get_option(args, "-w", "./target/witness.gz");
        std::string proof_path = get_option(args, "-p", "./proofs/proof");
        std::string vk_path = get_option(args, "-k", "./target/vk");
        std::string pk_path = get_option(args, "-r", "./target/pk");
        CRS_PATH = get_option(args, "-c", "./crs");
        bool recursive = flag_present(args, "-r") || flag_present(args, "--recursive");

        // Skip CRS initialization for any command which doesn't require the CRS.
        if (command == "--version") {
            writeStringToStdout(BB_VERSION);
            return 0;
        }
        if (command == "info") {
            std::string output_path = get_option(args, "-o", "info.json");
            acvm_info(output_path);
            return 0;
        }

        if (command == "prove_and_verify") {
            return proveAndVerify(bytecode_path, witness_path, recursive) ? 0 : 1;
        }
        if (command == "prove") {
            std::string output_path = get_option(args, "-o", "./proofs/proof");
            prove(bytecode_path, witness_path, recursive, output_path);
        } else if (command == "gates") {
            gateCount(bytecode_path);
        } else if (command == "verify") {
            return verify(proof_path, recursive, vk_path) ? 0 : 1;
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
        } else {
            std::cerr << "Unknown command: " << command << "\n";
            return 1;
        }
    } catch (std::runtime_error const& err) {
        std::cerr << err.what() << std::endl;
        return 1;
    }
}
