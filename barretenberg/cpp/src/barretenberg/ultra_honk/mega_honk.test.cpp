#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
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
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;

    /**
     * @brief Construct and a verify a Honk proof
     *
     */
    bool construct_and_verify_honk_proof(auto& builder)
    {
        auto proving_key = std::make_shared<DeciderProvingKey>(builder);
        auto verification_key = std::make_shared<VerificationKey>(proving_key->get_precomputed());
        Prover prover(proving_key, verification_key);
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

        auto verification_key = std::make_shared<VerificationKey>(proving_key->get_precomputed());
        Prover prover(proving_key, verification_key);
        Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);

        return verified;
    }

    RefArray<typename Flavor::Commitment, Flavor::NUM_WIRES> construct_subtable_commitments_from_op_queue(
        auto& op_queue,
        const MergeProver& merge_prover,
        std::array<typename Flavor::Commitment, Flavor::NUM_WIRES>& t_commitments_val)
    {
        std::array<typename Flavor::Polynomial, Flavor::NUM_WIRES> t_current =
            op_queue->construct_current_ultra_ops_subtable_columns();
        for (size_t idx = 0; idx < Flavor::NUM_WIRES; idx++) {
            t_commitments_val[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
        }

        RefArray<typename Flavor::Commitment, Flavor::NUM_WIRES> t_commitments(t_commitments_val);

        return t_commitments;
    }

    /**
     * @brief Construct and verify a Goblin ECC op queue merge proof
     *
     */
    bool construct_and_verify_merge_proof(auto& op_queue)
    {
        MergeProver merge_prover{ op_queue };
        MergeVerifier merge_verifier;
        merge_verifier.settings = op_queue->get_current_settings();
        auto merge_proof = merge_prover.construct_proof();
        std::array<typename Flavor::Commitment, Flavor::NUM_WIRES> t_commitments_val;

        bool verified = merge_verifier.verify_proof(
            merge_proof, this->construct_subtable_commitments_from_op_queue(op_queue, merge_prover, t_commitments_val));

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
TYPED_TEST(MegaHonkTests, MegaProofSizeCheck)
{
    using Flavor = TypeParam;

    auto builder = typename Flavor::CircuitBuilder{};
    stdlib::recursion::PairingPoints<typename Flavor::CircuitBuilder>::add_default_to_public_inputs(builder);

    // Construct a mega proof and ensure its size matches expectation; if not, the constant may need to be updated
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    UltraProver_<Flavor> prover(proving_key, verification_key);
    HonkProof mega_proof = prover.construct_proof();
    EXPECT_EQ(mega_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + PAIRING_POINTS_SIZE);
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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1240) Structured Polynomials in
    // ECCVM/Translator/MegaZK
    if constexpr (std::is_same_v<Flavor, MegaZKFlavor>) {
        GTEST_SKIP() << "Skipping 'BasicStructured' test for MegaZKFlavor.";
    }
    typename Flavor::CircuitBuilder builder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof using a structured trace
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, trace_settings);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    Prover prover(proving_key, verification_key);
    Verifier verifier(verification_key);
    auto proof = prover.construct_proof();

    // Sanity check: ensure z_perm is not zero everywhere
    EXPECT_TRUE(!proving_key->polynomials.z_perm.is_zero());

    RelationChecker<Flavor>::check_all(proving_key->polynomials, proving_key->relation_parameters);

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

    // In MegaZKFlavor, we mask witness polynomials by placing random values at the indices `dyadic_circuit_size`-i for
    // i=1,2,3. This mechanism does not work with structured polynomials yet.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1240) Structured Polynomials in
    // ECCVM/Translator/MegaZK
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
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, trace_settings);
    auto proving_key_copy = std::make_shared<DeciderProvingKey_<Flavor>>(builder_copy, trace_settings);
    auto circuit_size = proving_key->dyadic_size();

    auto doubled_circuit_size = 2 * circuit_size;
    proving_key_copy->polynomials.increase_polynomials_virtual_size(doubled_circuit_size);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1158)
    // proving_key_copy->dyadic_circuit_size = doubled_circuit_size;

    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    Prover prover(proving_key, verification_key);

    auto verification_key_copy = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    Prover prover_copy(proving_key_copy, verification_key_copy);

    for (auto [entry, entry_copy] : zip_view(verification_key->get_all(), verification_key_copy->get_all())) {
        EXPECT_EQ(entry, entry_copy);
    }

    Verifier verifier(verification_key);
    auto proof = prover.construct_proof();

    RelationChecker<Flavor>::check_all(proving_key->polynomials, proving_key->relation_parameters);
    EXPECT_TRUE(verifier.verify_proof(proof));

    Verifier verifier_copy(verification_key_copy);
    auto proof_copy = prover_copy.construct_proof();

    RelationChecker<Flavor>::check_all(proving_key->polynomials, proving_key->relation_parameters);
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

TYPED_TEST(MegaHonkTests, MultipleCircuitsMergeOnlyAppend)
{
    using Flavor = TypeParam;
    // Instantiate EccOpQueue. This will be shared across all circuits in the series
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    // Construct multiple test circuits that share an ECC op queue. Generate and verify a proof for each.
    size_t NUM_CIRCUITS = 3;
    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto builder = typename Flavor::CircuitBuilder{ op_queue, MergeSettings::APPEND };

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
    auto builder = typename Flavor::CircuitBuilder{ op_queue, MergeSettings::APPEND };

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Goblin ECC op queue Merge proof
    auto merge_verified = this->construct_and_verify_merge_proof(op_queue);
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
    auto builder = typename Flavor::CircuitBuilder{ op_queue, MergeSettings::APPEND };

    GoblinMockCircuits::construct_simple_circuit(builder);

    // Construct and verify Honk proof
    bool honk_verified = this->construct_and_verify_honk_proof(builder);
    EXPECT_TRUE(honk_verified);

    // Construct and verify Goblin ECC op queue Merge proof
    auto merge_verified = this->construct_and_verify_merge_proof(op_queue);
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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1240) Structured Polynomials in
    // ECCVM/Translator/MegaZK
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
    auto proving_key_1 = std::make_shared<typename TestFixture::DeciderProvingKey>(builder, trace_settings);
    auto proving_key_2 = std::make_shared<typename TestFixture::DeciderProvingKey>(builder_copy, trace_settings);

    // Tamper with the polys of pkey 1 in such a way that verification should fail
    for (size_t i = 0; i < proving_key_1->dyadic_size(); ++i) {
        if (proving_key_1->polynomials.q_arith[i] != 0) {
            proving_key_1->polynomials.w_l.at(i) += 1;
            break;
        }
    }

    // Swap the polys of the two proving keys; result should be pkey 1 is valid and pkey 2 should fail
    std::swap(proving_key_1->polynomials, proving_key_2->polynomials);

    { // Verification based on pkey 1 should succeed
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(proving_key_1->get_precomputed());
        typename TestFixture::Prover prover(proving_key_1, verification_key);
        typename TestFixture::Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        EXPECT_TRUE(verifier.verify_proof(proof));
    }

    { // Verification based on pkey 2 should fail
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(proving_key_2->get_precomputed());
        typename TestFixture::Prover prover(proving_key_2, verification_key);
        typename TestFixture::Verifier verifier(verification_key);
        auto proof = prover.construct_proof();
        EXPECT_FALSE(verifier.verify_proof(proof));
    }
}
