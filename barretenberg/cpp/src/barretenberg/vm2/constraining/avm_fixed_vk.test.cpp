#include "barretenberg/vm2/constraining/avm_fixed_vk.hpp"
#include "barretenberg/vm2/constraining/polynomials.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {

/**
 * @brief Test that the fixed VK commitments agree with the ones computed from precomputed columns.
 * @note If this test fails, it may be because the precomputed columns have changed and the fixed VK commitments in
 * AvmFixedVKCommitments must be updated accordingly. Their values can be taken from the output of this test by
 * uncommenting the print statements.
 */
TEST(AvmFixedVKTests, FixedVKCommitments)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    AvmTraceGenHelper tracegen_helper;
    auto trace = tracegen_helper.generate_precomputed_columns();

    auto polynomials = compute_polynomials(trace);
    auto proving_key = proving_key_from_polynomials(polynomials);

    auto vk_computed = AvmVerifier::VerificationKey::from_proving_key_for_testing(*proving_key);
    auto vk_computed_commitments = vk_computed.get_all();

    // Get the fixed VK commitments
    auto fixed_vk_commitments = AvmFixedVKCommitments::get_all();

    // Check that sizes match
    EXPECT_EQ(vk_computed_commitments.size(), fixed_vk_commitments.size())
        << "VK commitments size mismatch: computed has " << vk_computed_commitments.size() << " commitments, fixed has "
        << fixed_vk_commitments.size();

    // Compare each commitment
    auto labels = vk_computed.get_labels();
    for (size_t i = 0; i < vk_computed_commitments.size(); ++i) {
        EXPECT_EQ(vk_computed_commitments[i], fixed_vk_commitments[i])
            << "Mismatch at index " << i << " (label: " << labels[i] << ")";
    }

    // Uncomment to print the commitments formatted for easy copy-paste into avm_fixed_vk.hpp
    // std::cout << "// Copy these commitments into AvmFixedVKCommitments::get_all():\n";
    // for (size_t i = 0; i < vk_computed_commitments.size(); ++i) {
    //     const auto& commitment = vk_computed_commitments[i];
    //     if (commitment.is_point_at_infinity()) {
    //         std::cout << "Commitment::infinity()";
    //     } else {
    //         std::cout << "Commitment(uint256_t(\"" << uint256_t(commitment.x) << "\"), uint256_t(\""
    //                   << uint256_t(commitment.y) << "\"))";
    //     }
    //     if (i < vk_computed_commitments.size() - 1) {
    //         std::cout << ",";
    //     }
    //     std::cout << " // " << labels[i] << "\n";
    // }
}

} // namespace bb::avm2::constraining
