
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
    using FrNative = Curve::ScalarFieldNative;
    using PublicPoint = stdlib::PublicInputComponent<G1>;

    Builder builder;

    // Add some arbitrary public inputs
    builder.add_public_variable(FrNative::random_element());
    builder.add_public_variable(FrNative::random_element());

    // Construct a random stdlib point (e.g. representing a commitment received in the recursive verifier)
    G1 point = G1::from_witness(&builder, AffineElementNative::random_element());

    // Construct a public object from the point
    PublicPoint public_point;
    public_point.set(point); // Set the witness indices of the point to public

    // Add some more arbitrary public inputs
    builder.add_public_variable(FrNative::random_element());

    // Construct the public inputs as stdlib field elements (e.g. as a recursive verifier would do upon receiving them)
    std::vector<Fr> public_inputs;
    for (const auto& idx : builder.public_inputs) {
        Fr limb = Fr::from_witness_index(&builder, idx);
        public_inputs.push_back(limb);
    }

    // Construct a public point object from the public component key
    PublicPoint public_point_2(public_point.get_key());

    // Reconstruct the stdlib point from the limbs contained in public input
    G1 reconstructed_point = public_point_2.reconstruct(public_inputs);

    EXPECT_EQ(point.get_value(), reconstructed_point.get_value());
}
