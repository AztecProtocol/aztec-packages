#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
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
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto prover_instance_copy = std::make_shared<ProverInstance_<Flavor>>(builder_copy);
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

    auto relation_failures =
        RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);
    EXPECT_TRUE(relation_failures.empty());
    bool result = verifier.template verify_proof<DefaultIO>(proof).result;
    EXPECT_TRUE(result);

    Verifier verifier_copy(verification_key_copy);
    auto proof_copy = prover_copy.construct_proof();

    auto relation_failures_copy =
        RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);
    EXPECT_TRUE(relation_failures.empty());
    bool result_copy = verifier_copy.template verify_proof<DefaultIO>(proof_copy).result;
    EXPECT_TRUE(result_copy);
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

    // Construct a simple circuit and make a copy of it
    Builder builder;
    GoblinMockCircuits::construct_simple_circuit(builder);
    auto builder_copy = builder;

    // Construct two identical proving keys
    auto prover_instance_1 = std::make_shared<typename TestFixture::ProverInstance>(builder);
    auto prover_instance_2 = std::make_shared<typename TestFixture::ProverInstance>(builder_copy);

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
