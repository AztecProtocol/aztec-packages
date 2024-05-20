#include <filesystem>
#include <gtest/gtest.h>
#include <vector>

#include "acir_format.hpp"
#include "barretenberg/bb/exec_pipe.hpp"
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

    struct AcirProgram {
        acir_format::AcirFormat constraints;
        acir_format::WitnessVector witness;
    };

    AcirProgram get_test_program_data(std::string test_program_name)
    {
        std::string base_path = "../../acir_tests/acir_tests/" + test_program_name + "/target";
        std::string bytecode_path = base_path + "/program.json";
        std::string witness_path = base_path + "/witness.gz";

        EXPECT_TRUE(file_exists(bytecode_path));
        EXPECT_TRUE(file_exists(witness_path));

        auto acir_buf = get_bytecode(bytecode_path);
        acir_format::AcirFormat constraint_system = acir_format::circuit_buf_to_acir_format(acir_buf);

        auto witness_buf = get_bytecode(witness_path);
        acir_format::WitnessVector witness = acir_format::witness_buf_to_witness_data(witness_buf);

        return { constraint_system, witness };
    }

  protected:
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};
TEST_F(AcirIntegrationTests, Basic)
{
    using Flavor = GoblinUltraFlavor;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    std::string test_name = "6_array";
    auto acir_data = get_test_program_data(test_name);

    // Construct a bberg circuit from the acir representation
    auto builder = acir_format::create_circuit<Builder>(acir_data.constraints, 0, acir_data.witness);

    // Construct Honk proof
    Prover prover{ builder };
    builder.blocks.summarize();
    info("num gates = ", builder.get_num_gates());
    info("circuit size = ", prover.instance->proving_key.circuit_size);
    info("circuit size = ", prover.instance->proving_key.circuit_size);
    auto proof = prover.construct_proof();

    // Verify Honk proof
    auto verification_key = std::make_shared<VerificationKey>(prover.instance->proving_key);
    Verifier verifier{ verification_key };

    EXPECT_TRUE(verifier.verify_proof(proof));

    EXPECT_EQ(1, 1);
}
