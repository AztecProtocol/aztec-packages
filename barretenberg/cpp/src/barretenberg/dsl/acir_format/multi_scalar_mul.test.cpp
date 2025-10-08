#include "multi_scalar_mul.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

using namespace bb;

class MSMTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
using fr = field<Bn254FrParams>;

// Create a simple multi scalar mul with constant/witness inputs
// constant_point false => witness indexes 4,5,6
// constant_scalar false => witness indexes 7,8
MultiScalarMul generate_msm(bool constant_point, bool constant_scalar)
{
    MultiScalarMul result;
    result.out_point_x = 1;
    result.out_point_y = 2;
    result.out_point_is_infinite = 3;
    if (constant_point) {
        result.points = { WitnessOrConstant<fr>{
                              .index = 0,
                              .value = fr(1),
                              .is_constant = true,
                          },
                          WitnessOrConstant<fr>{
                              .index = 0,
                              .value = fr("0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c"),
                              .is_constant = true,
                          },
                          WitnessOrConstant<fr>{
                              .index = 0,
                              .value = fr(0),
                              .is_constant = true,
                          } };
    } else {
        result.points = { WitnessOrConstant<fr>{
                              .index = 4,
                              .value = fr(0),
                              .is_constant = false,
                          },
                          WitnessOrConstant<fr>{
                              .index = 5,
                              .value = fr(0),
                              .is_constant = false,
                          },
                          WitnessOrConstant<fr>{
                              .index = 6,
                              .value = fr(0),
                              .is_constant = false,
                          } };
    }
    if (constant_scalar) {
        result.scalars = { WitnessOrConstant<fr>{
                               .index = 0,
                               .value = fr(
                                   std::string("0x000000000000000000000000000000000000000000000000000000616c696365")),
                               .is_constant = true,
                           },
                           WitnessOrConstant<fr>{
                               .index = 0,
                               .value = fr(0),
                               .is_constant = true,
                           } };
    } else {
        result.scalars = { WitnessOrConstant<fr>{
                               .index = 7,
                               .value = fr(0),
                               .is_constant = false,
                           },
                           WitnessOrConstant<fr>{
                               .index = 8,
                               .value = fr(0),
                               .is_constant = false,
                           } };
    }
    return result;
}

// Creates a circuit containing the 'msm_constrain' with the provided witness values
// Check if the circuit is valid
// Return (true, true) if the circuit is valid.
static std::pair<bool, bool> check_msm(MultiScalarMul& msm_constrain, WitnessVector& witness)
{
    AcirFormat constraint_system{
        .varnum = static_cast<uint32_t>(witness.size()),
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .multi_scalar_mul_constraints = { msm_constrain },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);
    // The tests need to disable asserts because of tests using bad inputs
    // that are not on the curve.
    BB_DISABLE_ASSERTS();
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit(program);

    std::pair<bool, bool> result;
    result.first = CircuitChecker::check(builder);
    result.second = !builder.failed();
    info(builder.err());
    return result;
}

// These tests are testing a simple MSM constraint with 0 or 1 predicate:
// TestMSMConstantPredicate: constant inputs, false predicate
// TestMSMConstant: constant inputs, true predicate
// TestMSMWitnessPredicate: witness inputs, false predicate
// TestMSMWitness: witness inputs, true predicate
// TestMSMConstantBad: bad constant inputes, check_circuit is expected to fail
// TestMSMConstantPredicateBad: bad constant inputs, false predicate, circuit is expected to succeed
// TestMSMWitnessPredicateBad: bad witness inputs, false predicate, circuit is expected to succeed
// TestMSMWitnessBad: bad witness inputs, true predicate, check_circuit is expected to fail

/**
 * @brief Create a circuit testing the a simple scalar mul with a constant generator
 * and a false predicate
 */
TEST_F(MSMTests, TestMSMConstantPredicate)
{
    MultiScalarMul msm_constrain = generate_msm(true, true);
    WitnessVector witness{

        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(0));

    msm_constrain.predicate = predicate;
    auto check = check_msm(msm_constrain, witness);
    EXPECT_TRUE(check.first);
    EXPECT_TRUE(check.second);
}

/**
 * @brief Create a circuit testing the a simple scalar mul with a constant generator
 * and a true predicate
 */
TEST_F(MSMTests, TestMSMConstant)
{
    MultiScalarMul msm_constrain = generate_msm(true, true);
    WitnessVector witness{

        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(1));

    msm_constrain.predicate = predicate;
    auto check = check_msm(msm_constrain, witness);
    EXPECT_TRUE(check.first);
    EXPECT_TRUE(check.second);
}

TEST_F(MSMTests, TestMSMWitnessPredicate)
{
    MultiScalarMul msm_constrain = generate_msm(false, false);
    WitnessVector witness{
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        // output
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
        // point
        fr(1),
        fr("0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c"),
        fr(0),

        // scalar
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr(0),

    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(0));
    msm_constrain.predicate = predicate;
    auto check = check_msm(msm_constrain, witness);
    EXPECT_TRUE(check.first);
    EXPECT_TRUE(check.second);
}

TEST_F(MSMTests, TestMSMWitness)
{
    MultiScalarMul msm_constrain = generate_msm(false, false);
    WitnessVector witness{
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        // output
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
        // point
        fr(1),
        fr("0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c"),
        fr(0),

        // scalar
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr(0),

    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(1));
    msm_constrain.predicate = predicate;
    auto check = check_msm(msm_constrain, witness);
    EXPECT_TRUE(check.first);
    EXPECT_TRUE(check.second);
}

TEST_F(MSMTests, TestMSMConstantBad)
{
    MultiScalarMul msm_constrain = generate_msm(true, true);
    WitnessVector witness{

        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(1));

    msm_constrain.predicate = predicate;
    // Modify the MSM inputs to be invalid
    msm_constrain.points[0].value = fr(0);

    auto check = check_msm(msm_constrain, witness);
    EXPECT_FALSE(check.first);
    EXPECT_FALSE(check.second);
}

TEST_F(MSMTests, TestMSMConstantPredicateBad)
{
    MultiScalarMul msm_constrain = generate_msm(true, true);
    WitnessVector witness{

        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(0));

    msm_constrain.predicate = predicate;
    // Modify the MSM inputs to be invalid
    msm_constrain.points[0].value = fr(0);
    msm_constrain.points[1].value = fr(2);
    auto check = check_msm(msm_constrain, witness);
    EXPECT_TRUE(check.first);
    EXPECT_TRUE(check.second);
}

TEST_F(MSMTests, TestMSMWitnessPredicateBad)
{
    MultiScalarMul msm_constrain = generate_msm(false, false);
    WitnessVector witness{
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        // output
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
        // point
        fr(1),
        fr("0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272d"), // bad input
        fr(0),

        // scalar
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr(0),

    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(0));
    msm_constrain.predicate = predicate;
    auto check = check_msm(msm_constrain, witness);
    EXPECT_TRUE(check.first);
    EXPECT_TRUE(check.second);
}

TEST_F(MSMTests, TestMSMWitnessBad)
{
    MultiScalarMul msm_constrain = generate_msm(false, false);
    WitnessVector witness{
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        // output
        fr("0x0bff8247aa94b08d1c680d7a3e10831bd8c8cf2ea2c756b0d1d89acdcad877ad"),
        fr("0x2a5d7253a6ed48462fedb2d350cc768d13956310f54e73a8a47914f34a34c5c4"),
        fr(0),
        // point
        fr(1),
        fr("0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272d"), // bad point
        fr(0),

        // scalar
        fr("0x000000000000000000000000000000000000000000000000000000616c696365"),
        fr(0),

    };
    // Create a predicate witness or constant which takes the index of the last witness in the array
    auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness.size()));
    witness.push_back(fr(1));
    msm_constrain.predicate = predicate;
    auto check = check_msm(msm_constrain, witness);
    EXPECT_FALSE(check.first);
    EXPECT_FALSE(check.second);
}

} // namespace acir_format::tests
