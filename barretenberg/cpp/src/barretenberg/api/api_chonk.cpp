#include "api_chonk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/json_output.hpp"
#include "barretenberg/api/log.hpp"
#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include <algorithm>
#include <stdexcept>

namespace bb {
namespace { // anonymous namespace

void write_chonk_vk_bytes(const std::vector<uint8_t>& vk_bytes,
                          const std::filesystem::path& output_path,
                          const API::Flags& flags)
{
    const bool is_stdout = output_path == "-";
    if (is_stdout) {
        write_bytes_to_stdout(vk_bytes);
    } else if (flags.output_format == "json") {
        auto vk = from_buffer<Chonk::MegaVerificationKey>(vk_bytes);
        // Note: Chonk VK doesn't have a hash, so we pass an empty string
        std::string json_content = VkJson::build(vk.to_field_elements(), "", flags.scheme);
        write_file(output_path / "vk.json", std::vector<uint8_t>(json_content.begin(), json_content.end()));
        info("VK (JSON) saved to ", output_path / "vk.json");
    } else {
        write_file(output_path / "vk", vk_bytes);
    }
}

/**
 * @brief Compute and write to file a MegaHonk VK for a circuit to be accumulated by Chonk.
 * @note This method differes from write_vk_honk<MegaFlavor> in that it handles kernel circuits which require special
 * treatment (i.e. construction of mock IVC state to correctly complete the kernel logic).
 *
 * @param bytecode ACIR bytecode of the circuit
 * @param output_path Directory to write the VK (or "-" for stdout)
 * @param flags API flags including output_format and use_zk_flavor (selects MegaZKFlavor vs MegaFlavor)
 */
void write_chonk_vk(std::vector<uint8_t> bytecode, const std::filesystem::path& output_path, const API::Flags& flags)
{
    auto response =
        bbapi::ChonkComputeVk{ .circuit = { .bytecode = std::move(bytecode) }, .use_zk_flavor = flags.use_zk_flavor }
            .execute();

    write_chonk_vk_bytes(response.bytes, output_path, flags);
}
} // anonymous namespace

void ChonkAPI::prove(const Flags& flags,
                     const std::filesystem::path& input_path,
                     const std::filesystem::path& output_dir)
{
    BB_BENCH_NAME("ChonkAPI::prove");
    bbapi::BBApiRequest request;
    request.vk_policy = bbapi::parse_vk_policy(flags.vk_policy);
    std::vector<PrivateExecutionStepRaw> raw_steps = PrivateExecutionStepRaw::load_and_decompress(input_path);

    bbapi::ChonkStart{ .num_circuits = static_cast<uint32_t>(raw_steps.size()) }.execute(request);
    info("Chonk: starting with ", raw_steps.size(), " circuits");
    for (size_t i = 0; i < raw_steps.size(); ++i) {
        const auto& step = raw_steps[i];
        bbapi::ChonkLoad{
            .circuit = { .name = step.function_name, .bytecode = step.bytecode, .verification_key = step.vk },
        }
            .execute(request);

        // NOLINTNEXTLINE(bugprone-unchecked-optional-access): we know the optional has been set here.
        info("Chonk: accumulating " + step.function_name);
        bbapi::ChonkAccumulate{ .witness = step.witness }.execute(request);
    }

    auto prove_response = bbapi::ChonkProve{}.execute(request);
    auto proof = std::move(prove_response.proof);

    const bool output_to_stdout = output_dir == "-";

    const auto write_proof = [&]() {
        const auto proof_fields = proof.to_field_elements();
        if (output_to_stdout) {
            vinfo("writing Chonk proof to stdout");
            write_bytes_to_stdout(to_buffer(proof_fields));
        } else if (flags.output_format == "json") {
            vinfo("writing Chonk proof (JSON) in directory ", output_dir);
            // Note: Chonk proof doesn't have a vk_hash, so we pass an empty string
            std::string json_content = ProofJson::build(proof_fields, "", flags.scheme);
            write_file(output_dir / "proof.json", std::vector<uint8_t>(json_content.begin(), json_content.end()));
            info("Proof (JSON) saved to ", output_dir / "proof.json");
        } else {
            vinfo("writing Chonk proof in directory ", output_dir);
            write_file(output_dir / "proof", to_buffer(proof_fields));
        }
    };

    write_proof();

    if (flags.write_vk) {
        vinfo("writing Chonk vk in directory ", output_dir);
        write_chonk_vk_bytes(prove_response.vk, output_dir, flags);
    }
}

bool ChonkAPI::verify([[maybe_unused]] const Flags& flags,
                      [[maybe_unused]] const std::filesystem::path& public_inputs_path,
                      const std::filesystem::path& proof_path,
                      const std::filesystem::path& vk_path)
{
    BB_BENCH_NAME("ChonkAPI::verify");
    auto proof_fields = many_from_buffer<fr>(read_file(proof_path));
    auto proof = ChonkProof::from_field_elements(proof_fields);

    auto vk_buffer = read_vk_file(vk_path);

    auto response = bbapi::ChonkVerify{ .proof = std::move(proof), .vk = std::move(vk_buffer) }.execute();
    return response.valid;
}

bool ChonkAPI::batch_verify([[maybe_unused]] const Flags& flags, const std::filesystem::path& proofs_dir)
{
    BB_BENCH_NAME("ChonkAPI::batch_verify");

    std::vector<ChonkProof> proofs;
    std::vector<std::vector<uint8_t>> vks;

    for (size_t i = 0;; ++i) {
        auto proof_file = proofs_dir / ("proof_" + std::to_string(i));
        auto vk_file = proofs_dir / ("vk_" + std::to_string(i));

        if (!std::filesystem::exists(proof_file) || !std::filesystem::exists(vk_file)) {
            break;
        }

        auto proof_fields = many_from_buffer<fr>(read_file(proof_file));
        proofs.push_back(ChonkProof::from_field_elements(proof_fields));
        vks.push_back(read_vk_file(vk_file));
    }

    if (proofs.empty()) {
        throw_or_abort("batch_verify: no proof_0/vk_0 pairs found in " + proofs_dir.string());
    }

    info("ChonkAPI::batch_verify - found ", proofs.size(), " proof/vk pairs in ", proofs_dir.string());

    auto response = bbapi::ChonkBatchVerify{ .proofs = std::move(proofs), .vks = std::move(vks) }.execute();
    return response.valid;
}

void ChonkAPI::proof_stats(const std::filesystem::path& proof_path, const std::filesystem::path& output_path)
{
    auto proof_fields = many_from_buffer<fr>(read_file(proof_path));
    auto proof = ChonkProof::from_field_elements(proof_fields);

    auto compressed = ProofCompressor::compress_chonk_proof(proof);

    std::string json = "{\n"
                       "  \"compressed_proof_size_bytes\": " +
                       std::to_string(compressed.size()) +
                       "\n"
                       "}";

    if (output_path == "-") {
        std::cout << json << std::endl;
    } else {
        write_file(output_path, std::vector<uint8_t>(json.begin(), json.end()));
        // Write the compressed proof alongside the JSON for further processing (e.g. gzip)
        auto compressed_proof_path = output_path;
        compressed_proof_path.replace_extension(".bin");
        write_file(compressed_proof_path, compressed);
        info("Proof stats written to ", output_path);
    }
}

// WORKTODO(bbapi) remove this
bool ChonkAPI::prove_and_verify(const std::filesystem::path& input_path)
{
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    std::shared_ptr<Chonk> ivc = steps.accumulate();
    // Construct the hiding kernel as the final step of the IVC

    auto proof = ivc->prove();
    auto vk_and_hash = ivc->get_hiding_kernel_vk_and_hash();
    ChonkNativeVerifier verifier(vk_and_hash);
    const bool verified = verifier.verify(proof);
    return verified;
}

void ChonkAPI::gates(const Flags& flags, const std::filesystem::path& bytecode_path)
{
    BB_BENCH_NAME("ChonkAPI::gates");
    chonk_gate_count(bytecode_path.string(), flags.include_gates_per_opcode);
}

void ChonkAPI::write_solidity_verifier([[maybe_unused]] const Flags& flags,
                                       [[maybe_unused]] const std::filesystem::path& output_path,
                                       [[maybe_unused]] const std::filesystem::path& vk_path)
{
    BB_BENCH_NAME("ChonkAPI::write_solidity_verifier");
    throw_or_abort("API function contract not implemented");
}

bool ChonkAPI::check_precomputed_vks(const Flags& flags, const std::filesystem::path& input_path)
{
    BB_BENCH_NAME("ChonkAPI::check_precomputed_vks");
    bbapi::BBApiRequest request;
    std::vector<PrivateExecutionStepRaw> raw_steps = PrivateExecutionStepRaw::load_and_decompress(input_path);

    bbapi::VkPolicy vk_policy = bbapi::parse_vk_policy(flags.vk_policy);
    bool check_failed = false;
    for (size_t i = 0; i < raw_steps.size(); ++i) {
        auto& step = raw_steps[i];
        if (step.vk.empty()) {
            info("FAIL: Expected precomputed vk for function ", step.function_name);
            return false;
        }
        const bool use_zk_flavor = (i == raw_steps.size() - 1);
        auto response =
            bbapi::ChonkCheckPrecomputedVk{
                .circuit = { .name = step.function_name, .bytecode = step.bytecode, .verification_key = step.vk },
                .use_zk_flavor = use_zk_flavor,
            }
                .execute();

        if (!response.valid) {
            info("VK mismatch detected for function ", step.function_name);
            if (vk_policy != bbapi::VkPolicy::REWRITE) {
                info("Computed VK differs from precomputed VK in ivc-inputs.msgpack");
                return false;
            }
            info("Updating VK in ivc-inputs.msgpack with computed value");
            step.vk = response.actual_vk;
            check_failed = true;
        }
    }
    if (check_failed) {
        PrivateExecutionStepRaw::compress_and_save(std::move(raw_steps), input_path);
        return false;
    }
    return true;
}

void ChonkAPI::write_vk(const Flags& flags,
                        const std::filesystem::path& bytecode_path,
                        const std::filesystem::path& output_path)
{
    BB_BENCH_NAME("ChonkAPI::write_vk");
    write_chonk_vk(get_bytecode(bytecode_path), output_path, flags);
}

bool ChonkAPI::check([[maybe_unused]] const Flags& flags,
                     [[maybe_unused]] const std::filesystem::path& bytecode_path,
                     [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function check_witness not implemented");
    return false;
}

void chonk_gate_count(const std::string& bytecode_path, bool include_gates_per_opcode)
{
    BB_BENCH_NAME("chonk_gate_count");
    // All circuit reports will be built into the std::string below
    std::string functions_string = "{\"functions\": [\n  ";

    bbapi::BBApiRequest request;

    auto bytecode = get_bytecode(bytecode_path);
    auto response = bbapi::ChonkStats{ .circuit = { .name = "ivc_circuit", .bytecode = std::move(bytecode) },
                                       .include_gates_per_opcode = include_gates_per_opcode }
                        .execute(request);

    // Build the circuit report. It always has one function, corresponding to the ACIR constraint systems.
    // NOTE: can be reconsidered
    std::string gates_per_opcode_str;
    if (include_gates_per_opcode && !response.gates_per_opcode.empty()) {
        for (size_t j = 0; j < response.gates_per_opcode.size(); j++) {
            gates_per_opcode_str += std::to_string(response.gates_per_opcode[j]);
            if (j != response.gates_per_opcode.size() - 1) {
                gates_per_opcode_str += ",";
            }
        }
    }
    auto result_string = format(
        "{\n        \"acir_opcodes\": ",
        response.acir_opcodes,
        ",\n        \"circuit_size\": ",
        response.circuit_size,
        (include_gates_per_opcode ? format(",\n        \"gates_per_opcode\": [", gates_per_opcode_str, "]") : ""),
        "\n  }");
    functions_string = format(functions_string, result_string);
    std::cout << format(functions_string, "\n]}");
}

} // namespace bb
