#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/relation_checker.hpp"
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
     * @brief Construct and a verify a Honk proof using a specified structured trace
     *
     */
    bool construct_and_verify_honk_proof_with_structured_trace(auto& builder, TraceSettings& trace_settings)
    {
        // no ZK flavor for now
        using Prover = UltraProver_<MegaFlavor>;
        using Verifier = UltraVerifier_<MegaFlavor>;
        using VerificationKey = typename MegaFlavor::VerificationKey;
        using ProverInstance = ProverInstance_<MegaFlavor>;
        auto prover_instance = std::make_shared<ProverInstance>(builder, trace_settings);

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
        MergeVerifier merge_verifier{ settings };
        auto merge_proof = merge_prover.construct_proof();

        // Construct Merge commitments
        MergeVerifier::InputCommitments merge_commitments;
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_previous_ultra_ops_table_columns();
        for (size_t idx = 0; idx < Flavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
        }

        auto [verified, _] = merge_verifier.verify_proof(merge_proof, merge_commitments);

        return verified;
    }
};

TYPED_TEST_SUITE(MegaHonkTests, FlavorTypes);

/**
 * @brief Check that size of a mega proof matches the corresponding constant
 *@details If this test FAILS, then the following (non-exhaustive) list should probably be updated as well:
 * - Proof length formula in ultra_flavor.hpp, mega_flavor.hpp, etc...
 * - mega_transcript.test.cpp
 * - constants in yarn-project in: constants.nr, constants.gen.ts, ConstantsGen.sol, various main.nr files of programs
 * with recursive verification circuits
 * - Places that define SIZE_OF_PROOF_IF_LOGN_IS_28
 */
TYPED_TEST(MegaHonkTests, ProofLengthCheck)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;
    using DefaultIO = stdlib::recursion::honk::DefaultIO<Builder>;

    auto builder = Builder{};
    DefaultIO::add_default(builder);

    // Construct a mega proof and ensure its size matches expectation; if not, the constant may need to be updated
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    UltraProver_<Flavor> prover(prover_instance, verification_key);
    HonkProof mega_proof = prover.construct_proof();
    EXPECT_EQ(mega_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + DefaultIO::PUBLIC_INPUTS_SIZE);
}

/**
 * @brief Check that size of a merge proof matches the corresponding constant
 * @details This is useful for ensuring correct construction of mock merge proofs
 *
 */
TYPED_TEST(MegaHonkTests, MergeProofSizeCheck)
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

    // In MegaZKFlavor, we mask witness polynomials by placing random values at the indices `dyadic_circuit_size`-i for
    // i=1,2,3. This mechanism does not work with structured polynomials yet.
    if constexpr (std::is_same_v<Flavor, MegaZKFlavor>) {
        GTEST_SKIP() << "Skipping 'BasicStructured' test for MegaZKFlavor.";
    }
    typename Flavor::CircuitBuilder builder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof using a structured trace
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder, trace_settings);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    Prover prover(prover_instance, verification_key);
    Verifier verifier(verification_key);
    auto proof = prover.construct_proof();

    // Sanity check: ensure z_perm is not zero everywhere
    EXPECT_TRUE(!prover_instance->polynomials.z_perm.is_zero());

    RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);

    bool result = verifier.template verify_proof<DefaultIO>(proof).result;
    EXPECT_TRUE(result);
}

/**
 * @brief Test that increasing the virtual size of a valid set of prover polynomials still results in a valid Megahonk
 * proof
 *
 */
TYPED_TEST(MegaHonkTests, DynamicVirtualSizeIncrease)
{
    using Flavor = TypeParam;

    // In MegaZKFlavor, we mask witness polynomials by placing random values at the indices `dyadic_circuit_size`-i for
    // i=1,2,3. This mechanism does not work with structured polynomials yet.
    if constexpr (std::is_same_v<Flavor, MegaZKFlavor>) {
        GTEST_SKIP() << "Skipping 'DynamicVirtualSizeIncrease' test for MegaZKFlavor.";
    }
    typename Flavor::CircuitBuilder builder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    GoblinMockCircuits::construct_simple_circuit(builder);

    auto builder_copy = builder;

    // Construct and verify Honk proof using a structured trace
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE_FOR_OVERFLOWS };
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder, trace_settings);
    auto prover_instance_copy = std::make_shared<ProverInstance_<Flavor>>(builder_copy, trace_settings);
    auto circuit_size = prover_instance->dyadic_size();

    auto doubled_circuit_size = 2 * circuit_size;
    prover_instance_copy->polynomials.increase_polynomials_virtual_size(doubled_circuit_size);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1158)
    // prover_instance_copy->dyadic_circuit_size = doubled_circuit_size;

    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    Prover prover(prover_instance, verification_key);

    auto verification_key_copy = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    Prover prover_copy(prover_instance_copy, verification_key_copy);

    for (auto [entry, entry_copy] : zip_view(verification_key->get_all(), verification_key_copy->get_all())) {
        EXPECT_EQ(entry, entry_copy);
    }

    Verifier verifier(verification_key);
    auto proof = prover.construct_proof();

    RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);
    bool result = verifier.template verify_proof<DefaultIO>(proof).result;
    EXPECT_TRUE(result);

    Verifier verifier_copy(verification_key_copy);
    auto proof_copy = prover_copy.construct_proof();

    RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);
    bool result_copy = verifier_copy.template verify_proof<DefaultIO>(proof_copy).result;
    EXPECT_TRUE(result_copy);
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
TYPED_TEST(MegaHonkTests, MultipleCircuitsMergeOnly)
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

TYPED_TEST(MegaHonkTests, MultipleCircuitsMergeOnlyPrependThenAppend)
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
 * @brief Test Honk proof construction/verification for multiple circuits with ECC op gates, public inputs, and
 * basic arithmetic gates
 *
 */
TYPED_TEST(MegaHonkTests, MultipleCircuitsHonkOnly)
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
    // In MegaZKFlavor, we mask witness polynomials by placing random values at the indices `dyadic_circuit_size`-i, for
    // i=1,2,3. This mechanism does not work with structured polynomials yet.
    if constexpr (std::is_same_v<Flavor, MegaZKFlavor>) {
        GTEST_SKIP() << "Skipping 'PolySwap' test for MegaZKFlavor.";
    }
    using Builder = Flavor::CircuitBuilder;

    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE_FOR_OVERFLOWS };

    // Construct a simple circuit and make a copy of it
    Builder builder;
    GoblinMockCircuits::construct_simple_circuit(builder);
    auto builder_copy = builder;

    // Construct two identical proving keys
    auto prover_instance_1 = std::make_shared<typename TestFixture::ProverInstance>(builder, trace_settings);
    auto prover_instance_2 = std::make_shared<typename TestFixture::ProverInstance>(builder_copy, trace_settings);

    // Tamper with the polys of pkey 1 in such a way that verification should fail
    for (size_t i = 0; i < prover_instance_1->dyadic_size(); ++i) {
        if (prover_instance_1->polynomials.q_arith[i] != 0) {
            prover_instance_1->polynomials.w_l.at(i) += 1;
            break;
        }
    }

    // Swap the polys of the two proving keys; result should be pkey 1 is valid and pkey 2 should fail
    std::swap(prover_instance_1->polynomials, prover_instance_2->polynomials);

    { // Verification based on pkey 1 should succeed
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(prover_instance_1->get_precomputed());
        typename TestFixture::Prover prover(prover_instance_1, verification_key);
        typename TestFixture::Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool result = verifier.template verify_proof<DefaultIO>(proof).result;
        EXPECT_TRUE(result);
    }

    { // Verification based on pkey 2 should fail
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(prover_instance_2->get_precomputed());
        typename TestFixture::Prover prover(prover_instance_2, verification_key);
        typename TestFixture::Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool result = verifier.template verify_proof<DefaultIO>(proof).result;
        EXPECT_FALSE(result);
    }
}

/**
 * @brief To ensure the Merge proof sent to the rollup is ZK we have to randomise the commitments and evaluation of
 * column polynomials. We achieve this by adding some randomness to the op queue via random ops in builders. As we
 * produce a MegaHonk proof for such builders, this test ensure random ops do not alter the correctness of such proof
 * (which only asserts that the data in ecc_op_wires has been compied correctly from the other wires).
 *
 */
TYPED_TEST(MegaHonkTests, OpQueueWithRandomValues)
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
