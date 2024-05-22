#include <filesystem>
#include <gtest/gtest.h>
#include <vector>

#include "acir_format.hpp"
#include "barretenberg/bb/exec_pipe.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"

class AcirIntegrationTests : public ::testing::Test {
  public:
    static std::vector<uint8_t> get_bytecode(const std::string& bytecodePath)
    {
        std::filesystem::path filePath = bytecodePath;
        if (filePath.extension() == ".json") {
            // Try reading json files as if they are a Nargo build artifact
            std::string command = "jq -r '.bytecode' \"" + bytecodePath + "\" | base64 -d | gunzip -c";
            return exec_pipe(command);
        }

        // For other extensions, assume file is a raw ACIR program
        std::string command = "gunzip -c \"" + bytecodePath + "\"";
        return exec_pipe(command);
    }

    // Function to check if a file exists
    bool file_exists(const std::string& path)
    {
        std::ifstream file(path);
        return file.good();
    }

    acir_format::AcirProgramStack get_program_stack_data_from_test_file(const std::string& test_program_name)
    {
        std::string base_path = "../../acir_tests/acir_tests/" + test_program_name + "/target";
        std::string bytecode_path = base_path + "/program.json";
        std::string witness_path = base_path + "/witness.gz";

        return acir_format::get_acir_program_stack(bytecode_path, witness_path);
    }

    acir_format::AcirProgram get_program_data_from_test_file(const std::string& test_program_name)
    {
        auto program_stack = get_program_stack_data_from_test_file(test_program_name);
        ASSERT(program_stack.size() == 1); // Otherwise this method will not return full stack data

        return program_stack.back();
    }

    template <class Flavor> bool prove_and_verify_honk(Flavor::CircuitBuilder builder)
    {
        using Prover = UltraProver_<Flavor>;
        using Verifier = UltraVerifier_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        Prover prover{ builder };
        builder.blocks.summarize();
        info("num gates = ", builder.get_num_gates());
        info("circuit size = ", prover.instance->proving_key.circuit_size);
        info("circuit size = ", prover.instance->proving_key.circuit_size);
        auto proof = prover.construct_proof();

        // Verify Honk proof
        auto verification_key = std::make_shared<VerificationKey>(prover.instance->proving_key);
        Verifier verifier{ verification_key };

        return verifier.verify_proof(proof);
    }

    template <class Flavor> bool prove_and_verify_honk(std::shared_ptr<ProverInstance_<Flavor>> prover_instance)
    {
        using Prover = UltraProver_<Flavor>;
        using Verifier = UltraVerifier_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        Prover prover{ prover_instance };
        auto proof = prover.construct_proof();

        // Verify Honk proof
        auto verification_key = std::make_shared<VerificationKey>(prover.instance->proving_key);
        Verifier verifier{ verification_key };

        return verifier.verify_proof(proof);
    }

    void add_some_simple_RAM_gates(auto& circuit)
    {
        std::array<uint32_t, 3> ram_values{ circuit.add_variable(5),
                                            circuit.add_variable(10),
                                            circuit.add_variable(20) };

        size_t ram_id = circuit.create_RAM_array(3);

        for (size_t i = 0; i < 3; ++i) {
            circuit.init_RAM_element(ram_id, i, ram_values[i]);
        }

        auto val_idx_1 = circuit.read_RAM_array(ram_id, circuit.add_variable(1));
        auto val_idx_2 = circuit.read_RAM_array(ram_id, circuit.add_variable(2));
        auto val_idx_3 = circuit.read_RAM_array(ram_id, circuit.add_variable(0));

        circuit.create_big_add_gate({
            val_idx_1,
            val_idx_2,
            val_idx_3,
            circuit.zero_idx,
            1,
            1,
            1,
            0,
            -35,
        });
    }

  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }
};

TEST_F(AcirIntegrationTests, ProveAndVerifyProgram)
{
    using Flavor = GoblinUltraFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "6_array";
    auto acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    auto circuit = acir_format::create_circuit<Builder>(acir_program.constraints, 0, acir_program.witness);

    // Construct and verify Honk proof
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(circuit));
}

TEST_F(AcirIntegrationTests, ProveAndVerifyProgramStack)
{
    using Flavor = GoblinUltraFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "fold_basic";
    auto program_stack = get_program_stack_data_from_test_file(test_name);

    while (!program_stack.empty()) {
        auto program = program_stack.back();

        // Construct a bberg circuit from the acir representation
        auto circuit = acir_format::create_circuit<Builder>(program.constraints, 0, program.witness);

        // Construct and verify Honk proof for the individidual circuit
        EXPECT_TRUE(prove_and_verify_honk<Flavor>(circuit));

        program_stack.pop_back();
    }
}

TEST_F(AcirIntegrationTests, FoldAndVerifyProgramStack)
{
    using Flavor = GoblinUltraFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "fold_basic";
    auto program_stack = get_program_stack_data_from_test_file(test_name);

    ClientIVC ivc;
    ivc.structured_flag = true;

    while (!program_stack.empty()) {
        info("Program:");
        auto program = program_stack.back();

        // Construct a bberg circuit from the acir representation
        auto circuit =
            acir_format::create_circuit<Builder>(program.constraints, 0, program.witness, false, ivc.goblin.op_queue);

        ivc.accumulate(circuit);

        CircuitChecker::check(circuit);
        // EXPECT_TRUE(prove_and_verify_honk<Flavor>(ivc.prover_instance));

        program_stack.pop_back();
    }

    EXPECT_TRUE(ivc.prove_and_verify());
}

TEST_F(AcirIntegrationTests, UpdateAcirCircuit)
{
    using Flavor = GoblinUltraFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "6_array";
    auto acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    auto circuit = acir_format::create_circuit<Builder>(acir_program.constraints, 0, acir_program.witness);

    EXPECT_TRUE(CircuitChecker::check(circuit));

    // Now we'll append some addition gates onto the circuit generated from acir and confirm that its still valid.
    // First, check that the simple circuit is valid in isolation
    {
        Builder simple_circuit;
        add_some_simple_RAM_gates(circuit);
        EXPECT_TRUE(CircuitChecker::check(simple_circuit));
        EXPECT_TRUE(prove_and_verify_honk<Flavor>(simple_circuit));
    }

    // Now manually append the simple RAM circuit to the circuit generated from acir
    add_some_simple_RAM_gates(circuit);

    // Confirm that the result is still valid
    EXPECT_TRUE(CircuitChecker::check(circuit));
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(circuit));
}
