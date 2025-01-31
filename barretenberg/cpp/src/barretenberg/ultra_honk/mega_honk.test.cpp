#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/plonk_honk_shared/relation_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

auto& engine = numeric::get_debug_randomness();

using FlavorTypes = ::testing::Types<MegaFlavor, MegaZKFlavor>;

template <typename Flavor> class MegaHonkTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using MergeProver = MergeProver_<Flavor>;
    using MergeVerifier = MergeVerifier_<Flavor>;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;

    /**
     * @brief Construct and a verify a Honk proof
     *
     */
    bool construct_and_verify_honk_proof(auto& builder)
    {
        auto proving_key = std::make_shared<DeciderProvingKey>(builder);
        Prover prover(proving_key);
        auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);
        Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);

        return verified;
    }

    /**
     * @brief Construct and a verify a Honk proof using a specified structured trace
     *
     */
    bool construct_and_verify_honk_proof_with_structured_trace(auto& builder, TraceSettings& trace_settings)
    {
        // no ZK flavor for now
        using Prover = UltraProver_<MegaFlavor>;
        using Verifier = UltraVerifier_<MegaFlavor>;
        using VerificationKey = typename MegaFlavor::VerificationKey;
        using DeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
        auto proving_key = std::make_shared<DeciderProvingKey>(builder, trace_settings);

        Prover prover(proving_key);
        auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);
        Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);

        return verified;
    }

    /**
     * @brief Construct and verify a Goblin ECC op queue merge proof
     *
     */
    bool construct_and_verify_merge_proof(auto& op_queue)
    {
        MergeProver merge_prover{ op_queue };
        MergeVerifier merge_verifier;
        auto merge_proof = merge_prover.construct_proof();
        bool verified = merge_verifier.verify_proof(merge_proof);

        return verified;
    }
};

TYPED_TEST_SUITE(MegaHonkTests, FlavorTypes);

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates
 *
 */
TYPED_TEST(MegaHonkTests, Basic)
{
    using Flavor = TypeParam;
    typename Flavor::CircuitBuilder builder;

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof
    bool honk_verified = this->construct_and_verify_honk_proof(builder);
    EXPECT_TRUE(honk_verified);
}

/**
 * @brief Test proof construction/verification for a structured execution trace
 *
 */
TYPED_TEST(MegaHonkTests, BasicStructured)
{
    using Flavor = TypeParam;
    typename Flavor::CircuitBuilder builder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof using a structured trace
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, trace_settings);
    Prover prover(proving_key);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key->proving_key);
    Verifier verifier(verification_key);
    auto proof = prover.construct_proof();

    // Sanity check: ensure z_perm is not zero everywhere
    EXPECT_TRUE(!proving_key->proving_key.polynomials.z_perm.is_zero());

    RelationChecker<Flavor>::check_all(proving_key->proving_key.polynomials, proving_key->relation_parameters);

    EXPECT_TRUE(verifier.verify_proof(proof));
}

/**
 * @brief Test that increasing the virtual size of a valid set of prover polynomials still results in a valid Megahonk
 * proof
 *
 */
TYPED_TEST(MegaHonkTests, DynamicVirtualSizeIncrease)
{
    using Flavor = TypeParam;
    typename Flavor::CircuitBuilder builder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    GoblinMockCircuits::construct_simple_circuit(builder);

    auto builder_copy = builder;

    // Construct and verify Honk proof using a structured trace
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE_FOR_OVERFLOWS };
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, trace_settings);
    auto proving_key_copy = std::make_shared<DeciderProvingKey_<Flavor>>(builder_copy, trace_settings);
    auto circuit_size = proving_key->proving_key.circuit_size;

    auto doubled_circuit_size = 2 * circuit_size;
    proving_key_copy->proving_key.polynomials.increase_polynomials_virtual_size(doubled_circuit_size);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1158)
    // proving_key_copy->proving_key.circuit_size = doubled_circuit_size;

    Prover prover(proving_key);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key->proving_key);

    Prover prover_copy(proving_key_copy);
    auto verification_key_copy = std::make_shared<typename Flavor::VerificationKey>(proving_key_copy->proving_key);

    for (auto [entry, entry_copy] : zip_view(verification_key->get_all(), verification_key_copy->get_all())) {
        EXPECT_EQ(entry, entry_copy);
    }

    Verifier verifier(verification_key);
    auto proof = prover.construct_proof();

    RelationChecker<Flavor>::check_all(proving_key->proving_key.polynomials, proving_key->relation_parameters);
    EXPECT_TRUE(verifier.verify_proof(proof));

    Verifier verifier_copy(verification_key_copy);
    auto proof_copy = prover_copy.construct_proof();

    RelationChecker<Flavor>::check_all(proving_key->proving_key.polynomials, proving_key->relation_parameters);
    EXPECT_TRUE(verifier_copy.verify_proof(proof_copy));
}

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates
 * @note We simulate op queue interactions with a previous circuit so the actual circuit under test utilizes an op queue
 * with non-empty 'previous' data. This avoid complications with zero-commitments etc.
 *
 */
TYPED_TEST(MegaHonkTests, SingleCircuit)
{
    using Flavor = TypeParam;
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(op_queue);
    auto builder = typename Flavor::CircuitBuilder{ op_queue };

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof
    bool honk_verified = this->construct_and_verify_honk_proof(builder);
    EXPECT_TRUE(honk_verified);

    // Construct and verify Goblin ECC op queue Merge proof
    auto merge_verified = this->construct_and_verify_merge_proof(op_queue);
    EXPECT_TRUE(merge_verified);
}

/**
 * @brief Test Merge proof construction/verification for multiple circuits with ECC op gates, public inputs, and
 * basic arithmetic gates
 *
 */
TYPED_TEST(MegaHonkTests, MultipleCircuitsMergeOnly)
{
    using Flavor = TypeParam;
    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(op_queue);

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
TYPED_TEST(MegaHonkTests, MultipleCircuitsHonkOnly)
{
    using Flavor = TypeParam;

    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(op_queue);

    // Construct multiple test circuits that share an ECC op queue. Generate and verify a proof for each.
    size_t NUM_CIRCUITS = 3;
    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto builder = typename Flavor::CircuitBuilder{ op_queue };

        GoblinMockCircuits::construct_simple_circuit(builder);

        // Construct and verify Honk proof
        bool honk_verified = this->construct_and_verify_honk_proof(builder);
        EXPECT_TRUE(honk_verified);
    }
}

/**
 * @brief Test Honk and Merge proof construction/verification for multiple circuits with ECC op gates, public inputs,
 * and basic arithmetic gates
 *
 */
TYPED_TEST(MegaHonkTests, MultipleCircuitsHonkAndMerge)
{
    using Flavor = TypeParam;

    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(op_queue);

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

    // Compute the commitments to the aggregate op queue directly and check that they match those that were computed
    // iteratively during transcript aggregation by the provers and stored in the op queue.
    size_t aggregate_op_queue_size = op_queue->get_current_size();
    auto ultra_ops = op_queue->get_aggregate_transcript();
    auto commitment_key = std::make_shared<typename Flavor::CommitmentKey>(aggregate_op_queue_size);
    size_t idx = 0;
    for (const auto& result : op_queue->get_ultra_ops_commitments()) {
        auto expected = commitment_key->commit({ /* start index */ 0, ultra_ops[idx++] });
        EXPECT_EQ(result, expected);
    }
}

/**
 * @brief Test the structured trace overflow mechanism for various circuits which overflow in different ways
 *
 */
TYPED_TEST(MegaHonkTests, StructuredTraceOverflow)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;

    TraceSettings trace_settings{ TINY_TEST_STRUCTURE };

    { // Overflow in Arithmetic block only
        Builder builder;

        GoblinMockCircuits::construct_simple_circuit(builder);
        MockCircuits::add_arithmetic_gates(builder, 1 << 15);

        bool verified = this->construct_and_verify_honk_proof_with_structured_trace(builder, trace_settings);
        EXPECT_TRUE(verified);

        // We expect that the circuit has overflowed the provided structured trace
        EXPECT_TRUE(builder.blocks.has_overflow);
    }

    { // Overflow in Aux block (RAM gates; uses memory records which requires specific logic in overflow mechanism)
        Builder builder;

        GoblinMockCircuits::construct_simple_circuit(builder);
        MockCircuits::add_RAM_gates(builder);

        bool verified = this->construct_and_verify_honk_proof_with_structured_trace(builder, trace_settings);
        EXPECT_TRUE(verified);

        // We expect that the circuit has overflowed the provided structured trace
        EXPECT_TRUE(builder.blocks.has_overflow);
    }

    { // Overflow in Lookup block only
        Builder builder;

        GoblinMockCircuits::construct_simple_circuit(builder);
        MockCircuits::add_lookup_gates(builder, /*num_iterations=*/8);

        bool verified = this->construct_and_verify_honk_proof_with_structured_trace(builder, trace_settings);
        EXPECT_TRUE(verified);

        // We expect that the circuit has overflowed the provided structured trace
        EXPECT_TRUE(builder.blocks.has_overflow);
    }

    { // Overflow in Multiple blocks simultaneously
        Builder builder;

        GoblinMockCircuits::construct_simple_circuit(builder);
        MockCircuits::add_arithmetic_gates(builder, 1 << 15);
        MockCircuits::add_RAM_gates(builder);
        MockCircuits::add_lookup_gates(builder, /*num_iterations=*/8);

        bool verified = this->construct_and_verify_honk_proof_with_structured_trace(builder, trace_settings);
        EXPECT_TRUE(verified);

        // We expect that the circuit has overflowed the provided structured trace
        EXPECT_TRUE(builder.blocks.has_overflow);
    }
}

/**
 * @brief A sanity check that a simple std::swap on a ProverPolynomials object works as expected
 * @details Constuct two valid proving keys. Tamper with the prover_polynomials of one key then swap the
 * prover_polynomials of the two keys. The key who received the tampered polys leads to a failed verification while the
 * other succeeds.
 *
 */
TYPED_TEST(MegaHonkTests, PolySwap)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;

    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE_FOR_OVERFLOWS };

    // Construct a simple circuit and make a copy of it
    Builder builder;
    GoblinMockCircuits::construct_simple_circuit(builder);
    auto builder_copy = builder;

    // Construct two identical proving keys
    auto proving_key_1 = std::make_shared<typename TestFixture::DeciderProvingKey>(builder, trace_settings);
    auto proving_key_2 = std::make_shared<typename TestFixture::DeciderProvingKey>(builder_copy, trace_settings);

    // Tamper with the polys of pkey 1 in such a way that verification should fail
    for (size_t i = 0; i < proving_key_1->proving_key.circuit_size; ++i) {
        if (proving_key_1->proving_key.polynomials.q_arith[i] != 0) {
            proving_key_1->proving_key.polynomials.w_l.at(i) += 1;
            break;
        }
    }

    // Swap the polys of the two proving keys; result should be pkey 1 is valid and pkey 2 should fail
    std::swap(proving_key_1->proving_key.polynomials, proving_key_2->proving_key.polynomials);

    { // Verification based on pkey 1 should succeed
        typename TestFixture::Prover prover(proving_key_1);
        auto verification_key = std::make_shared<typename TestFixture::VerificationKey>(proving_key_1->proving_key);
        typename TestFixture::Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        EXPECT_TRUE(verifier.verify_proof(proof));
    }

    { // Verification based on pkey 2 should fail
        typename TestFixture::Prover prover(proving_key_2);
        auto verification_key = std::make_shared<typename TestFixture::VerificationKey>(proving_key_2->proving_key);
        typename TestFixture::Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        EXPECT_FALSE(verifier.verify_proof(proof));
    }
}
