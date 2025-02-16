#include "api_ultra_plonk.hpp"
#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/get_bn254_crs.hpp"
#include "barretenberg/api/init_srs.hpp"
#include "barretenberg/common/benchmark.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/timer.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_proofs/acir_composer.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb {
extern std::string CRS_PATH;

// Initializes without loading G1
// TODO(https://github.com/AztecProtocol/barretenberg/issues/811) adapt for grumpkin
acir_proofs::AcirComposer verifier_init()
{
    acir_proofs::AcirComposer acir_composer(0, verbose_logging);
    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    return acir_composer;
}

std::string to_json(const std::vector<bb::fr>& data)
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

    const std::filesystem::path current_path = std::filesystem::current_path();
    const auto current_dir = current_path.filename().string();
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
        std::cout << contract;
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
        std::cout << json;
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
        std::cout << json;
        vinfo("vk as fields written to stdout");
    } else {
        write_file(output_path, { json.begin(), json.end() });
        vinfo("vk as fields written to: ", output_path);
    }
}
} // namespace bb
