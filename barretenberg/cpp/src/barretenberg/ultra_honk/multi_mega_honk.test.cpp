#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/ultra_honk/multi_mega_verifier.hpp"

using namespace bb;

class MultiMegaHonkTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = MultiMegaFlavor;
    using Builder = Flavor::CircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Prover = MultiMegaProver;
    using Verifier = MultiMegaVerifier;
    using VerificationKey = typename Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;

    /**
     * @brief Construct and verify a MultiMegaHonk proof
     */
    bool construct_and_verify_honk_proof(Builder& builder)
    {
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
        Prover prover(prover_instance, verification_key);
        Verifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof).result;

        return verified;
    }
};

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates using interleaved commitments
 */
TEST_F(MultiMegaHonkTests, Basic)
{
    Builder builder;

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof
    bool honk_verified = construct_and_verify_honk_proof(builder);
    EXPECT_TRUE(honk_verified);
}

/**
 * @brief Test that proof verification fails when the proof is tampered with
 */
TEST_F(MultiMegaHonkTests, TamperedProof)
{
    Builder builder;

    GoblinMockCircuits::construct_simple_circuit(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Prover prover(prover_instance, verification_key);
    Verifier verifier(vk_and_hash);
    auto proof = prover.construct_proof();

    // Tamper with a random element of the proof
    if (!proof.empty()) {
        proof[proof.size() / 2] += FF::random_element();
    }

    bool verified = verifier.verify_proof(proof).result;
    EXPECT_FALSE(verified);
}
