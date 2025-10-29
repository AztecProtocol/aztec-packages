#include "api_chonk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/log.hpp"
#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include <algorithm>
#include <sstream>
#include <stdexcept>

namespace bb {
namespace { // anonymous namespace

/**
 * @brief Compute and write to file a MegaHonk VK for a circuit to be accumulated in the IVC
 * @note This method differes from write_vk_honk<MegaFlavor> in that it handles kernel circuits which require special
 * treatment (i.e. construction of mock IVC state to correctly complete the kernel logic).
 *
 * @param bytecode_path
 * @param witness_path
 */
void write_standalone_vk(std::vector<uint8_t> bytecode, const std::filesystem::path& output_path)
{
    auto response = bbapi::ChonkComputeStandaloneVk{
        .circuit = { .name = "standalone_circuit", .bytecode = std::move(bytecode) }
    }.execute();

    bool is_stdout = output_path == "-";
    if (is_stdout) {
        write_bytes_to_stdout(response.bytes);
    } else {
        write_file(output_path / "vk", response.bytes);
    }
}
void write_chonk_vk(std::vector<uint8_t> bytecode, const std::filesystem::path& output_dir)
{
    // compute the hiding kernel's vk
    info("Chonk: computing IVC vk for hiding kernel circuit");
    auto response = bbapi::ChonkComputeIvcVk{ .circuit{ .bytecode = std::move(bytecode) } }.execute();
    const bool output_to_stdout = output_dir == "-";
    if (output_to_stdout) {
        write_bytes_to_stdout(response.bytes);
    } else {
        write_file(output_dir / "vk", response.bytes);
    }
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

    bbapi::ChonkStart{ .num_circuits = raw_steps.size() }.execute(request);
    info("Chonk: starting with ", raw_steps.size(), " circuits");
    for (const auto& step : raw_steps) {
        bbapi::ChonkLoad{
            .circuit = { .name = step.function_name, .bytecode = step.bytecode, .verification_key = step.vk }
        }.execute(request);

        // NOLINTNEXTLINE(bugprone-unchecked-optional-access): we know the optional has been set here.
        info("Chonk: accumulating " + step.function_name);
        bbapi::ChonkAccumulate{ .witness = step.witness }.execute(request);
    }

    auto proof = bbapi::ChonkProve{}.execute(request).proof;

    // We'd like to use the `write` function that UltraHonkAPI uses, but there are missing functions for creating
    // std::string representations of vks that don't feel worth implementing
    const bool output_to_stdout = output_dir == "-";

    const auto write_proof = [&]() {
        const auto buf = to_buffer(proof.to_field_elements());
        if (output_to_stdout) {
            vinfo("writing Chonk proof to stdout");
            write_bytes_to_stdout(buf);
        } else {
            vinfo("writing Chonk proof in directory ", output_dir);
            write_file(output_dir / "proof", buf);
        }
    };

    write_proof();

    if (flags.write_vk) {
        vinfo("writing Chonk vk in directory ", output_dir);
        // write CHONK vk using the bytecode of the hiding circuit (the last step of the execution)
        write_chonk_vk(raw_steps[raw_steps.size() - 1].bytecode, output_dir);
    }
}

bool ChonkAPI::verify([[maybe_unused]] const Flags& flags,
                      [[maybe_unused]] const std::filesystem::path& public_inputs_path,
                      const std::filesystem::path& proof_path,
                      const std::filesystem::path& vk_path)
{
    BB_BENCH_NAME("ChonkAPI::verify");
    auto proof_fields = many_from_buffer<fr>(read_file(proof_path));
    auto proof = Chonk::Proof::from_field_elements(proof_fields);

    auto vk_buffer = read_file(vk_path);

    auto response = bbapi::ChonkVerify{ .proof = std::move(proof), .vk = std::move(vk_buffer) }.execute();
    return response.valid;
}

// WORKTODO(bbapi) remove this
bool ChonkAPI::prove_and_verify(const std::filesystem::path& input_path)
{
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    std::shared_ptr<Chonk> ivc = steps.accumulate();
    // Construct the hiding kernel as the final step of the IVC

    auto proof = ivc->prove();
    const bool verified = Chonk::verify(proof, ivc->get_vk());
    return verified;
}

void ChonkAPI::gates(const Flags& flags, const std::filesystem::path& bytecode_path)
{
    BB_BENCH_NAME("ChonkAPI::gates");
    chonk_gate_count(bytecode_path, flags.include_gates_per_opcode);
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

    bool check_failed = false;
    for (auto& step : raw_steps) {
        if (step.vk.empty()) {
            info("FAIL: Expected precomputed vk for function ", step.function_name);
            return false;
        }
        auto response = bbapi::ChonkCheckPrecomputedVk{
            .circuit = { .name = step.function_name, .bytecode = step.bytecode, .verification_key = step.vk }
        }.execute();

        if (!response.valid) {
            if (!flags.update_inputs) {
                return false;
            }
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
    auto bytecode = get_bytecode(bytecode_path);
    if (flags.verifier_type == "ivc") {
        write_chonk_vk(bytecode, output_path);
    } else if (flags.verifier_type == "standalone") {
        write_standalone_vk(bytecode, output_path);
    } else if (flags.verifier_type == "standalone_hiding") {
        // write the VK for the hiding kernel which DOES NOT utilize a structured trace
        write_standalone_vk(bytecode, output_path);
    } else {
        const std::string msg = std::string("Can't write vk for verifier type ") + flags.verifier_type;
        throw_or_abort(msg);
    }
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
