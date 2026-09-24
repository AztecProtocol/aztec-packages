#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/group/forgery_test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/ultra_honk/ultra_honk.test.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {

using Builder = UltraCircuitBuilder;
using cycle_group_ct = stdlib::cycle_group<Builder>;
using cycle_scalar_ct = cycle_group_ct::cycle_scalar;
using AffineElement = cycle_group_ct::AffineElement;
using Element = cycle_group_ct::Element;
using Group = cycle_group_ct::Group;
using ScalarField = cycle_group_ct::Curve::ScalarField;

struct MsmTerm {
    AffineElement point;
    ScalarField scalar;
    bool witness_scalar;
};

struct CollidingMsm {
    std::string name;
    std::vector<MsmTerm> terms;
    // Loop and merge collisions are on the honest witness's own path, so the checked circuit rejects it too.
    bool honest_proof_verifies;
};

std::vector<CollidingMsm> colliding_msms()
{
    using plookup::fixed_base::table;
    using stdlib::test_utils::variable_base_offset;

    const auto offsets = cycle_group_ct::OffsetGenerators::default_generators().get(2);
    const Element variable_offset = variable_base_offset<Builder>(offsets, 1);
    const AffineElement generator = Group::affine_one;
    const AffineElement other_point(Element::random_element(&numeric::get_debug_randomness()));
    const Element fixed_offset = Element(table::get_generator_offset_for_table_id(plookup::FIXED_BASE_LEFT_LO)) +
                                 Element(table::get_generator_offset_for_table_id(plookup::FIXED_BASE_LEFT_HI));

    return {
        // P = G0 - G1 and top scalar slice 1 make the first Straus addition G0 + G0.
        { "straus_loop",
          { { AffineElement(Element(offsets[0]) - Element(offsets[1])), ScalarField(uint256_t(1) << 252), true },
            { generator, ScalarField(7), false } },
          false },
        // P = O - D and scalar 1 make the variable-base accumulator equal the fixed-base accumulator O.
        { "fixed_base_merge",
          { { table::lhs_generator_point(), ScalarField(0), true },
            { AffineElement(fixed_offset - variable_offset), ScalarField(1), true },
            { generator, ScalarField(7), false } },
          false },
        // C = P + 2D makes the offset removal add P + D to itself.
        { "offset_removal",
          { { other_point, ScalarField(1), true },
            { AffineElement(Element(other_point) + variable_offset.dbl()), ScalarField(1), false } },
          true },
        // The same with the generator as P: a trusted base does not make the constant term trusted.
        { "offset_removal_trusted_base",
          { { generator, ScalarField(1), true },
            { AffineElement(Element(generator) + variable_offset.dbl()), ScalarField(1), false } },
          true },
    };
}

} // namespace

template <typename Flavor> class CycleGroupMsmSoundnessTest : public UltraHonkTests<Flavor> {};

using FlavorTypes = ::testing::Types<UltraFlavor, UltraZKFlavor>;
TYPED_TEST_SUITE(CycleGroupMsmSoundnessTest, FlavorTypes);

// Public scalar limbs bind the claimed output to a specific MSM, not merely to the existence of some scalars.
TYPED_TEST(CycleGroupMsmSoundnessTest, WrongMsmOutputIsRejectedByHonestVk)
{
    using Flavor = TypeParam;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    for (const auto& [name, terms, honest_proof_verifies] : colliding_msms()) {
        SCOPED_TRACE(name);
        auto builder = stdlib::test_utils::make_forgeable_builder<Builder>();

        std::vector<cycle_group_ct> points;
        std::vector<cycle_scalar_ct> scalars;
        Element expected_element = Group::point_at_infinity;
        for (const auto& term : terms) {
            points.emplace_back(term.point);
            scalars.push_back(term.witness_scalar ? cycle_scalar_ct::from_witness(&builder, term.scalar)
                                                  : cycle_scalar_ct(term.scalar));
            expected_element += Element(term.point) * term.scalar;
        }
        const AffineElement expected(expected_element);
        std::vector<std::pair<uint32_t, bb::fr>> public_scalar_limbs;
        for (const auto& scalar : scalars) {
            if (!scalar.is_constant()) {
                public_scalar_limbs.emplace_back(scalar.lo().set_public(), scalar.lo().get_value());
                public_scalar_limbs.emplace_back(scalar.hi().set_public(), scalar.hi().get_value());
            }
        }
        cycle_group_ct result = cycle_group_ct::batch_mul(points, scalars);
        ASSERT_EQ(result.get_value(), expected);
        const uint32_t output_x = result.set_public();
        const uint32_t output_y = output_x + 1;
        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

        Builder honest_builder = builder;
        EXPECT_EQ(CircuitChecker::check(builder), honest_proof_verifies);
        auto honest_instance = std::make_shared<ProverInstance>(honest_builder);
        auto honest_vk = std::make_shared<VerificationKey>(honest_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(honest_vk);

        typename TestFixture::Prover honest_prover(honest_instance, honest_vk);
        typename TestFixture::Verifier honest_verifier(vk_and_hash);
        EXPECT_EQ(honest_verifier.verify_proof(honest_prover.construct_proof()).result, honest_proof_verifies);

        auto public_output = [&]() {
            return AffineElement(builder.get_variable(builder.public_inputs()[output_x]),
                                 builder.get_variable(builder.public_inputs()[output_y]));
        };
        stdlib::test_utils::forge_degenerate_ecc_add(builder);
        // Complete offset subtraction can prevent the elliptic-only replay from reaching the public output.
        if (public_output() == expected) {
            const AffineElement wrong(Element::random_element(&numeric::get_debug_randomness()));
            builder.set_variable(builder.public_inputs()[output_x], wrong.x);
            builder.set_variable(builder.public_inputs()[output_y], wrong.y);
        }
        const AffineElement claimed = public_output();
        ASSERT_NE(claimed, expected);

        auto forged_instance = std::make_shared<ProverInstance>(builder);
        EXPECT_EQ(*std::make_shared<VerificationKey>(forged_instance->get_precomputed()), *honest_vk);
        typename TestFixture::Prover prover(forged_instance, honest_vk);
        const auto proof = prover.construct_proof();
        EXPECT_EQ(proof[output_x], claimed.x);
        EXPECT_EQ(proof[output_y], claimed.y);
        for (const auto& [index, value] : public_scalar_limbs) {
            EXPECT_EQ(proof[index], value);
        }

        typename TestFixture::Verifier verifier(vk_and_hash);
        EXPECT_FALSE(verifier.verify_proof(proof).result) << "honest VK accepted a wrong MSM output";
    }
}
