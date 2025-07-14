
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "public_input_component.hpp"

using namespace bb;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

/**
 * @brief A test demonstrating the functionality set and reconstruct methods on a GolbinBigGroup object
 *
 */
TEST(PublicInputsTest, GoblinBigGroup)
{
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;
    using AffineElementNative = Curve::GroupNative::affine_element;
    using FrNative = Curve::ScalarFieldNative;
    using PublicPoint = stdlib::PublicInputComponent<G1>;

    AffineElementNative point_value = AffineElementNative::random_element();

    // The data needed by the second circuit to reconstruct the public point
    std::vector<FrNative> public_inputs;
    PublicPoint::Key public_point_key;

    // The first circuit propagates a point via its public inputs
    {
        Builder builder;

        // Add some arbitrary public inputs for good measure
        builder.add_public_variable(FrNative::random_element());
        builder.add_public_variable(FrNative::random_element());

        // Construct a stdlib point (e.g. representing a commitment received in the recursive verifier)
        G1 point = G1::from_witness(&builder, point_value);

        // Construct a public object from the point; store the key used to reconstruct it from the public inputs
        public_point_key = PublicPoint::set(point);

        // Add some more arbitrary public inputs
        builder.add_public_variable(FrNative::random_element());

        // Store the public inputs from the builder
        for (const auto& idx : builder.public_inputs()) {
            public_inputs.push_back(builder.get_variable(idx));
        }
    }

    // The second circuit reconstructs the public point from the public inputs and the public component key
    {
        Builder builder;

        // Construct the stdlib public inputs (e.g. as a recursive verifier would do upon receiving them in the proof)
        std::vector<Fr> stdlib_public_inputs;
        stdlib_public_inputs.reserve(public_inputs.size());
        for (const auto& val : public_inputs) {
            stdlib_public_inputs.push_back(Fr::from_witness(&builder, val));
        }

        // Reconstruct the stdlib point from the public inputs and the public component key
        G1 reconstructed_point = PublicPoint::reconstruct(stdlib_public_inputs, public_point_key);

        // Ensure the reconstructed point matches the original point
        EXPECT_EQ(point_value, reconstructed_point.get_value());
    }
}
