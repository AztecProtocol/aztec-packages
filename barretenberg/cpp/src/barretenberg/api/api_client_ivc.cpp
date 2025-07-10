#include "api_client_ivc.hpp"
#include "barretenberg/api/file_io.hpp"
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
#include <stdexcept>

namespace bb {

acir_format::WitnessVector witness_map_to_witness_vector(std::map<std::string, std::string> const& witness_map)
{
    acir_format::WitnessVector wv;
    size_t index = 0;
    for (auto& e : witness_map) {
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

std::shared_ptr<ClientIVC::DeciderProvingKey> get_acir_program_decider_proving_key(acir_format::AcirProgram& program)
{
    ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    return std::make_shared<ClientIVC::DeciderProvingKey>(builder, trace_settings);
}

/**
 * @brief Compute and write to file a MegaHonk VK for a circuit to be accumulated in the IVC
 * @note This method differes from write_vk_honk<MegaFlavor> in that it handles kernel circuits which require special
 * treatment (i.e. construction of mock IVC state to correctly complete the kernel logic).
 *
 * @param bytecode_path
 * @param witness_path
 */
void write_standalone_vk(const std::string& output_data_type,
                         const std::string& bytecode_path,
                         const std::string& output_path)
{

    acir_format::AcirProgram program{ get_constraint_system(bytecode_path), /*witness=*/{} };
    std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key = get_acir_program_decider_proving_key(program);
    auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->get_precomputed());
    PubInputsProofAndKey<ClientIVC::MegaVerificationKey> to_write{ .key = verification_key };

    write(to_write, output_data_type, "vk", output_path);
}

size_t get_num_public_inputs_in_circuit(const std::filesystem::path& bytecode_path)
{
    using namespace acir_format;
    acir_format::AcirProgram program{ get_constraint_system(bytecode_path), /*witness=*/{} };
    return program.constraints.public_inputs.size();
}

void write_vk_for_ivc(const std::string& output_format,
                      size_t num_public_inputs_in_final_circuit,
                      const std::filesystem::path& output_dir)
{
    if (output_format != "bytes") {
        throw_or_abort("Unsupported output format for ClientIVC vk: " + output_format);
    }
    ClientIVC ivc{ { AZTEC_TRACE_STRUCTURE } };
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

    const bool output_to_stdout = output_dir == "-";
    const auto buf = to_buffer(ivc.get_vk());

    if (output_to_stdout) {
        write_bytes_to_stdout(buf);
    } else {
        write_file(output_dir / "vk", buf);
    }
}

void write_vk_for_ivc(const std::string& output_data_type,
                      const std::string& bytecode_path,
                      const std::filesystem::path& output_dir)
{
    const size_t num_public_inputs_in_final_circuit = get_num_public_inputs_in_circuit(bytecode_path);
    info("num_public_inputs_in_final_circuit: ", num_public_inputs_in_final_circuit);
    write_vk_for_ivc(output_data_type, num_public_inputs_in_final_circuit, output_dir);
}

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
        const size_t num_public_inputs_in_final_circuit = steps.folding_stack.back().constraints.public_inputs.size();
        write_vk_for_ivc("bytes", num_public_inputs_in_final_circuit, output_dir);
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
        std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key = get_acir_program_decider_proving_key(program);
        auto computed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->get_precomputed());
        std::string error_message = "FAIL: Precomputed vk does not match computed vk for function " + function_name;
        if (!msgpack::msgpack_check_eq(*computed_vk, *precomputed_vk, error_message)) {
            return false;
        }
    }
    return true;
}

void ClientIVCAPI::write_vk(const Flags& flags,
                            const std::filesystem::path& bytecode_path,
                            const std::filesystem::path& output_path)
{

    if (flags.verifier_type == "ivc") {
        write_vk_for_ivc(flags.output_format, bytecode_path, output_path);
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

    ClientIVC ivc{ { AZTEC_TRACE_STRUCTURE } };

    // Construct and accumulate a series of mocked private function execution circuits
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    size_t NUM_CIRCUITS = 2;
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
