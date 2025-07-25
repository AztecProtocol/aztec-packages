#include "api_ultra_honk.hpp"

#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/get_bytecode.hpp"
#include "barretenberg/api/write_prover_output.hpp"
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
#include <sstream>

namespace bb {

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
    // Read input files
    auto bytecode = get_bytecode(bytecode_path);
    auto witness_vector = get_witness(witness_path);
    // Serialize witness to bytes - need to use Witnesses namespace types
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0;
    // Convert WitnessVector to Witness map
    for (size_t i = 0; i < witness_vector.size(); ++i) {
        // Convert field element to hex string (64 chars = 32 bytes)
        auto bytes = witness_vector[i].to_buffer();
        std::stringstream ss;
        for (const auto& byte : bytes) {
            ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
        }
        stack_item.witness.value[Witnesses::Witness{ static_cast<uint32_t>(i) }] = ss.str();
    }
    witness_stack.stack.push_back(stack_item);
    auto witness = witness_stack.bincodeSerialize();
    std::vector<uint8_t> vk_bytes;
    if (!vk_path.empty() && std::filesystem::exists(vk_path)) {
        vk_bytes = read_file(vk_path);
    }

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk,
                                         .honk_recursion = flags.honk_recursion,
                                         .recursive = flags.recursive };

    // Execute prove command and compute VK if needed
    const auto _prove_with_bbapi = [&]() -> PubInputsProofAndKey<UltraFlavor::VerificationKey> {
        auto response =
            bbapi::CircuitProve{ .circuit = { .name = "circuit", .bytecode = bytecode, .verification_key = vk_bytes },
                                 .witness = witness,
                                 .settings = settings }
                .execute();

        // Always compute VK for the return value (write function will decide what to output)
        auto vk_response =
            bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = bytecode }, .settings = settings }
                .execute();

        auto vk = from_buffer<UltraFlavor::VerificationKey>(vk_response.bytes);
        return {
            response.public_inputs, response.proof, std::make_shared<UltraFlavor::VerificationKey>(vk), vk.hash()
        };
    };

    // Write output
    const auto _write = [&](auto&& _prove_output) {
        write(_prove_output, flags.output_format, flags.write_vk ? "proof_and_vk" : "proof", output_dir);
    };

    _write(_prove_with_bbapi());
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
                                         .disable_zk = flags.disable_zk,
                                         .honk_recursion = flags.honk_recursion,
                                         .recursive = flags.recursive };

    // Execute verify command
    auto response = bbapi::CircuitVerify{ .verification_key = vk_bytes,
                                          .public_inputs = public_inputs,
                                          .proof = proof,
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
                            const std::filesystem::path& output_path)
{
    // Read bytecode
    auto bytecode = get_bytecode(bytecode_path);

    // Convert flags to ProofSystemSettings
    bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                         .oracle_hash_type = flags.oracle_hash_type,
                                         .disable_zk = flags.disable_zk,
                                         .honk_recursion = flags.honk_recursion,
                                         .recursive = flags.recursive };

    // Execute compute VK command
    auto response =
        bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    // Get the VK and write output
    auto vk = from_buffer<UltraFlavor::VerificationKey>(response.bytes);
    PubInputsProofAndKey<UltraFlavor::VerificationKey> output{
        {}, {}, std::make_shared<UltraFlavor::VerificationKey>(vk), vk.hash()
    };
    write(output, flags.output_format, "vk", output_path);
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
    {

        // Convert flags to ProofSystemSettings
        bbapi::ProofSystemSettings settings{ .ipa_accumulation = flags.ipa_accumulation,
                                             .oracle_hash_type = flags.oracle_hash_type,
                                             .disable_zk = flags.disable_zk,
                                             .honk_recursion = flags.honk_recursion,
                                             .recursive = flags.recursive };

        // Execute CircuitInfo command
        auto response =
            bbapi::CircuitInfo{ .circuit = { .name = "circuit", .bytecode = bytecode, .verification_key = {} },
                                .include_gates_per_opcode = flags.include_gates_per_opcode,
                                .settings = settings }
                .execute();

        vinfo("Calculated circuit size in gate_count: ", response.total_gates);

        // Build individual circuit report to match original gate_count output
        std::string gates_per_opcode_str;
        if (flags.include_gates_per_opcode) {
            bool first = true;
            // CircuitInfo returns a map, we need to convert back to array format
            // Note: This assumes opcodes are stored as "opcode_N" in order
            size_t max_opcode = 0;
            for (const auto& [key, value] : response.gates_per_opcode) {
                if (key.starts_with("opcode_")) {
                    size_t opcode_idx = std::stoull(key.substr(7));
                    max_opcode = std::max(max_opcode, opcode_idx);
                }
            }

            for (size_t j = 0; j <= max_opcode; j++) {
                if (!first)
                    gates_per_opcode_str += ",";
                first = false;

                auto it = response.gates_per_opcode.find("opcode_" + std::to_string(j));
                if (it != response.gates_per_opcode.end()) {
                    gates_per_opcode_str += std::to_string(it->second);
                } else {
                    gates_per_opcode_str += "0";
                }
            }
        }

        // For now, we'll use the CircuitInfo response which includes circuit statistics
        // The num_acir_opcodes is not directly available from bytecode alone
        auto result_string = format(
            "{\n        \"acir_opcodes\": ",
            1, // TODO(https://github.com/AztecProtocol/barretenberg/issues/1074): Get actual opcode count from bytecode
            ",\n        \"circuit_size\": ",
            response.total_gates,
            (flags.include_gates_per_opcode ? format(",\n        \"gates_per_opcode\": [", gates_per_opcode_str, "]")
                                            : ""),
            "\n  }");

        functions_string = format(functions_string, result_string);
    }
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
                                         .disable_zk = flags.disable_zk,
                                         .honk_recursion = flags.honk_recursion,
                                         .recursive = flags.recursive };

    // Execute solidity verifier command
    auto response = bbapi::CircuitWriteSolidityVerifier{ .verification_key = vk_bytes, .settings = settings }.execute();

    // Write output
    if (output_path == "-") {
        std::cout << response.solidity_code;
    } else {
        write_file(output_path, { response.solidity_code.begin(), response.solidity_code.end() });
        if (flags.disable_zk) {
            info("ZK Honk solidity verifier saved to ", output_path);
        } else {
            info("Honk solidity verifier saved to ", output_path);
        }
    }
}

template <typename Flavor>
void write_recursion_inputs_ultra_honk(const std::string& bytecode_path,
                                       const std::string& witness_path,
                                       const std::string& output_path)
{
    // Read input files
    auto bytecode = get_bytecode(bytecode_path);
    auto witness_vector = get_witness(witness_path);
    // Serialize witness to bytes - need to use Witnesses namespace types
    Witnesses::WitnessStack witness_stack;
    Witnesses::StackItem stack_item;
    stack_item.index = 0;
    // Convert WitnessVector to Witness map
    for (size_t i = 0; i < witness_vector.size(); ++i) {
        // Convert field element to hex string (64 chars = 32 bytes)
        auto bytes = witness_vector[i].to_buffer();
        std::stringstream ss;
        for (const auto& byte : bytes) {
            ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
        }
        stack_item.witness.value[Witnesses::Witness{ static_cast<uint32_t>(i) }] = ss.str();
    }
    witness_stack.stack.push_back(stack_item);
    auto witness = witness_stack.bincodeSerialize();

    // Determine settings based on flavor
    bbapi::ProofSystemSettings settings;
    if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        settings.ipa_accumulation = true;
    }

    // Execute prove to get proof and VK
    auto prove_response =
        bbapi::CircuitProve{ .circuit = { .name = "circuit", .bytecode = bytecode, .verification_key = {} },
                             .witness = witness,
                             .settings = settings }
            .execute();

    // Get VK
    auto vk_response =
        bbapi::CircuitComputeVk{ .circuit = { .name = "circuit", .bytecode = bytecode }, .settings = settings }
            .execute();

    // Reconstruct full proof with public inputs
    std::vector<bb::fr> proof = prove_response.public_inputs;
    proof.insert(proof.end(), prove_response.proof.begin(), prove_response.proof.end());

    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(
        from_buffer<typename Flavor::VerificationKey>(vk_response.bytes));

    bool ipa_accumulation = false;
    if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        ipa_accumulation = true;
    }
    const std::string toml_content =
        acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(proof, verification_key, ipa_accumulation);

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