#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

auto& engine = numeric::get_debug_randomness();

using FlavorTypes = ::testing::Types<MegaFlavor, MegaZKFlavor>;

template <typename Flavor> class MergeTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;

    /**
     * @brief Construct and a verify a Honk proof
     *
     */
    bool construct_and_verify_honk_proof(auto& builder)
    {
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        Prover prover(prover_instance, verification_key);
        Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

        return verified;
    }

    /**
     * @brief Construct and verify a Goblin ECC op queue merge proof
     *
     */
    bool construct_and_verify_merge_proof(auto& op_queue, MergeSettings settings = MergeSettings::PREPEND)
    {
        MergeProver merge_prover{ op_queue, settings };
        auto merge_proof = merge_prover.construct_proof();

        // Construct Merge commitments
        MergeVerifier::InputCommitments merge_commitments;
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();
        for (size_t idx = 0; idx < Flavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
        }

        auto transcript = std::make_shared<NativeTranscript>();
        MergeVerifier merge_verifier{ settings, transcript };
        auto [pairing_points, _, degree_check_passed, concatenation_check_passed] =
            merge_verifier.verify_proof(merge_proof, merge_commitments);

        return pairing_points.check() && degree_check_passed && concatenation_check_passed;
    }
};

TYPED_TEST_SUITE(MergeTests, FlavorTypes);

/**
 * @brief Check that size of a merge proof matches the corresponding constant
 * @details This is useful for ensuring correct construction of mock merge proofs
 *
 */
TYPED_TEST(MergeTests, MergeProofSizeCheck)
{
    using Flavor = TypeParam;

    auto builder = typename Flavor::CircuitBuilder{};
    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct a merge proof and ensure its size matches expectation; if not, the constant may need to be updated
    MergeProver merge_prover{ builder.op_queue };
    auto merge_proof = merge_prover.construct_proof();

    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates
 * @note We simulate op queue interactions with a previous circuit so the actual circuit under test utilizes an op queue
 * with non-empty 'previous' data. This avoid complications with zero-commitments etc.
 *
 */
TYPED_TEST(MergeTests, SingleCircuit)
{
    using Flavor = TypeParam;
    auto builder = typename Flavor::CircuitBuilder{};

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof
    bool honk_verified = this->construct_and_verify_honk_proof(builder);
    EXPECT_TRUE(honk_verified);

    // Construct and verify Goblin ECC op queue Merge proof
    auto merge_verified = this->construct_and_verify_merge_proof(builder.op_queue);
    EXPECT_TRUE(merge_verified);
}

/**
 * @brief Test Merge proof construction/verification for multiple circuits with ECC op gates, public inputs, and
 * basic arithmetic gates
 *
 */
TYPED_TEST(MergeTests, MultipleCircuitsMergeOnly)
{
    using Flavor = TypeParam;
    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    // Construct multiple test circuits that share an ECC op queue. Generate and verify a proof for each.
    size_t NUM_CIRCUITS = 3;
    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto builder = typename Flavor::CircuitBuilder{ op_queue };

        GoblinMockCircuits::construct_simple_circuit(builder);

        // Construct and verify Goblin ECC op queue Merge proof
        auto merge_verified = this->construct_and_verify_merge_proof(op_queue);
        EXPECT_TRUE(merge_verified);
    }
}

/**
 * @brief Test Honk proof construction/verification for multiple circuits with ECC op gates, public inputs, and
 * basic arithmetic gates
 *
 */
TYPED_TEST(MergeTests, MultipleCircuitsHonkOnly)
{
    using Flavor = TypeParam;

    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    // Construct multiple test circuits that share an ECC op queue. Generate and verify a proof for each.
    size_t NUM_CIRCUITS = 3;
    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto builder = typename Flavor::CircuitBuilder{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(builder);
        // Construct and verify Honk proof
        bool honk_verified = this->construct_and_verify_honk_proof(builder);
        EXPECT_TRUE(honk_verified);
        // Artificially merge the op queue sincer we're not running the merge protocol in this test
        builder.op_queue->merge();
    }
}

TYPED_TEST(MergeTests, MultipleCircuitsMergeOnlyPrependThenAppend)
{
    using Flavor = TypeParam;
    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    // Construct multiple test circuits that share an ECC op queue. Generate and verify a proof for each.
    size_t NUM_CIRCUITS = 3;
    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto builder = typename Flavor::CircuitBuilder{ op_queue };

        GoblinMockCircuits::construct_simple_circuit(builder);

        // Construct and verify Goblin ECC op queue Merge proof
        auto merge_verified = this->construct_and_verify_merge_proof(op_queue);
        EXPECT_TRUE(merge_verified);
    }

    // Construct a final circuit and append its ecc ops to the op queue
    auto builder = typename Flavor::CircuitBuilder{ op_queue };

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Goblin ECC op queue Merge proof
    auto merge_verified = this->construct_and_verify_merge_proof(op_queue, MergeSettings::APPEND);
    EXPECT_TRUE(merge_verified);
}

/**
 * @brief Test Honk and Merge proof construction/verification for multiple circuits with ECC op gates, public inputs,
 * and basic arithmetic gates
 *
 */
TYPED_TEST(MergeTests, MultipleCircuitsHonkAndMerge)
{
    using Flavor = TypeParam;

    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    // Construct multiple test circuits that share an ECC op queue. Generate and verify a proof for each.
    size_t NUM_CIRCUITS = 3;
    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto builder = typename Flavor::CircuitBuilder{ op_queue };

        GoblinMockCircuits::construct_simple_circuit(builder);

        // Construct and verify Honk proof
        bool honk_verified = this->construct_and_verify_honk_proof(builder);
        EXPECT_TRUE(honk_verified);

        // Construct and verify Goblin ECC op queue Merge proof
        auto merge_verified = this->construct_and_verify_merge_proof(op_queue);
        EXPECT_TRUE(merge_verified);
    }

    // Construct a final circuit whose ecc ops will be appended rather than prepended to the op queue
    auto builder = typename Flavor::CircuitBuilder{ op_queue };

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof
    bool honk_verified = this->construct_and_verify_honk_proof(builder);
    EXPECT_TRUE(honk_verified);

    // Construct and verify Goblin ECC op queue Merge proof
    auto merge_verified = this->construct_and_verify_merge_proof(op_queue, MergeSettings::APPEND);
    EXPECT_TRUE(merge_verified);
}

/**
 * @brief To ensure the Merge proof sent to the rollup is ZK we have to randomise the commitments and evaluation of
 * column polynomials. We achieve this by adding some randomness to the op queue via random ops in builders. As we
 * produce a MegaHonk proof for such builders, this test ensure random ops do not alter the correctness of such proof
 * (which only asserts that the data in ecc_op_wires has been compied correctly from the other wires).
 *
 */
TYPED_TEST(MergeTests, OpQueueWithRandomValues)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;

    // Test for randomness added at the beginning
    {
        Builder builder;
        GoblinMockCircuits::randomise_op_queue(builder, 2);
        GoblinMockCircuits::construct_simple_circuit(builder);

        // Construct and verify Honk proof
        bool honk_verified = this->construct_and_verify_honk_proof(builder);
        EXPECT_TRUE(honk_verified);
    }

    // Test for randomness added at the end
    {
        Builder builder;
        GoblinMockCircuits::construct_simple_circuit(builder);
        GoblinMockCircuits::randomise_op_queue(builder, 2);

        // Construct and verify Honk proof
        bool honk_verified = this->construct_and_verify_honk_proof(builder);
        EXPECT_TRUE(honk_verified);
    }
}
