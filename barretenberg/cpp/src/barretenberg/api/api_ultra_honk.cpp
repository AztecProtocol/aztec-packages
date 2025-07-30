#include "api_ultra_honk.hpp"

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/get_bytecode.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <iomanip>
#include <optional>
#include <sstream>

namespace bb {

namespace {

void write_vk_outputs(const bbapi::CircuitComputeVk::Response& vk_response,
                      const std::string& output_format,
                      const std::filesystem::path& output_dir)
{
    if (output_format == "bytes" || output_format == "bytes_and_fields") {
        write_file(output_dir / "vk", vk_response.bytes);
        info("VK saved to ", output_dir / "vk");
        write_file(output_dir / "vk_hash", vk_response.hash);
        info("VK Hash saved to ", output_dir / "vk_hash");
    }

    if (output_format == "fields" || output_format == "bytes_and_fields") {
        // Use the fields directly from vk_response
        std::string vk_json = field_elements_to_json(vk_response.fields);
        write_file(output_dir / "vk_fields.json", { vk_json.begin(), vk_json.end() });
        info("VK fields saved to ", output_dir / "vk_fields.json");

        // For vk_hash fields - convert the bytes to fr and then to JSON
        auto vk_hash_fr = from_buffer<fr>(vk_response.hash);
        std::string vk_hash_json = format("\"", vk_hash_fr, "\"");
        write_file(output_dir / "vk_hash_fields.json", { vk_hash_json.begin(), vk_hash_json.end() });
        info("VK Hash fields saved to ", output_dir / "vk_hash_fields.json");
    }
}

void write_proof_outputs(const bbapi::CircuitProve::Response& prove_response,
                         const std::string& output_format,
                         const std::filesystem::path& output_dir)
{
    if (output_format == "bytes" || output_format == "bytes_and_fields") {
        auto public_inputs_buf = to_buffer(prove_response.public_inputs);
        auto proof_buf = to_buffer(prove_response.proof);

        write_file(output_dir / "public_inputs", public_inputs_buf);
        write_file(output_dir / "proof", proof_buf);
        info("Public inputs saved to ", output_dir / "public_inputs");
        info("Proof saved to ", output_dir / "proof");
    }

    if (output_format == "fields" || output_format == "bytes_and_fields") {
        std::string public_inputs_json = field_elements_to_json(prove_response.public_inputs);
        std::string proof_json = field_elements_to_json(prove_response.proof);

        write_file(output_dir / "public_inputs_fields.json", { public_inputs_json.begin(), public_inputs_json.end() });
        write_file(output_dir / "proof_fields.json", { proof_json.begin(), proof_json.end() });
        info("Public inputs fields saved to ", output_dir / "public_inputs_fields.json");
        info("Proof fields saved to ", output_dir / "proof_fields.json");
    }
}

} // anonymous namespace

bool UltraHonkAPI::check([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path,
                         [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function check_witness not implemented");
    return false;
}

void UltraHonkAPI::prove(const Flags& flags,
                         const std::filesystem::path& bytecode_path,
                         const std::filesystem::path& witness_path,
                         const std::filesystem::path& vk_path,
                         const std::filesystem::path& output_dir)
{
    // Validate output directory
    if (output_dir == "-") {
        throw_or_abort("Stdout output is not supported. Please specify an output directory.");
    }

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk };

    // Read input files
    auto bytecode = get_bytecode(bytecode_path);
    auto witness = get_bytecode(witness_path);

    // Handle VK
    std::vector<uint8_t> vk_bytes;

    if (flags.write_vk) {
        info("WARNING: computing verification key while proving due to write_vk. Precompute the VK and don't pass "
             "--write_vk for better performance.");
        auto vk_response =
            bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = bytecode }, .settings = settings }
                .execute();

        // Write VK outputs separately
        write_vk_outputs(vk_response, flags.output_format, output_dir);
        vk_bytes = std::move(vk_response.bytes);
    } else {
        vk_bytes = read_file(vk_path);
    }

    // Prove
    auto prove_response = bbapi::CircuitProve{ .circuit = { .name = "circuit",
                                                            .bytecode = std::move(bytecode),
                                                            .verification_key = std::move(vk_bytes) },
                                               .witness = std::move(witness),
                                               .settings = std::move(settings) }
                              .execute();

    // Write proof outputs (not VK - that's handled above)
    write_proof_outputs(prove_response, flags.output_format, output_dir);
}

bool UltraHonkAPI::verify(const Flags& flags,
                          const std::filesystem::path& public_inputs_path,
                          const std::filesystem::path& proof_path,
                          const std::filesystem::path& vk_path)
{
    // Read input files
    auto public_inputs = many_from_buffer<bb::fr>(read_file(public_inputs_path));
    auto proof = many_from_buffer<bb::fr>(read_file(proof_path));
    auto vk_bytes = read_file(vk_path);

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk };

    // Execute verify command
    auto response = bbapi::CircuitVerify{ .verification_key = std::move(vk_bytes),
                                          .public_inputs = std::move(public_inputs),
                                          .proof = std::move(proof),
                                          .settings = settings }
                        .execute();

    return response.verified;
}

bool UltraHonkAPI::prove_and_verify([[maybe_unused]] const Flags& flags,
                                    [[maybe_unused]] const std::filesystem::path& bytecode_path,
                                    [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function prove_and_verify not implemented");
    return false;
}

void UltraHonkAPI::write_vk(const Flags& flags,
                            const std::filesystem::path& bytecode_path,
                            const std::filesystem::path& output_dir)
{
    // Validate output directory
    if (output_dir == "-") {
        throw_or_abort("Stdout output is not supported. Please specify an output directory.");
    }

    // Read bytecode
    auto bytecode = get_bytecode(bytecode_path);

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk };

    // Execute compute VK command
    auto response = bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = std::move(bytecode) },
                                             .settings = settings }
                        .execute();

    // Write VK outputs using the helper function
    write_vk_outputs(response, flags.output_format, output_dir);
}

void UltraHonkAPI::gates([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path)
{
    // Get the bytecode directly
    auto bytecode = get_bytecode(bytecode_path);

    // All circuit reports will be built into the string below
    std::string functions_string = "{\"functions\": [\n  ";

    // For now, treat the entire bytecode as a single circuit
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1074): Handle multi-circuit programs properly
    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk };

    // Execute CircuitGates command
    auto response = bbapi::CircuitGates{ .circuit = { .name = "circuit", .bytecode = bytecode, .verification_key = {} },
                                         .include_gates_per_opcode = flags.include_gates_per_opcode,
                                         .settings = settings }
                        .execute();

    vinfo("Calculated circuit size in gate_count: ", response.num_gates);

    // Build individual circuit report to match original gate_count output
    std::string gates_per_opcode_str;
    if (flags.include_gates_per_opcode) {
        size_t i = 0;
        for (size_t count : response.gates_per_opcode) {
            if (i != 0) {
                gates_per_opcode_str += ",";
            }
            gates_per_opcode_str += std::to_string(count);
            i++;
        }
    }

    // For now, we'll use the CircuitGates response which includes circuit statistics
    // The num_acir_opcodes is not directly available from bytecode alone
    auto result_string = format(
        "{\n        \"acir_opcodes\": ",
        response.num_acir_opcodes,
        ",\n        \"circuit_size\": ",
        response.num_gates,
        (flags.include_gates_per_opcode ? format(",\n        \"gates_per_opcode\": [", gates_per_opcode_str, "]") : ""),
        "\n  }");

    functions_string = format(functions_string, result_string);
    std::cout << format(functions_string, "\n]}");
}

void UltraHonkAPI::write_solidity_verifier(const Flags& flags,
                                           const std::filesystem::path& output_path,
                                           const std::filesystem::path& vk_path)
{
    // Read VK file
    auto vk_bytes = read_file(vk_path);

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk };

    // Execute solidity verifier command
    auto response = bbapi::CircuitWriteSolidityVerifier{ .verification_key = vk_bytes, .settings = settings }.execute();

    // Write output
    if (output_path == "-") {
        std::cout << response.solidity_code;
    } else {
        write_file(output_path, { response.solidity_code.begin(), response.solidity_code.end() });
        if (flags.disable_zk) {
            info("Honk solidity verifier saved to ", output_path);
        } else {
            info("ZK Honk solidity verifier saved to ", output_path);
        }
    }
}

template <typename Flavor>
void write_recursion_inputs_ultra_honk(const std::string& bytecode_path,
                                       const std::string& witness_path,
                                       const std::string& output_path)
{
    // Read input files directly as bytes
    auto bytecode = get_bytecode(bytecode_path);
    auto witness = get_bytecode(witness_path);

    // Determine settings based on flavor
    bbapi::ProofSystemSettings settings;
    if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        settings.ipa_accumulation = true;
    }

    // Get VK first (needed for proving)
    auto vk_response =
        bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    // Execute prove with the VK
    auto prove_response = bbapi::CircuitProve{ .circuit = { .name = "circuit",
                                                            .bytecode = std::move(bytecode),
                                                            .verification_key = std::move(vk_response.bytes) },
                                               .witness = std::move(witness),
                                               .settings = settings }
                              .execute();

    // Reconstruct full proof with public inputs
    std::vector<bb::fr> proof = prove_response.public_inputs;
    proof.insert(proof.end(), prove_response.proof.begin(), prove_response.proof.end());

    // Deserialize VK for ProofSurgeon
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(
        from_buffer<typename Flavor::VerificationKey>(vk_response.bytes));

    // Generate TOML content
    const std::string toml_content = acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(
        proof, verification_key, settings.ipa_accumulation);

    // Write to file
    const std::string toml_path = output_path + "/Prover.toml";
    write_file(toml_path, { toml_content.begin(), toml_content.end() });
}

template void write_recursion_inputs_ultra_honk<UltraFlavor>(const std::string& bytecode_path,
                                                             const std::string& witness_path,
                                                             const std::string& output_path);

template void write_recursion_inputs_ultra_honk<UltraRollupFlavor>(const std::string& bytecode_path,
                                                                   const std::string& witness_path,
                                                                   const std::string& output_path);
} // namespace bb
