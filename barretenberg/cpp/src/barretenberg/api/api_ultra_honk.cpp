#include "api_ultra_honk.hpp"

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/json_output.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_optimized_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <optional>

namespace bb {

namespace {

void write_vk_outputs(const bbapi::CircuitComputeVk::Response& vk_response,
                      const std::filesystem::path& output_dir,
                      const API::Flags& flags)
{
    if (flags.output_format == "json") {
        std::string json_content =
            VkJson::build(vk_response.fields, bytes_to_hex_string(vk_response.hash), flags.scheme);
        write_file(output_dir / "vk.json", std::vector<uint8_t>(json_content.begin(), json_content.end()));
        info("VK (JSON) saved to ", output_dir / "vk.json");
    } else {
        write_file(output_dir / "vk", vk_response.bytes);
        info("VK saved to ", output_dir / "vk");
        write_file(output_dir / "vk_hash", vk_response.hash);
        info("VK Hash saved to ", output_dir / "vk_hash");
    }
}

void write_proof_outputs(const bbapi::CircuitProve::Response& prove_response,
                         const std::filesystem::path& output_dir,
                         const API::Flags& flags)
{
    if (flags.output_format == "json") {
        std::string vk_hash = bytes_to_hex_string(prove_response.vk.hash);
        std::string proof_json = ProofJson::build(prove_response.proof, vk_hash, flags.scheme);
        write_file(output_dir / "proof.json", std::vector<uint8_t>(proof_json.begin(), proof_json.end()));
        info("Proof (JSON) saved to ", output_dir / "proof.json");

        std::string pi_json = PublicInputsJson::build(prove_response.public_inputs, flags.scheme);
        write_file(output_dir / "public_inputs.json", std::vector<uint8_t>(pi_json.begin(), pi_json.end()));
        info("Public inputs (JSON) saved to ", output_dir / "public_inputs.json");
    } else {
        auto public_inputs_buf = to_buffer(prove_response.public_inputs);
        auto proof_buf = to_buffer(prove_response.proof);

        write_file(output_dir / "public_inputs", public_inputs_buf);
        write_file(output_dir / "proof", proof_buf);
        info("Public inputs saved to ", output_dir / "public_inputs");
        info("Proof saved to ", output_dir / "proof");
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
    BB_BENCH_NAME("UltraHonkAPI::prove");
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

    if (!vk_path.empty() && !flags.write_vk) {
        vk_bytes = read_file(vk_path);
    }

    // Prove
    auto response = bbapi::CircuitProve{ .circuit = { .name = "circuit",
                                                      .bytecode = std::move(bytecode),
                                                      .verification_key = std::move(vk_bytes) },
                                         .witness = std::move(witness),
                                         .settings = std::move(settings) }
                        .execute();
    write_proof_outputs(response, output_dir, flags);
    if (flags.write_vk) {
        write_vk_outputs(response.vk, output_dir, flags);
    }
}

bool UltraHonkAPI::verify(const Flags& flags,
                          const std::filesystem::path& public_inputs_path,
                          const std::filesystem::path& proof_path,
                          const std::filesystem::path& vk_path)
{
    BB_BENCH_NAME("UltraHonkAPI::verify");

    // Read and parse input files (auto-detect JSON vs binary format)
    std::vector<uint256_t> public_inputs;
    std::vector<uint256_t> proof;
    std::vector<uint8_t> vk_bytes;

    auto public_inputs_content = read_file(public_inputs_path);
    if (auto json = try_parse_json(public_inputs_content)) {
        public_inputs = PublicInputsJson::parse(*json);
    } else {
        public_inputs = many_from_buffer<uint256_t>(public_inputs_content);
    }

    auto proof_content = read_file(proof_path);
    if (auto json = try_parse_json(proof_content)) {
        proof = ProofJson::parse(*json);
    } else {
        proof = many_from_buffer<uint256_t>(proof_content);
    }

    auto vk_content = read_file(vk_path);
    if (auto json = try_parse_json(vk_content)) {
        vk_bytes = VkJson::parse_to_bytes(*json);
    } else {
        vk_bytes = std::move(vk_content);
    }

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
    BB_BENCH_NAME("UltraHonkAPI::write_vk");
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

    auto response = bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = std::move(bytecode) },
                                             .settings = settings }
                        .execute();

    write_vk_outputs(response, output_dir, flags);
}

void UltraHonkAPI::gates([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path)
{
    BB_BENCH_NAME("UltraHonkAPI::gates");
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

    // Execute CircuitStats command
    auto response = bbapi::CircuitStats{ .circuit = { .name = "circuit", .bytecode = bytecode, .verification_key = {} },
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

    // For now, we'll use the CircuitStats response which includes circuit statistics
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
    BB_BENCH_NAME("UltraHonkAPI::write_solidity_verifier");
    // Read VK file
    auto vk_bytes = read_vk_file(vk_path);

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk,
                                         .optimized_solidity_verifier = flags.optimized_solidity_verifier };

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
} // namespace bb
