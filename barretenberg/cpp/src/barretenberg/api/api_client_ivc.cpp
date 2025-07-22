#include "api_client_ivc.hpp"
#include "barretenberg/api/bbapi.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/get_bytecode.hpp"
#include "barretenberg/api/log.hpp"
#include "barretenberg/api/write_prover_output.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
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
void write_standalone_vk(const std::string& output_format,
                         const std::filesystem::path& bytecode_path,
                         const std::filesystem::path& output_path)
{
    auto bytecode = get_bytecode(bytecode_path);
    auto response = bbapi::ClientIvcComputeStandaloneVk{
        .circuit = { .name = "standalone_circuit", .bytecode = std::move(bytecode) }
    }.execute();

    bool wrote_file = false;
    bool is_stdout = output_path == "-";
    auto write_fn = [&](const std::filesystem::path& path, const auto& data) {
        if (is_stdout) {
            write_bytes_to_stdout(data);
        } else {
            write_file(path, data);
        }
    };
    if (output_format == "bytes_and_fields" && is_stdout) {
        throw_or_abort("Cannot write to stdout in bytes_and_fields format.");
    }
    if (output_format == "bytes" || output_format == "bytes_and_fields") {
        write_fn(output_path / "vk", response.bytes);
        wrote_file = true;
    }
    if (output_format == "fields" || output_format == "bytes_and_fields") {
        std::string json = field_elements_to_json(response.fields);
        write_fn(output_path / "vk_fields.json", std::vector<uint8_t>(json.begin(), json.end()));
        wrote_file = true;
    }
    if (!wrote_file) {
        throw_or_abort("Unsupported output format for standalone vk: " + output_format);
    }
}

void write_civc_vk(const std::string& output_format,
                   size_t num_public_inputs_in_final_circuit,
                   const std::filesystem::path& output_dir)
{
    if (output_format != "bytes") {
        throw_or_abort("Unsupported output format for ClientIVC vk: " + output_format);
    }

    // Since we need to specify the number of public inputs but ClientIvcComputeIvcVk derives it from bytecode,
    // we need to create a mock circuit with the correct number of public inputs
    // For now, we'll use the compute_civc_vk function directly as it was designed for this purpose
    bbapi::BBApiRequest request;
    auto vk = bbapi::compute_civc_vk(request, num_public_inputs_in_final_circuit);
    const auto buf = to_buffer(vk);

    const bool output_to_stdout = output_dir == "-";

    if (output_to_stdout) {
        write_bytes_to_stdout(buf);
    } else {
        write_file(output_dir / "vk", buf);
    }
}

void write_civc_vk(const std::string& output_data_type,
                   const std::string& bytecode_path,
                   const std::filesystem::path& output_dir)
{
    if (output_data_type != "bytes") {
        throw_or_abort("Unsupported output format for ClientIVC vk: " + output_data_type);
    }

    auto bytecode = get_bytecode(bytecode_path);

    auto response = bbapi::ClientIvcComputeIvcVk{
        .circuit = { .name = "final_circuit", .bytecode = std::move(bytecode) }
    }.execute();

    const bool output_to_stdout = output_dir == "-";
    if (output_to_stdout) {
        write_bytes_to_stdout(response.bytes);
    } else {
        write_file(output_dir / "vk", response.bytes);
    }
}
} // anonymous namespace

void ClientIVCAPI::prove(const Flags& flags,
                         const std::filesystem::path& input_path,
                         const std::filesystem::path& output_dir)
{

    bbapi::BBApiRequest request;
    std::vector<PrivateExecutionStepRaw> raw_steps = PrivateExecutionStepRaw::load_and_decompress(input_path);

    bbapi::ClientIvcStart{ .num_circuits = raw_steps.size() }.execute(request);

    size_t loaded_circuit_public_inputs_size = 0;
    for (const auto& step : raw_steps) {
        bbapi::ClientIvcLoad{
            .circuit = { .name = step.function_name, .bytecode = step.bytecode, .verification_key = step.vk }
        }.execute(request);

        // NOLINTNEXTLINE(bugprone-unchecked-optional-access): we know the optional has been set here.
        loaded_circuit_public_inputs_size = request.loaded_circuit_constraints->public_inputs.size();
        info("ClientIVC: accumulating " + step.function_name);
        bbapi::ClientIvcAccumulate{ .witness = step.witness }.execute(request);
    }

    auto proof = bbapi::ClientIvcProve{}.execute(request).proof;

    // We'd like to use the `write` function that UltraHonkAPI uses, but there are missing functions for creating
    // std::string representations of vks that don't feel worth implementing
    const bool output_to_stdout = output_dir == "-";

    const auto write_proof = [&]() {
        const auto buf = to_buffer(proof);
        if (output_to_stdout) {
            vinfo("writing ClientIVC proof to stdout");
            write_bytes_to_stdout(buf);
        } else {
            vinfo("writing ClientIVC proof in directory ", output_dir);
            proof.to_file_msgpack(output_dir / "proof");
        }
    };

    write_proof();

    if (flags.write_vk) {
        vinfo("writing ClientIVC vk in directory ", output_dir);
        write_civc_vk("bytes", loaded_circuit_public_inputs_size, output_dir);
    }
}

bool ClientIVCAPI::verify([[maybe_unused]] const Flags& flags,
                          [[maybe_unused]] const std::filesystem::path& public_inputs_path,
                          const std::filesystem::path& proof_path,
                          const std::filesystem::path& vk_path)
{
    const auto proof = ClientIVC::Proof::from_file_msgpack(proof_path);
    const auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(vk_path));

    const bool verified = ClientIVC::verify(proof, vk);
    return verified;
}

bool ClientIVCAPI::prove_and_verify(const std::filesystem::path& input_path)
{

    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    std::shared_ptr<ClientIVC> ivc = steps.accumulate();
    const bool verified = ivc->prove_and_verify();
    return verified;
}

void ClientIVCAPI::gates(const Flags& flags, const std::filesystem::path& bytecode_path)
{
    gate_count_for_ivc(bytecode_path, flags.include_gates_per_opcode);
}

void ClientIVCAPI::write_solidity_verifier([[maybe_unused]] const Flags& flags,
                                           [[maybe_unused]] const std::filesystem::path& output_path,
                                           [[maybe_unused]] const std::filesystem::path& vk_path)
{
    throw_or_abort("API function contract not implemented");
}

bool ClientIVCAPI::check_precomputed_vks(const Flags& flags, const std::filesystem::path& input_path)
{
    bbapi::BBApiRequest request;
    std::vector<PrivateExecutionStepRaw> raw_steps = PrivateExecutionStepRaw::load_and_decompress(input_path);

    bool check_failed = false;
    for (auto& step : raw_steps) {
        if (step.vk.empty()) {
            info("FAIL: Expected precomputed vk for function ", step.function_name);
            return false;
        }
        auto response = bbapi::ClientIvcCheckPrecomputedVk{ .circuit = { .name = step.function_name,
                                                                         .bytecode = step.bytecode,
                                                                         .verification_key = step.vk },
                                                            .function_name = step.function_name }
                            .execute();

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

void ClientIVCAPI::write_vk(const Flags& flags,
                            const std::filesystem::path& bytecode_path,
                            const std::filesystem::path& output_path)
{

    if (flags.verifier_type == "ivc") {
        write_civc_vk(flags.output_format, bytecode_path, output_path);
    } else if (flags.verifier_type == "standalone") {
        write_standalone_vk(flags.output_format, bytecode_path, output_path);
    } else {
        const std::string msg = std::string("Can't write vk for verifier type ") + flags.verifier_type;
        throw_or_abort(msg);
    }
}

bool ClientIVCAPI::check([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path,
                         [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function check_witness not implemented");
    return false;
}

void gate_count_for_ivc(const std::string& bytecode_path, bool include_gates_per_opcode)
{
    // All circuit reports will be built into the std::string below
    std::string functions_string = "{\"functions\": [\n  ";
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1181): Use enum for honk_recursion.
    auto constraint_systems = get_constraint_systems(bytecode_path);

    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    size_t i = 0;
    for (const auto& constraint_system : constraint_systems) {
        acir_format::AcirProgram program{ constraint_system };
        const auto& ivc_constraints = constraint_system.ivc_recursion_constraints;
        acir_format::ProgramMetadata metadata{ .ivc = ivc_constraints.empty() ? nullptr
                                                                              : create_mock_ivc_from_constraints(
                                                                                    ivc_constraints, trace_settings),
                                               .collect_gates_per_opcode = include_gates_per_opcode };

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

        auto result_string = format(
            "{\n        \"acir_opcodes\": ",
            program.constraints.num_acir_opcodes,
            ",\n        \"circuit_size\": ",
            circuit_size,
            (include_gates_per_opcode ? format(",\n        \"gates_per_opcode\": [", gates_per_opcode_str, "]") : ""),
            "\n  }");

        // Attach a comma if there are more circuit reports to generate
        if (i != (constraint_systems.size() - 1)) {
            result_string = format(result_string, ",");
        }

        functions_string = format(functions_string, result_string);

        i++;
    }
    std::cout << format(functions_string, "\n]}");
}

void write_arbitrary_valid_client_ivc_proof_and_vk_to_file(const std::filesystem::path& output_dir)
{

    const size_t NUM_CIRCUITS = 2;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    // Construct and accumulate a series of mocked private function execution circuits
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit);
    }

    ClientIVC::Proof proof = ivc.prove();

    // Write the proof and verification keys into the working directory in 'binary' format
    vinfo("writing ClientIVC proof and vk...");
    proof.to_file_msgpack(output_dir / "proof");

    write_file(output_dir / "vk", to_buffer(ivc.get_vk()));
}

} // namespace bb
