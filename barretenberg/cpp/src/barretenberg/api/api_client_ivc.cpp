#include "api_client_ivc.hpp"
#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/api/bbrpc_execute.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/log.hpp"
#include "barretenberg/api/write_prover_output.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <algorithm>
#include <sstream>
#include <stdexcept>

namespace bb {

// Helper functions from original implementation
acir_format::WitnessVector witness_map_to_witness_vector(std::map<std::string, std::string> const& witness_map)
{
    acir_format::WitnessVector wv;
    size_t index = 0;
    for (const auto& e : witness_map) {
        uint64_t value = stoull(e.first);
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned.
        // To ensure that witnesses sit at the correct indices in the `WitnessVector`, we fill any indices
        // which do not exist within the `WitnessMap` with the dummy value of zero.
        while (index < value) {
            wv.push_back(fr(0));
            index++;
        }
        wv.push_back(fr(uint256_t(e.second)));
        index++;
    }
    return wv;
}

// Forward declaration
static void write_vk_for_ivc(const std::string& output_format,
                             size_t num_public_inputs_in_final_circuit,
                             const std::filesystem::path& output_dir);

/**
 * @brief Prove method implementation
 *
 * For now, this uses the original implementation due to complexities
 * with serializing ACIR constraint systems. A future refactor will
 * use BBRPC commands once serialization is sorted out.
 */
void ClientIVCAPI::prove(const Flags& flags,
                         const std::filesystem::path& input_path,
                         const std::filesystem::path& output_dir)
{
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    std::shared_ptr<ClientIVC> ivc = steps.accumulate();
    ClientIVC::Proof proof = ivc->prove();

    // We verify this proof. Another bb call to verify has the overhead of loading the SRS,
    // and it is mysterious if this transaction fails later in the lifecycle.
    // The files are still written in case they are needed to investigate this failure.
    if (!ivc->verify(proof)) {
        THROW std::runtime_error("Failed to verify the private (ClientIVC) transaction proof!");
    }

    // We'd like to use the `write` function that UltraHonkAPI uses, but there are missing functions for creating
    // std::string representations of vks that don't feel worth implementing
    const bool output_to_stdout = output_dir == "-";

    const auto write_proof = [&]() {
        if (output_to_stdout) {
            proof.to_file_msgpack("/dev/stdout");
        } else {
            vinfo("writing ClientIVC proof in directory ", output_dir);
            proof.to_file_msgpack(output_dir / "proof");
        }
    };

    write_proof();
    ClientIVC::Proof proof2 = ClientIVC::Proof::from_file_msgpack(output_dir / "proof");
    ASSERT(proof2 == proof, "Proof written to file does not match the original proof!");

    if (flags.write_vk) {
        vinfo("writing ClientIVC vk in directory ", output_dir);
        const size_t num_public_inputs_in_final_circuit = steps.folding_stack.back().constraints.public_inputs.size();
        write_vk_for_ivc("bytes", num_public_inputs_in_final_circuit, output_dir);
    }
}

// Implementation of write_vk_for_ivc
static void write_vk_for_ivc(const std::string& output_format,
                             size_t num_public_inputs_in_final_circuit,
                             const std::filesystem::path& output_dir)
{
    if (output_format != "bytes") {
        throw_or_abort("Unsupported output format for ClientIVC vk: " + output_format);
    }
    ClientIVC ivc{ TraceSettings{ AZTEC_TRACE_STRUCTURE } };
    ClientIVCMockCircuitProducer circuit_producer;

    // Initialize the IVC with an arbitrary circuit
    // We segfault if we only call accumulate once
    static constexpr size_t SMALL_ARBITRARY_LOG_CIRCUIT_SIZE{ 5 };
    MegaCircuitBuilder circuit_0 = circuit_producer.create_next_circuit(ivc, SMALL_ARBITRARY_LOG_CIRCUIT_SIZE);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    MegaCircuitBuilder circuit_1 =
        circuit_producer.create_next_circuit(ivc, SMALL_ARBITRARY_LOG_CIRCUIT_SIZE, num_public_inputs_in_final_circuit);
    ivc.accumulate(circuit_1);

    // Construct the hiding circuit and its VK (stored internally in the IVC)
    ivc.construct_hiding_circuit_key();

    // write with msgpack:
    msgpack::sbuffer vk_buffer;
    msgpack::pack(vk_buffer, ivc.get_vk());
    std::vector<uint8_t> vk_buffer_vec(vk_buffer.data(), vk_buffer.data() + vk_buffer.size());
    write_file(output_dir / "vk", vk_buffer_vec);
}

namespace {
template <typename T> T from_msgpack_buffer(const std::vector<uint8_t>& buffer)
{
    msgpack::sbuffer sbuf;
    sbuf.write(reinterpret_cast<const char*>(buffer.data()), buffer.size());
    msgpack::object_handle oh = msgpack::unpack(sbuf.data(), sbuf.size());
    msgpack::object obj = oh.get();
    T result;
    obj.convert(result);
    return result;
}
} // namespace

/**
 * @brief Refactored verify method using BBRPC commands
 */
bool ClientIVCAPI::verify([[maybe_unused]] const Flags& flags,
                          [[maybe_unused]] const std::filesystem::path& public_inputs_path,
                          const std::filesystem::path& proof_path,
                          const std::filesystem::path& vk_path)
{
    // For ClientIVC, verification is currently done directly
    // since there's no CircuitVerify equivalent for IVC proofs yet

    const auto proof = ClientIVC::Proof::from_file_msgpack(proof_path);
    const auto vk = from_msgpack_buffer<ClientIVC::VerificationKey>(read_file(vk_path));

    const bool verified = ClientIVC::verify(proof, vk);
    return verified;
}

/**
 * @brief Refactored write_vk method using BBRPC commands
 */
void ClientIVCAPI::write_vk(const Flags& flags,
                            const std::filesystem::path& bytecode_path,
                            const std::filesystem::path& output_path)
{
    using namespace bbrpc;

    BBRpcRequest request;
    request.trace_settings = TraceSettings{ AZTEC_TRACE_STRUCTURE };

    if (flags.verifier_type == "standalone") {
        // Load bytecode from file
        auto bytecode = read_file(bytecode_path);

        CircuitInputNoVK circuit{ .name = bytecode_path.filename().string(), .bytecode = bytecode };

        ClientIvcComputeVk derive_vk_cmd{ .circuit = circuit, .standalone = true };

        auto response = execute(request, std::move(derive_vk_cmd));

        if (!response.error_message.empty()) {
            throw_or_abort("Failed to derive standalone VK: " + response.error_message);
        }

        // Write VK based on output format
        if (flags.output_format == "bytes") {
            write_file(output_path, response.verification_key);
        } else if (flags.output_format == "fields") {
            // Convert VK to fields
            VkAsFields vk_as_fields_cmd{ .verification_key = response.verification_key, .is_mega_honk = true };

            auto fields_response = execute(request, std::move(vk_as_fields_cmd));

            if (!fields_response.error_message.empty()) {
                throw_or_abort("Failed to convert VK to fields: " + fields_response.error_message);
            }

            // Write fields representation
            std::stringstream ss;
            for (const auto& field : fields_response.fields) {
                ss << field << "\n";
            }
            write_file(output_path, std::vector<uint8_t>(ss.str().begin(), ss.str().end()));
        }
    } else if (flags.verifier_type == "ivc") {
        // For IVC hiding circuit VK, we need the number of public inputs from the last circuit
        acir_format::AcirProgram program{ get_constraint_system(bytecode_path), /*witness=*/{} };
        [[maybe_unused]] const size_t num_public_inputs = program.constraints.public_inputs.size();

        // Use empty circuit to trigger IVC VK generation
        CircuitInputNoVK circuit{ .name = "ivc_hiding", .bytecode = {} };

        ClientIvcComputeVk derive_vk_cmd{ .circuit = circuit, .standalone = false };

        auto response = execute(request, std::move(derive_vk_cmd));

        if (!response.error_message.empty()) {
            throw_or_abort("Failed to derive IVC hiding circuit VK: " + response.error_message);
        }

        write_file(output_path / "vk", response.verification_key);
    } else {
        throw_or_abort("Unsupported verifier type: " + flags.verifier_type);
    }
}

/**
 * @brief Gates method implementation
 */
void ClientIVCAPI::gates([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path)
{
    gate_count_for_ivc(bytecode_path, flags.include_gates_per_opcode);
}

bool ClientIVCAPI::prove_and_verify(const std::filesystem::path& input_path)
{
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    std::shared_ptr<ClientIVC> ivc = steps.accumulate();
    const bool verified = ivc->prove_and_verify();
    return verified;
}

void ClientIVCAPI::write_solidity_verifier([[maybe_unused]] const Flags& flags,
                                           [[maybe_unused]] const std::filesystem::path& output_path,
                                           [[maybe_unused]] const std::filesystem::path& vk_path)
{
    throw_or_abort("API function contract not implemented");
}

bool ClientIVCAPI::check_precomputed_vks(const std::filesystem::path& input_path)
{
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    for (auto [program, precomputed_vk, function_name] :
         zip_view(steps.folding_stack, steps.precomputed_vks, steps.function_names)) {
        if (precomputed_vk == nullptr) {
            info("FAIL: Expected precomputed vk for function ", function_name);
            return false;
        }

        // Get proving key and derive VK
        acir_format::AcirProgram acir_program{ program.constraints, program.witness };
        ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(acir_program);
        TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
        auto proving_key = std::make_shared<ClientIVC::DeciderProvingKey>(builder, trace_settings);
        auto computed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

        std::string error_message = "FAIL: Precomputed vk does not match computed vk for function " + function_name;
        if (!msgpack::msgpack_check_eq(*computed_vk, *precomputed_vk, error_message)) {
            return false;
        }
    }
    return true;
}

bool ClientIVCAPI::check([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path,
                         [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function check_witness not implemented");
    return false;
}

// Global functions
void gate_count_for_ivc(const std::string& bytecode_path, bool include_gates_per_opcode)
{
    // All circuit reports will be built into the std::string below
    std::string functions_string = "{\"functions\": [\n  ";
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

// TODO(https:// github.com/AztecProtocol/barretenberg/issues/1252): deprecate in favor of normal proving flow
void write_arbitrary_valid_client_ivc_proof_and_vk_to_file(const std::filesystem::path& output_dir)
{
    ClientIVC ivc{ { AZTEC_TRACE_STRUCTURE } };
    ClientIVCMockCircuitProducer circuit_producer;

    static constexpr size_t NUM_CIRCUITS = 4;
    // The log circuit size you want to initialize the first circuit with. 5 is sufficient to let the ivc accumulate
    static constexpr size_t SMALL_ARBITRARY_LOG_CIRCUIT_SIZE{ 5 };
    static constexpr size_t LARGE_ARBITRARY_LOG_CIRCUIT_SIZE{ 10 };

    std::array<MegaCircuitBuilder, NUM_CIRCUITS> circuits;

    // Construct and accumulate a series of circuits - first one small
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        const auto log_circuit_size = idx == 0 ? SMALL_ARBITRARY_LOG_CIRCUIT_SIZE : LARGE_ARBITRARY_LOG_CIRCUIT_SIZE;
        circuits[idx] = circuit_producer.create_next_circuit(ivc, log_circuit_size);
        ivc.accumulate(circuits[idx]);
    }

    ivc.construct_hiding_circuit_key();

    ClientIVC::Proof proof = ivc.prove();
    write_file(output_dir / "vk", to_buffer(ivc.get_vk()));
    proof.to_file_msgpack(output_dir / "proof");
}

} // namespace bb
