#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

#include <gtest/gtest.h>
using namespace bb;

namespace {
using CircuitBuilder = TranslatorFlavor::CircuitBuilder;
using Transcript = TranslatorFlavor::Transcript;
using OpQueue = ECCOpQueue;
using FF = TranslatorFlavor::Curve::ScalarField;
auto& engine = numeric::get_debug_randomness();

class TranslatorProvingKeyTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }
};
} // namespace

/**
 * @brief Test the new concatenation method produces the expected results.
 *
 */
TEST_F(TranslatorProvingKeyTests, InterleaveBasic)
{
    std::vector<FF> values = { FF{ 1 }, FF{ 2 }, FF{ 3 } };
    std::vector<Polynomial<FF>> group = { Polynomial<FF>(std::span<FF>(values)),
                                          Polynomial<FF>(std::span<FF>(values)),
                                          Polynomial<FF>(std::span<FF>(values)) };
    Polynomial<FF> result(group.size() * group[0].size());
    TranslatorProvingKey::interleave(RefVector(group), result);
    std::vector<FF> vec = { FF{ 1 }, FF{ 1 }, FF{ 1 }, FF{ 2 }, FF{ 2 }, FF{ 2 }, FF{ 3 }, FF{ 3 }, FF{ 3 } };
    Polynomial<FF> expected_result{ std::span<FF>(vec) };
    EXPECT_EQ(result, expected_result);
}

TEST_F(TranslatorProvingKeyTests, InterleaveFull) {}
