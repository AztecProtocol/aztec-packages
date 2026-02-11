#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include <gtest/gtest.h>

namespace bb::stdlib::recursion {

template <typename Builder> class PairingPointsTests : public testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Create N distinct valid pairing points as circuit witnesses from SRS points.
     * @details The pairing check verifies e(P0, [1]_2) * e(P1, [x]_2) == 1. Using SRS points srs[i] = [x^i]_1,
     * the pair (srs[i], -srs[i-1]) satisfies this. Each element uses a different SRS index for distinctness.
     */
    template <typename Curve>
    static std::vector<PairingPoints<Curve>> create_valid_pairing_points(typename Curve::Builder* builder, size_t count)
    {
        using Group = typename Curve::Group;

        bb::CommitmentKey<curve::BN254> ck(count + 1);
        auto srs = ck.get_monomial_points();

        std::vector<PairingPoints<Curve>> result;
        result.reserve(count);
        for (size_t i = 1; i <= count; i++) {
            result.emplace_back(Group::from_witness(builder, srs[i]), Group::from_witness(builder, -srs[i - 1]));
        }
        return result;
    }
};

using Curves = testing::Types<stdlib::bn254<UltraCircuitBuilder>, stdlib::bn254<MegaCircuitBuilder>>;
TYPED_TEST_SUITE(PairingPointsTests, Curves);

TYPED_TEST(PairingPointsTests, EmptyPairingPointsProtection)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PP = PairingPoints<Curve>;

    Builder builder;
    auto pps = TestFixture::template create_valid_pairing_points<Curve>(&builder, 1);

    PP empty;
    EXPECT_THROW_WITH_MESSAGE(pps[0].aggregate(empty), "Cannot aggregate null pairing points.");
    EXPECT_THROW_WITH_MESSAGE(empty.set_public(), "Calling set_public on empty pairing points.");
    EXPECT_THROW_WITH_MESSAGE(empty.check(), "Calling check on empty pairing points.");
}

TYPED_TEST(PairingPointsTests, ConstructDefault)
{
    using Builder = typename TypeParam::Builder;
    static constexpr size_t NUM_GATES_ADDED = 8;

    Builder builder;

    size_t num_gates = builder.num_gates();
    PairingPoints<TypeParam>::set_default_to_public(&builder);
    EXPECT_EQ(NUM_GATES_ADDED, builder.num_gates() - num_gates)
        << "There has been a change in the number of gates required to set default PairingPoints as public inputs.";

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(PairingPointsTests, DefaultPointsAreValid)
{
    using Builder = TypeParam::Builder;
    using PP = PairingPoints<TypeParam>;

    Builder builder;

    auto pp = PP::construct_default();
    pp.P0().convert_constant_to_fixed_witness(&builder);
    pp.P1().convert_constant_to_fixed_witness(&builder);
    pp.set_public();
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Validate default PairingPoints via native pairing check
    bb::PairingPoints<curve::BN254> native_pp(pp.P0().get_value(), pp.P1().get_value());
    EXPECT_TRUE(native_pp.check()) << "Default PairingPoints are not valid pairing points.";
}

TYPED_TEST(PairingPointsTests, Aggregate)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using Group = typename Curve::Group;
    using Fr = typename Curve::ScalarField;

    Builder builder;
    auto pps = TestFixture::template create_valid_pairing_points<Curve>(&builder, 2);

    // Save the original values before aggregation mutates pps[0]
    auto orig_P0 = pps[0].P0();
    auto orig_P1 = pps[0].P1();

    pps[0].aggregate(pps[1]);

    // Replicate the transcript to derive the same separator
    bb::StdlibTranscript<Builder> transcript{};
    transcript.add_to_hash_buffer("Accumulator_P0", orig_P0);
    transcript.add_to_hash_buffer("Accumulator_P1", orig_P1);
    transcript.add_to_hash_buffer("Aggregated_P0", pps[1].P0());
    transcript.add_to_hash_buffer("Aggregated_P1", pps[1].P1());
    auto r = transcript.template get_challenge<Fr>("recursion_separator");

    // Expected: orig + r * other
    Group expected_P0 = orig_P0 + pps[1].P0() * r;
    Group expected_P1 = orig_P1 + pps[1].P1() * r;

    EXPECT_EQ(pps[0].P0().get_value(), expected_P0.get_value());
    EXPECT_EQ(pps[0].P1().get_value(), expected_P1.get_value());

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(PairingPointsTests, AggregateIntoEmpty)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PP = PairingPoints<Curve>;

    Builder builder;
    auto pps = TestFixture::template create_valid_pairing_points<Curve>(&builder, 1);

    // Default-constructed PairingPoints has no data
    PP empty;
    EXPECT_FALSE(empty.is_populated());

    // Aggregating into empty should just copy the other
    empty.aggregate(pps[0]);
    EXPECT_TRUE(empty.is_populated());
    EXPECT_EQ(empty.P0().get_value(), pps[0].P0().get_value());
    EXPECT_EQ(empty.P1().get_value(), pps[0].P1().get_value());
}

TYPED_TEST(PairingPointsTests, AggregateMultiple)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PP = PairingPoints<Curve>;
    using Group = typename Curve::Group;
    using Fr = typename Curve::ScalarField;

    Builder builder;
    auto pps = TestFixture::template create_valid_pairing_points<Curve>(&builder, 3);

    // Replicate the transcript to derive the same challenges
    bb::StdlibTranscript<Builder> transcript{};
    for (size_t idx = 0; idx < 3; ++idx) {
        transcript.add_to_hash_buffer("first_component_" + std::to_string(idx), pps[idx].P0());
        transcript.add_to_hash_buffer("second_component_" + std::to_string(idx), pps[idx].P1());
    }
    std::vector<std::string> labels = { "pp_aggregation_challenge_1", "pp_aggregation_challenge_2" };
    auto challenges = transcript.template get_challenges<Fr>(labels);

    // Expected: P₀ + r₁·P₁ + r₂·P₂
    Group expected_P0 = pps[0].P0() + pps[1].P0() * challenges[0] + pps[2].P0() * challenges[1];
    Group expected_P1 = pps[0].P1() + pps[1].P1() * challenges[0] + pps[2].P1() * challenges[1];

    std::vector<PP> pp_vec = { pps[0], pps[1], pps[2] };
    PP aggregated = PP::aggregate_multiple(pp_vec);

    EXPECT_EQ(aggregated.P0().get_value(), expected_P0.get_value());
    EXPECT_EQ(aggregated.P1().get_value(), expected_P1.get_value());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(PairingPointsTests, PublicInputSerdeRoundTrip)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PP = PairingPoints<Curve>;
    using Fr = Curve::ScalarField;
    using PublicPP = stdlib::PublicInputComponent<PP>;

    Builder builder;

    // Create witness pairing points from known defaults
    PP original = PP::construct_default();
    original.P0().convert_constant_to_fixed_witness(&builder);
    original.P1().convert_constant_to_fixed_witness(&builder);
    EXPECT_TRUE(original.is_populated());

    // Serialize to public inputs
    uint32_t start_idx = original.set_public();

    // Extract the public inputs as field_t elements
    std::vector<Fr> public_inputs;
    for (uint32_t var_idx : builder.public_inputs()) {
        public_inputs.emplace_back(Fr::from_witness_index(&builder, var_idx));
    }

    // Reconstruct via PublicInputComponent (exercises reconstruct_from_public)
    PP reconstructed = PublicPP::reconstruct(public_inputs, PublicComponentKey{ start_idx });
    EXPECT_TRUE(reconstructed.is_populated());

    // Verify the round-tripped values match
    EXPECT_EQ(reconstructed.P0().get_value(), original.P0().get_value());
    EXPECT_EQ(reconstructed.P1().get_value(), original.P1().get_value());

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(PairingPointsTests, SrsBasedPairingPointsAreValid)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;

    Builder builder;
    auto pps = TestFixture::template create_valid_pairing_points<Curve>(&builder, 3);

    for (auto& pp : pps) {
        EXPECT_TRUE(pp.is_populated());
        EXPECT_TRUE(pp.check());
    }

    // Verify the points are actually distinct
    EXPECT_NE(pps[0].P0().get_value(), pps[1].P0().get_value());
    EXPECT_NE(pps[1].P0().get_value(), pps[2].P0().get_value());

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// =============================================================================
// Tagging mechanism tests (tag tracking, merge, ProverInstance enforcement)
// =============================================================================

template <typename Builder> class PairingPointsTaggingTests : public testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(PairingPointsTaggingTests, Curves);

TYPED_TEST(PairingPointsTaggingTests, TagCreationAndMerge)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;
    using Fr = PairingPoints::Fr;
    using NativeFr = typename Curve::ScalarFieldNative;

    Builder builder;

    Fr scalar_one = Fr::from_witness(&builder, NativeFr::random_element());
    Fr scalar_two = Fr::from_witness(&builder, NativeFr::random_element());
    Group P0 = Group::batch_mul({ Group::one(&builder) }, { scalar_one });
    Group P1 = Group::batch_mul({ Group::one(&builder) }, { scalar_two });

    // Check that no pairing points exist
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    PairingPoints pp_one = { P0, P1 };
    PairingPoints pp_two = { P0, P1 };

    // Check the tags
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_one.tag_index), 0U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 1U);

    // Check that there are two different pairing points in the builder
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Merge the tags
    pp_one.aggregate(pp_two);

    // Check that the tags have been merged
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 0U);
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Create two new pairing points and aggregate with aggregate_multiple
    PairingPoints pp_three = { P0, P1 };
    PairingPoints pp_four = { P0, P1 };

    // Check the tags
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_three.tag_index), 2U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_four.tag_index), 3U);

    // Check that there are two different pairing points in the builder
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Merge the tags
    std::vector<PairingPoints> pp_to_be_aggregated = { pp_one, pp_three, pp_four };
    PairingPoints aggregated_pp = PairingPoints::aggregate_multiple(pp_to_be_aggregated);

    // Check that the tags have been merged
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_one.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_three.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_four.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(aggregated_pp.tag_index), 4U);
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());
}

TYPED_TEST(PairingPointsTaggingTests, ProverInstanceRejectsUnmergedTags)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;
    using Fr = PairingPoints::Fr;
    using NativeFr = typename Curve::ScalarFieldNative;
    using Flavor = std::conditional_t<IsMegaBuilder<Builder>, MegaFlavor, UltraFlavor>;
    using ProverInstance = ProverInstance_<Flavor>;

    Builder builder;

    Fr scalar_one = Fr::from_witness(&builder, NativeFr::random_element());
    Fr scalar_two = Fr::from_witness(&builder, NativeFr::random_element());
    Group P0 = Group::batch_mul({ Group::one(&builder) }, { scalar_one });
    Group P1 = Group::batch_mul({ Group::one(&builder) }, { scalar_two });

    PairingPoints pp_one = { P0, P1 };
    PairingPoints pp_two = { P0, P1 };
    PairingPoints pp_three = { P0, P1 };

    // Check the tags
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_one.tag_index), 0U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 1U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_three.tag_index), 2U);

    // Check that there are different pairing points in the builder
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Merge the tags
    pp_one.aggregate(pp_two);

    // Check that the tags have not been merged
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Create a ProverInstance, expect failure because pairing points have not been aggregated
    EXPECT_THROW_WITH_MESSAGE(
        ProverInstance prover_instance(builder),
        "Pairing points must all be aggregated together. Either no pairing points should be created, or "
        "all created pairing points must be aggregated into a single pairing point. Found 2 different "
        "pairing points");

    // Aggregate pairing points
    pp_one.aggregate(pp_three);

    // Create a ProverInstance, expect failure because pairing points have not been set to public
    EXPECT_THROW_WITH_MESSAGE(
        ProverInstance prover_instance(builder),
        "Pairing points must be set to public in the circuit before constructing the ProverInstance.");

    stdlib::recursion::honk::DefaultIO<Builder> inputs;
    inputs.pairing_inputs = pp_one;
    inputs.set_public();

    // Construct Prover instance successfully
    ProverInstance prover_instance(builder);
}

TYPED_TEST(PairingPointsTaggingTests, CopyPreservesTag)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;

    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;
    using Fr = Curve::ScalarField;
    using NativeFr = Curve::ScalarFieldNative;

    Builder builder;

    Fr scalar_one = Fr::from_witness(&builder, NativeFr::random_element());
    Fr scalar_two = Fr::from_witness(&builder, NativeFr::random_element());
    Group P0 = Group::batch_mul({ Group::one(&builder) }, { scalar_one });
    Group P1 = Group::batch_mul({ Group::one(&builder) }, { scalar_two });

    PairingPoints pp_original = { P0, P1 };
    PairingPoints pp_copy(pp_original);

    // Check that there is only one tag
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Check that the tags are the same
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_original.tag_index),
                 builder.pairing_points_tagging.get_tag(pp_copy.tag_index));
}

} // namespace bb::stdlib::recursion
