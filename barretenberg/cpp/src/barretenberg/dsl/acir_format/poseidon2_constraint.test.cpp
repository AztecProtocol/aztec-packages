#include "poseidon2_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <strings.h>
#include <vector>

namespace acir_format::tests {

using namespace bb;

class Poseidon2Tests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
using fr = field<Bn254FrParams>;

/**
 * @brief Create a circuit testing the Poseidon2 permutation function
 *
 */
TEST_F(Poseidon2Tests, TestPoseidon2Permutation)
{
    Poseidon2Constraint
        poseidon2_constraint{
            .state = {
                WitnessOrConstant<bb::fr>::from_index(1),
                WitnessOrConstant<bb::fr>::from_index(2),
                WitnessOrConstant<bb::fr>::from_index(3),
                WitnessOrConstant<bb::fr>::from_index(4),
 },
            .result = { 5, 6, 7, 8, },
        };

    AcirFormat constraint_system{
        .varnum = 9,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poseidon2_constraints = { poseidon2_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness{
        1,
        0,
        1,
        2,
        3,
        fr(std::string("0x01bd538c2ee014ed5141b29e9ae240bf8db3fe5b9a38629a9647cf8d76c01737")),
        fr(std::string("0x239b62e7db98aa3a2a8f6a0d2fa1709e7a35959aa6c7034814d9daa90cbac662")),
        fr(std::string("0x04cbb44c61d928ed06808456bf758cbf0c18d1e15a7b6dbc8245fa7515d5e3cb")),
        fr(std::string("0x2e11c5cff2a22c64d01304b778d78f6998eff1ab73163a35603f54794c30847a")),
    };

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(Poseidon2Tests, GenerateVKFromConstraints)
{
    using Flavor = UltraFlavor;
    using VerificationKey = Flavor::VerificationKey;
    using ProvingKey = ProverInstance_<Flavor>;
    Poseidon2Constraint
        poseidon2_constraint{
            .state = {
                WitnessOrConstant<bb::fr>::from_index(1),
                WitnessOrConstant<bb::fr>::from_index(2),
                WitnessOrConstant<bb::fr>::from_index(3),
                WitnessOrConstant<bb::fr>::from_index(4),
 },
            .result = { 5, 6, 7, 8, },
        };

    AcirFormat constraint_system{
        .varnum = 9,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poseidon2_constraints = { poseidon2_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    WitnessVector witness_values{
        1,
        0,
        1,
        2,
        3,
        fr(std::string("0x01bd538c2ee014ed5141b29e9ae240bf8db3fe5b9a38629a9647cf8d76c01737")),
        fr(std::string("0x239b62e7db98aa3a2a8f6a0d2fa1709e7a35959aa6c7034814d9daa90cbac662")),
        fr(std::string("0x04cbb44c61d928ed06808456bf758cbf0c18d1e15a7b6dbc8245fa7515d5e3cb")),
        fr(std::string("0x2e11c5cff2a22c64d01304b778d78f6998eff1ab73163a35603f54794c30847a")),
    };

    std::shared_ptr<VerificationKey> vk_from_witness;
    {
        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program);
        info("Num gates: ", builder.get_estimated_num_finalized_gates());

        auto prover_instance = std::make_shared<ProvingKey>(builder);
        vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

        // Validate the builder
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    std::shared_ptr<VerificationKey> vk_from_constraint;
    {
        AcirProgram program{ constraint_system, /*witness=*/{} };
        auto builder = create_circuit<Builder>(program);
        auto prover_instance = std::make_shared<ProvingKey>(builder);
        vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    }

    EXPECT_EQ(*vk_from_witness, *vk_from_constraint);
}

} // namespace acir_format::tests
