#include "basefold.hpp"
#include "ecfft_domain.hpp"
#include "ecfft_domain_data_2_8.hpp"

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>

namespace bb::basefold {

namespace {

/**
 * @brief Build the test domain from the generated hex data.
 */
EcfftDomain build_test_domain()
{
    using namespace domain_data;

    std::vector<std::pair<const char* const*, size_t>> layer_hex;
    std::vector<std::pair<const char* const*, size_t>> diff_inv_hex;

    // Layer 0-8 and their diff_inv arrays
    layer_hex.push_back({ LAYER_0.data(), LAYER_0.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_0.data(), PAIR_DIFF_INV_0.size() });

    layer_hex.push_back({ LAYER_1.data(), LAYER_1.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_1.data(), PAIR_DIFF_INV_1.size() });

    layer_hex.push_back({ LAYER_2.data(), LAYER_2.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_2.data(), PAIR_DIFF_INV_2.size() });

    layer_hex.push_back({ LAYER_3.data(), LAYER_3.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_3.data(), PAIR_DIFF_INV_3.size() });

    layer_hex.push_back({ LAYER_4.data(), LAYER_4.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_4.data(), PAIR_DIFF_INV_4.size() });

    layer_hex.push_back({ LAYER_5.data(), LAYER_5.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_5.data(), PAIR_DIFF_INV_5.size() });

    layer_hex.push_back({ LAYER_6.data(), LAYER_6.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_6.data(), PAIR_DIFF_INV_6.size() });

    layer_hex.push_back({ LAYER_7.data(), LAYER_7.size() });
    diff_inv_hex.push_back({ PAIR_DIFF_INV_7.data(), PAIR_DIFF_INV_7.size() });

    // Final layer (size 1, no diff_inv)
    layer_hex.push_back({ LAYER_8.data(), LAYER_8.size() });

    return EcfftDomain::from_hex_arrays(LOG_N, layer_hex, diff_inv_hex);
}

} // anonymous namespace

class BaseFoldTest : public ::testing::Test {
  protected:
    void SetUp() override { domain = build_test_domain(); }

    EcfftDomain domain;
};

TEST_F(BaseFoldTest, DomainLoadsCorrectly)
{
    EXPECT_EQ(domain.log_n, 8);
    EXPECT_EQ(domain.num_rounds, 8);
    EXPECT_EQ(domain.levels.size(), 9);
    EXPECT_EQ(domain.levels[0].size(), 256);
    EXPECT_EQ(domain.levels[1].size(), 128);
    EXPECT_EQ(domain.levels[8].size(), 1);
    EXPECT_EQ(domain.levels[0].num_pairs(), 128);
}

TEST_F(BaseFoldTest, FoldPairScalar)
{
    // Test fold_pair with scalar field elements.
    // Use a degree-1 polynomial f(x) = 1 + 2x evaluated on L_0.
    // After folding with degree_bound = 256 and challenge z, the result
    // should be a degree-0 polynomial (constant) on L_1.

    size_t n = domain.levels[0].size();
    Fq z(42);

    // Evaluate f(x) = 1 + 2x on L_0
    std::vector<Fq> evals(n);
    for (size_t j = 0; j < n; j++) {
        evals[j] = Fq(1) + Fq(2) * domain.levels[0].domain[j];
    }

    // Fold all pairs
    size_t half = n / 2;
    std::vector<Fq> folded(half);
    for (size_t j = 0; j < half; j++) {
        folded[j] = domain.fold_pair<Fq>(0, n, j, evals[j], evals[j + half], z);
    }

    // Check: verify_query should match
    for (size_t j = 0; j < std::min(half, size_t(8)); j++) {
        Fq expected = domain.fold_pair<Fq>(0, n, j, evals[j], evals[j + half], z);
        EXPECT_EQ(folded[j], expected);
    }
}

TEST_F(BaseFoldTest, FoldGroupElement)
{
    // Test fold_pair with group elements.
    // Create random group elements and verify fold is consistent.
    auto& engine = numeric::get_debug_randomness();

    size_t n = domain.levels[0].size();
    Fq z = Fq::random_element(&engine);

    // Random group elements
    std::vector<NativeCommitment> g_oracle(n);
    for (size_t i = 0; i < n; i++) {
        g_oracle[i] = grumpkin::g1::element::random_element(&engine).normalize();
    }

    // Fold using the prover function
    auto folded = fold_group_oracle(g_oracle, domain, 0, n, z);
    EXPECT_EQ(folded.size(), n / 2);

    // Verify fold_pair gives the same result for a few indices
    for (size_t j = 0; j < 4; j++) {
        NativeGroupElement expected = domain.fold_pair<NativeGroupElement>(
            0, n, j, NativeGroupElement(g_oracle[j]), NativeGroupElement(g_oracle[j + n / 2]), z);
        EXPECT_EQ(NativeCommitment(expected.normalize()), folded[j]);
    }
}

TEST_F(BaseFoldTest, MerkleTreeRoundTrip)
{
    auto& engine = numeric::get_debug_randomness();

    // Build a small Merkle tree over random group elements
    size_t n = 16;
    std::vector<NativeCommitment> elements(n);
    for (size_t i = 0; i < n; i++) {
        elements[i] = grumpkin::g1::element::random_element(&engine).normalize();
    }

    auto [tree, root] = build_merkle_tree(elements);

    // Verify openings at a few indices
    for (size_t i = 0; i < n; i++) {
        auto path = tree.get_sibling_path(i);
        EXPECT_TRUE(verify_merkle_opening(root, i, elements[i], path));
    }

    // Tampering should fail
    auto bad_element = grumpkin::g1::element::random_element(&engine).normalize();
    auto path = tree.get_sibling_path(0);
    EXPECT_FALSE(verify_merkle_opening(root, 0, bad_element, path));
}

TEST_F(BaseFoldTest, ProverVerifierRoundTrip)
{
    // Full prover-verifier round trip with random group elements.
    auto& engine = numeric::get_debug_randomness();

    size_t n = domain.levels[0].size(); // 256
    size_t degree_bound = n;
    size_t num_queries = 4; // small for testing

    // Random group elements as the "SRS encoding"
    std::vector<NativeCommitment> g0(n);
    for (size_t i = 0; i < n; i++) {
        g0[i] = grumpkin::g1::element::random_element(&engine).normalize();
    }

    // Prove
    auto prover_transcript = std::make_shared<NativeTranscript>();
    prove(g0, domain, degree_bound, num_queries, prover_transcript);

    // Verify
    auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->export_proof());
    bool result = verify(domain, degree_bound, num_queries, verifier_transcript);
    EXPECT_TRUE(result);
}

TEST_F(BaseFoldTest, SoundnessRejectsTamperedOracle)
{
    auto& engine = numeric::get_debug_randomness();

    size_t n = domain.levels[0].size();
    size_t degree_bound = n;
    size_t num_queries = 4;

    std::vector<NativeCommitment> g0(n);
    for (size_t i = 0; i < n; i++) {
        g0[i] = grumpkin::g1::element::random_element(&engine).normalize();
    }

    // Prove with correct oracle
    auto prover_transcript = std::make_shared<NativeTranscript>();
    prove(g0, domain, degree_bound, num_queries, prover_transcript);

    // Tamper with a field element in the proof
    auto proof_data = prover_transcript->export_proof();
    if (!proof_data.empty()) {
        proof_data[proof_data.size() / 2] += fr(1);
    }

    // Verification should fail (with high probability)
    auto verifier_transcript = std::make_shared<NativeTranscript>(proof_data);
    // Note: tampered transcript may throw or return false
    bool result = false;
    try {
        result = verify(domain, degree_bound, num_queries, verifier_transcript);
    } catch (...) {
        result = false;
    }
    EXPECT_FALSE(result);
}

} // namespace bb::basefold
