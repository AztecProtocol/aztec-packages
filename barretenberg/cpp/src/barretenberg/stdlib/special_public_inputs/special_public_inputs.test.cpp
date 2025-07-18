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

    using G1Native = Curve::GroupNative::affine_element;
    using FFNative = Curve::ScalarFieldNative;

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

// Demonstrates the basic functionality of the DefaultIO class for reconstructing public inputs from native elements
TEST_F(SpecialPublicInputsTests, DefaultNative)
{
    using Builder = MegaCircuitBuilder;
    using IO = DefaultIO<Builder>;
    using IONative = IO::Native;

    using Curve = IO::Curve;
    using G1 = Curve::Group;
    using PairingInputs = IO::PairingInputs;

    using G1Native = Curve::GroupNative::affine_element;
    using FFNative = IONative::FF;

    G1Native P0_val = G1Native::random_element();
    G1Native P1_val = G1Native::random_element();

    // Store the public inputs of the circuit
    std::vector<FFNative> public_inputs;

    { // The circuit propagates the outputs via its public inputs
        Builder builder;

        IO io_output;

        // Set the output values
        PairingInputs pairing_inputs{ G1::from_witness(&builder, P0_val), G1::from_witness(&builder, P1_val) };
        io_output.pairing_inputs = pairing_inputs;

        // Propagate the kernel output via the public inputs
        io_output.set_public();

        // Store the public inputs from this circuit for use in the second circuit
        for (const auto& idx : builder.public_inputs()) {
            public_inputs.push_back(builder.get_variable(idx));
        }
    }

    {
        // Reconstruct the public inputs from native elements
        IONative io_input_native;
        io_input_native.reconstruct_from_public(public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(io_input_native.pairing_inputs.P0, P0_val);
        EXPECT_EQ(io_input_native.pairing_inputs.P1, P1_val);
    }
}

// Demonstrates the basic functionality of the RollUpIO class for reconstructing public inputs from native elements
TEST_F(SpecialPublicInputsTests, RollUpIONative)
{
    using Builder = RollupIO::Builder;
    using RollUpIONative = RollupIO::Native;

    using Curve = RollupIO::Curve;
    using ScalarFieldGrumpkin = Curve::BaseField;
    using G1 = Curve::Group;
    using G1Grumpkin = bb::stdlib::grumpkin<Builder>::Group;
    using PairingInputs = RollupIO::PairingInputs;
    using IpaClaim = RollupIO::IpaClaim;

    using G1Native = Curve::GroupNative::affine_element;
    using ScalarFieldBn254Native = RollUpIONative::FF;
    using GrumpkinNative = bb::curve::Grumpkin;
    using G1GrumpkinNative = GrumpkinNative::AffineElement;
    using ScalarFieldGrumpkinNative = GrumpkinNative::ScalarField;

    G1Native P0_val = G1Native::random_element();
    G1Native P1_val = G1Native::random_element();
    ScalarFieldGrumpkinNative challenge = ScalarFieldGrumpkinNative::random_element();
    ScalarFieldGrumpkinNative evaluation = ScalarFieldGrumpkinNative::random_element();
    G1GrumpkinNative commitment = G1GrumpkinNative::random_element();

    // Store the public inputs of the circuit
    std::vector<ScalarFieldBn254Native> public_inputs;

    { // The circuit propagates the outputs via its public inputs
        Builder builder;

        RollupIO rollup_io_output;

        // Set the output values
        PairingInputs pairing_inputs{ G1::from_witness(&builder, P0_val), G1::from_witness(&builder, P1_val) };
        IpaClaim ipa_claim{ { ScalarFieldGrumpkin::from_witness(&builder, challenge),
                              ScalarFieldGrumpkin::from_witness(&builder, evaluation) },
                            G1Grumpkin::from_witness(&builder, commitment) };
        rollup_io_output.pairing_inputs = pairing_inputs;
        rollup_io_output.ipa_claim = ipa_claim;

        // Propagate the kernel output via the public inputs
        rollup_io_output.set_public();

        // Store the public inputs from this circuit for use in the second circuit
        for (const auto& idx : builder.public_inputs()) {
            public_inputs.push_back(builder.get_variable(idx));
        }
    }

    {
        // Reconstruct the public inputs from native elements
        RollUpIONative rollup_io_input_native;
        rollup_io_input_native.reconstruct_from_public(public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(rollup_io_input_native.pairing_inputs.P0, P0_val);
        EXPECT_EQ(rollup_io_input_native.pairing_inputs.P1, P1_val);
        EXPECT_EQ(rollup_io_input_native.ipa_claim.opening_pair.challenge, challenge);
        EXPECT_EQ(rollup_io_input_native.ipa_claim.opening_pair.evaluation, evaluation);
        EXPECT_EQ(rollup_io_input_native.ipa_claim.commitment, commitment);
    }
}

} // namespace bb::stdlib::recursion::honk
