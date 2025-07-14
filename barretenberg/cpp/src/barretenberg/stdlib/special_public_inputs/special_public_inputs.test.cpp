#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include <gtest/gtest.h>

namespace bb::stdlib::recursion::honk {

class SpecialPublicInputsTests : public testing::Test {
  public:
    static void SetUpTestSuite() {}
};

// Demonstrates the basic functionality of the KernelIO class for propagating public inputs between circuits
TEST_F(SpecialPublicInputsTests, Basic)
{
    using Builder = KernelIO::Builder;
    using Curve = KernelIO::Curve;
    using G1 = KernelIO::G1;
    using FF = KernelIO::FF;
    using PairingInputs = KernelIO::PairingInputs;

    using G1Native = typename Curve::GroupNative::affine_element;
    using FFNative = typename Curve::ScalarFieldNative;

    G1Native P0_val = G1Native::random_element();
    G1Native P1_val = G1Native::random_element();
    G1Native kernel_return_data_val = G1Native::random_element();
    G1Native app_return_data_val = G1Native::random_element();

    // Store the public inputs of the first circuit to be used by the second
    std::vector<FFNative> public_inputs;

    { // The first circuit propagates the kernel output via its public inputs
        Builder builder;

        KernelIO kernel_output;

        // Set the output values
        PairingInputs pairing_inputs{ G1::from_witness(&builder, P0_val), G1::from_witness(&builder, P1_val) };
        kernel_output.pairing_inputs = pairing_inputs;
        kernel_output.kernel_return_data = G1::from_witness(&builder, kernel_return_data_val);
        kernel_output.app_return_data = G1::from_witness(&builder, app_return_data_val);

        // Propagate the kernel output via the public inputs
        kernel_output.set_public();

        // Store the public inputs from this circuit for use in the second circuit
        for (const auto& idx : builder.public_inputs()) {
            public_inputs.push_back(builder.get_variable(idx));
        }
    }

    { // The second circuit reconstructs the kernel inputs from the public inputs
        Builder builder;

        // Construct the stdlib public inputs (e.g. as a recursive verifier would do upon receiving them in the proof)
        std::vector<FF> stdlib_public_inputs;
        stdlib_public_inputs.reserve(public_inputs.size());
        for (const auto& val : public_inputs) {
            stdlib_public_inputs.push_back(FF::from_witness(&builder, val));
        }

        KernelIO kernel_input;
        kernel_input.reconstruct_from_public(stdlib_public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(kernel_input.pairing_inputs.P0.get_value(), P0_val);
        EXPECT_EQ(kernel_input.pairing_inputs.P1.get_value(), P1_val);
        EXPECT_EQ(kernel_input.kernel_return_data.get_value(), kernel_return_data_val);
        EXPECT_EQ(kernel_input.app_return_data.get_value(), app_return_data_val);
    }
}

} // namespace bb::stdlib::recursion::honk
