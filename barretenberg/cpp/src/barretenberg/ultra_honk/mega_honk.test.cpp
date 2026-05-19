#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
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
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;
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
        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
        Prover prover(prover_instance, verification_key);
        Verifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof).result;

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
    EXPECT_EQ(mega_proof.size(),
              ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N) +
                  DefaultIO::PUBLIC_INPUTS_SIZE);
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
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;

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

    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Verifier verifier(vk_and_hash);
    auto proof = prover.construct_proof();

    auto relation_failures =
        RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);
    EXPECT_TRUE(relation_failures.empty());
    bool result = verifier.verify_proof(proof).result;
    EXPECT_TRUE(result);

    auto vk_and_hash_copy = std::make_shared<typename Flavor::VKAndHash>(verification_key_copy);
    Verifier verifier_copy(vk_and_hash_copy);
    auto proof_copy = prover_copy.construct_proof();

    auto relation_failures_copy =
        RelationChecker<Flavor>::check_all(prover_instance->polynomials, prover_instance->relation_parameters);
    EXPECT_TRUE(relation_failures.empty());
    bool result_copy = verifier_copy.verify_proof(proof_copy).result;
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
        if (prover_instance_1->polynomials.q_arith()[i] != 0) {
            prover_instance_1->polynomials.w_l().at(i) += 1;
            break;
        }
    }

    // Swap the polys of the two proving keys; result should be pkey 1 is valid and pkey 2 should fail
    std::swap(prover_instance_1->polynomials, prover_instance_2->polynomials);

    { // Verification based on pkey 1 should succeed
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(prover_instance_1->get_precomputed());
        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
        typename TestFixture::Prover prover(prover_instance_1, verification_key);
        typename TestFixture::Verifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool result = verifier.verify_proof(proof).result;
        EXPECT_TRUE(result);
    }

    { // Verification based on pkey 2 should fail
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(prover_instance_2->get_precomputed());
        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
        typename TestFixture::Prover prover(prover_instance_2, verification_key);
        typename TestFixture::Verifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool result = verifier.verify_proof(proof).result;
        EXPECT_FALSE(result);
    }
}

/**
 * @brief Test that the dyadic size correctly jumps to the next power of 2 when the trace would otherwise
 * place lagrange_last in the ZK masking region.
 * @details For MegaZK, the first NUM_MASKED_ROWS rows are overwritten with random values for zero-knowledge.
 * We incrementally add gates until the dyadic size doubles, verifying at each step that lagrange_last does not
 * overlap the masking area. At the tightest packing (right before the jump), we prove-and-verify.
 */
TYPED_TEST(MegaHonkTests, DyadicSizeJumpsToProtectMaskingArea)
{
    using Flavor = TypeParam;
    if constexpr (!Flavor::HasZK) {
        GTEST_SKIP() << "Masking area only exists for ZK flavors";
    } else {
        using Builder = typename Flavor::CircuitBuilder;
        using ProverInstance = ProverInstance_<Flavor>;

        // Determine the baseline dyadic size (with ECC ops + finalization overhead, no extra user gates)
        Builder baseline_builder;
        GoblinMockCircuits::construct_simple_circuit(baseline_builder);
        auto baseline_instance = std::make_shared<ProverInstance>(baseline_builder);
        const size_t baseline_dyadic = baseline_instance->dyadic_size();

        // The disabled head region is always present.
        // Verify active trace starts after it and dyadic size doubles when tightly packed.
        size_t prev_dyadic = 0;
        bool found_jump = false;
        for (size_t num_extra_gates = 0; num_extra_gates <= baseline_dyadic; num_extra_gates++) {
            Builder builder;
            GoblinMockCircuits::construct_simple_circuit(builder);
            if (num_extra_gates > 0) {
                MockCircuits::add_arithmetic_gates(builder, num_extra_gates);
            }
            auto prover_instance = std::make_shared<ProverInstance>(builder);

            const size_t dyadic_size = prover_instance->dyadic_size();
            const size_t final_active_idx = prover_instance->get_final_active_wire_idx();

            // Invariant: active trace doesn't overlap the disabled head region
            ASSERT_GE(final_active_idx, ProverInstance::TRACE_OFFSET)
                << "final_active_idx (" << final_active_idx << ") is within the disabled head region";

            if (prev_dyadic != 0 && dyadic_size > prev_dyadic) {
                EXPECT_EQ(dyadic_size, 2 * prev_dyadic);

                // Prove and verify at the tightest packing (right before the jump)
                Builder tight_builder;
                GoblinMockCircuits::construct_simple_circuit(tight_builder);
                MockCircuits::add_arithmetic_gates(tight_builder, num_extra_gates - 1);
                bool verified = this->construct_and_verify_honk_proof(tight_builder);
                EXPECT_TRUE(verified);

                found_jump = true;
                break;
            }

            prev_dyadic = dyadic_size;
        }

        EXPECT_TRUE(found_jump) << "should have found a dyadic size jump within " << baseline_dyadic << " extra gates";
    }
}

/**
 * @brief Verify that witness polynomials have masking values in the reserved head region.
 * @details Wires, z_perm, lookup, and databus inverse polynomials should have non-zero random values
 * at rows 1..NUM_MASKED_ROWS. ECC op wires and public databus columns are intentionally NOT masked.
 */
TYPED_TEST(MegaHonkTests, WitnessPolynomialsMasked)
{
    using Flavor = TypeParam;
    if constexpr (!Flavor::HasZK) {
        GTEST_SKIP() << "Masking only applies to ZK flavors";
    } else {
        using Builder = typename Flavor::CircuitBuilder;

        Builder builder;
        GoblinMockCircuits::construct_simple_circuit(builder);
        auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);

        auto check_masked = [](const auto& poly, const std::string& label) {
            bool has_masking = false;
            for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
                has_masking |= !poly[NUM_ZERO_ROWS + j].is_zero();
            }
            EXPECT_TRUE(has_masking) << label << " should be masked";
        };

        auto& polys = prover_instance->polynomials;
        check_masked(polys.w_l(), "w_l");
        check_masked(polys.w_r(), "w_r");
        check_masked(polys.w_o(), "w_o");
        check_masked(polys.w_4(), "w_4");
        check_masked(polys.z_perm(), "z_perm");
        if constexpr (Flavor::HasLogDerivLookup) {
            check_masked(polys.lookup_read_counts(), "lookup_read_counts");
            check_masked(polys.lookup_read_tags(), "lookup_read_tags");
            check_masked(polys.lookup_inverses(), "lookup_inverses");
        }
        if constexpr (Flavor::HasDataBus) {
            check_masked(polys.kernel_calldata_read_counts(), "kernel_calldata_read_counts");
            check_masked(polys.kernel_calldata_inverses(), "kernel_calldata_inverses");
            if constexpr (Flavor::NUM_BUS_COLUMNS >= 2) {
                check_masked(polys.first_app_calldata(), "first_app_calldata");
                check_masked(polys.first_app_calldata_read_counts(), "first_app_calldata_read_counts");
                check_masked(polys.first_app_calldata_inverses(), "first_app_calldata_inverses");
                check_masked(polys.second_app_calldata(), "second_app_calldata");
                check_masked(polys.second_app_calldata_read_counts(), "second_app_calldata_read_counts");
                check_masked(polys.second_app_calldata_inverses(), "second_app_calldata_inverses");
                check_masked(polys.third_app_calldata(), "third_app_calldata");
                check_masked(polys.third_app_calldata_read_counts(), "third_app_calldata_read_counts");
                check_masked(polys.third_app_calldata_inverses(), "third_app_calldata_inverses");
                check_masked(polys.return_data(), "return_data");
                check_masked(polys.return_data_read_counts(), "return_data_read_counts");
                check_masked(polys.return_data_inverses(), "return_data_inverses");
            }
        }
    }
}

/**
 * @brief Verify that REPEATED_COMMITMENTS indices correctly pair to-be-shifted and shifted commitments.
 * @details Mirrors the Shplemini vector construction: [Q, unshifted..., to_be_shifted...] with
 * offset = HasZK ? 2 : 1, then checks the same index pairs that remove_repeated_commitments asserts.
 */
TYPED_TEST(MegaHonkTests, RepeatedCommitmentsIndicesCorrect)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;
    using DefaultIO = stdlib::recursion::honk::DefaultIO<Builder>;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Commitment = typename Flavor::Commitment;

    auto builder = Builder{};
    DefaultIO::add_default(builder);
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    CommitmentKey ck(prover_instance->dyadic_size());

    auto unshifted = prover_instance->polynomials.get_unshifted();
    auto to_be_shifted = prover_instance->polynomials.get_to_be_shifted();

    constexpr auto repeated = Flavor::REPEATED_COMMITMENTS;
    ASSERT_EQ(to_be_shifted.size(), repeated.first.count);

    // Build the commitment vector exactly as Shplemini does: [Q, unshifted..., to_be_shifted...]
    std::vector<Commitment> commitments;
    commitments.push_back(Commitment::one()); // dummy Q
    for (auto& poly : unshifted) {
        commitments.push_back(ck.commit(poly));
    }
    for (auto& poly : to_be_shifted) {
        commitments.push_back(ck.commit(poly));
    }

    // Same offset logic as remove_repeated_commitments: leading commitments are Shplonk:Q (+1)
    // and the gemini_masking_poly commitment when the flavor commits to one (+1 more).
    constexpr size_t offset = flavor_has_gemini_masking<Flavor>() ? 2 : 1;
    for (size_t i = 0; i < repeated.first.count; i++) {
        EXPECT_EQ(commitments[repeated.first.original_start + offset + i],
                  commitments[repeated.first.duplicate_start + offset + i])
            << "REPEATED_COMMITMENTS commitment mismatch at index " << i;
    }
}

// =============================================================================
// MegaZkOffsetBoundaryTest
// Two-phase test isolating the offset-boundary relation's role in MegaZK:
//   1. Honest prover — confirms the baseline verifies.
//   2. Same setup, but `ecc_op_wire_1[2]` tampered to a non-zero value — confirms
//      sumcheck rejects. Row 2 is strictly in the offset area (rows
//      0..TRACE_OFFSET-1 = 0..3), where honest construction places zero.
// =============================================================================
TYPED_TEST(MegaHonkTests, MaliciousEccOpWireInOffsetAreaRejected)
{
    using Flavor = TypeParam;
    if constexpr (!std::is_same_v<Flavor, MegaZKFlavor>) {
        GTEST_SKIP() << "Offset-boundary relation applies only to MegaZKFlavor.";
    } else {
        using Builder = Flavor::CircuitBuilder;
        using FF = Flavor::FF;

        auto prove_and_verify = [](bool tamper) {
            Builder builder;
            GoblinMockCircuits::construct_simple_circuit(builder);

            auto prover_instance = std::make_shared<typename TestFixture::ProverInstance>(builder);
            if (tamper) {
                prover_instance->polynomials.ecc_op_wire_1().at(2) = FF(42);
            }
            auto verification_key =
                std::make_shared<typename TestFixture::VerificationKey>(prover_instance->get_precomputed());
            auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);

            typename TestFixture::Prover prover(prover_instance, verification_key);
            typename TestFixture::Verifier verifier(vk_and_hash);
            auto proof = prover.construct_proof();
            return verifier.verify_proof(proof).result;
        };

        // Phase 1: honest — baseline must pass.
        ASSERT_TRUE(prove_and_verify(/*tamper=*/false));

        // Phase 2: tamper — the boundary relation picks up the non-zero contribution.
        EXPECT_FALSE(prove_and_verify(/*tamper=*/true));
    }
}
