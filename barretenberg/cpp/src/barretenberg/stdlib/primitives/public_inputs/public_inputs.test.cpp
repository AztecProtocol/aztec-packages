
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "public_inputs.hpp"

using namespace bb;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

/**
 * @brief A test demonstrating the functionality set and reconstruct methods on a GolbinBigGroup object
 *
 */
// WORKTODO: rewrite this test or add another one that more clearly demonstrates how this works in practice. I.e. the
// first verifier circuit makes a PublicPoint and uses it to set the point (some commitment) to public. The
// public_point.key is then stored in the VK for this first circuit. The second circuit (a recursive verifier for the
// first) uses the public_point.key to instantiate a PublicPoint, then passes its public inputs to reconstruct() to
// recover the point.
TEST(PublicInputsTest, GoblinBigGroup)
{
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;
    using AffineElementNative = Curve::GroupNative::affine_element;
    using PublicPoint = stdlib::PublicInputComponent<G1>;

    Builder builder;

    // Construct a random stdlib point (e.g. representing a commitment received in the recursive verifier)
    G1 point = G1::from_witness(&builder, AffineElementNative::random_element());

    // Construct a public object from the point
    PublicPoint public_point;
    public_point.set(point);

    // Construct the public inputs as stdlib field elements (e.g. as a recursive verifier would do upon receiving them)
    std::vector<Fr> public_inputs;
    public_inputs.reserve(stdlib::public_inputs::NUM_FR_LIMBS_PER_POINT_BN254);
    for (const auto& idx : builder.public_inputs) {
        Fr limb = Fr::from_witness_index(&builder, idx);
        public_inputs.push_back(limb);
    }

    // Reconstruct the stdlib point from the limbs contained in public input
    G1 reconstructed_point = public_point.reconstruct(public_inputs);

    EXPECT_EQ(point.get_value(), reconstructed_point.get_value());
}
