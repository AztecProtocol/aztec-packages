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
        using AvmVerificationKey = AvmFlavor::VerificationKey;
        typename Prover::Proof proof;
        std::shared_ptr<AvmVerificationKey> verification_key;
        std::vector<std::vector<FF>> public_inputs_cols;
    };

    // Helper function to create proof.
    static NativeProofResult create_proof_and_vk()
    {
        auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();

        Prover prover;
        auto public_inputs_cols = public_inputs.to_columns();
        const auto [proof, vk_data] = prover.prove(std::move(trace));
        const auto verification_key = prover.create_verification_key(vk_data);

        return { proof, verification_key, public_inputs_cols };
    }
};

TEST_F(AvmVerifierTests, GoodPublicInputs)
{
    NativeProofResult proof_result = create_proof_and_vk();
    auto [proof, verification_key, public_inputs_cols] = proof_result;

    Verifier verifier(verification_key);

    const bool verified = verifier.verify_proof(proof, public_inputs_cols);

    ASSERT_TRUE(verified) << "native proof verification failed";
}

TEST_F(AvmVerifierTests, NegativeBadPublicInputs)
{
    NativeProofResult proof_result = create_proof_and_vk();
    auto [proof, verification_key, public_inputs_cols] = proof_result;
    auto verify_with_corrupt_pi_col = [&](size_t col_idx) {
        public_inputs_cols[col_idx][5] += FF::one();
        Verifier verifier(verification_key);
        const bool verified = verifier.verify_proof(proof, public_inputs_cols);
        ASSERT_FALSE(verified)
            << "native proof verification succeeded, but should have failed due to corruption of public inputs col "
            << col_idx;
        public_inputs_cols[col_idx][5] -= FF::one(); // reset
    };
    for (size_t col_idx = 0; col_idx < 4; col_idx++) {
        verify_with_corrupt_pi_col(col_idx);
    }
    Verifier verifier(verification_key);
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);
    ASSERT_TRUE(verified) << "native proof verification failed, but should have succeeded";
}
} // namespace bb::avm2::constraining
