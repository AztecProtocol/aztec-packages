#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {

class AvmVerifierTests : public ::testing::Test {
  public:
    using Prover = AvmProvingHelper;
    using Verifier = AvmVerifier;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper function to create and verify native proof
    struct NativeProofResult {
        typename Prover::Proof proof;
        std::vector<std::vector<FF>> public_inputs_cols;
    };

    // Helper function to create proof.
    static NativeProofResult create_proof()
    {
        auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();

        Prover prover;
        auto public_inputs_cols = public_inputs.to_columns();
        const auto proof = prover.prove(std::move(trace));

        return { proof, public_inputs_cols };
    }
};

TEST_F(AvmVerifierTests, GoodPublicInputs)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_cols] = create_proof();

    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);

    ASSERT_TRUE(verified) << "native proof verification failed";
}

TEST_F(AvmVerifierTests, NegativeBadPublicInputs)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_cols] = create_proof();
    auto verify_with_corrupt_pi_col = [&](size_t col_idx) {
        public_inputs_cols[col_idx][5] += FF::one();
        Verifier verifier;
        const bool verified = verifier.verify_proof(proof, public_inputs_cols);
        ASSERT_FALSE(verified)
            << "native proof verification succeeded, but should have failed due to corruption of public inputs col "
            << col_idx;
        public_inputs_cols[col_idx][5] -= FF::one(); // reset
    };
    for (size_t col_idx = 0; col_idx < 4; col_idx++) {
        verify_with_corrupt_pi_col(col_idx);
    }
    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);
    ASSERT_TRUE(verified) << "native proof verification failed, but should have succeeded";
}

// Verify that the actual proof size matches COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS
TEST_F(AvmVerifierTests, ProofSizeMatchesComputedConstant)
{
    auto [proof, public_inputs_cols] = create_proof();

    const size_t actual_proof_size = proof.size();
    const size_t computed_proof_size = AvmFlavor::COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS;

    EXPECT_EQ(actual_proof_size, computed_proof_size)
        << "Actual proof size (" << actual_proof_size << ") does not match COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS ("
        << computed_proof_size << "). The formula in flavor.hpp needs to be updated.";
}

} // namespace bb::avm2::constraining
