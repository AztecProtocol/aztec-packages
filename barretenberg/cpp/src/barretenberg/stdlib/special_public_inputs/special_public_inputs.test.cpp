#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
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

    static constexpr size_t NUM_WIRES = Builder::NUM_WIRES;

    G1Native P0_val = G1Native::random_element();
    G1Native P1_val = G1Native::random_element();
    G1Native kernel_return_data_val = G1Native::random_element();
    G1Native app_return_data_val = G1Native::random_element();
    std::array<G1Native, NUM_WIRES> ecc_op_tables_val;
    for (auto& commitment : ecc_op_tables_val) {
        commitment = G1Native::random_element();
    }
    FFNative output_pg_accum_hash_val = FFNative::random_element();

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
        for (auto [table_commitment, table_val] : zip_view(kernel_output.ecc_op_tables, ecc_op_tables_val)) {
            table_commitment = G1::from_witness(&builder, table_val);
        }
        kernel_output.output_pg_accum_hash = FF::from_witness(&builder, output_pg_accum_hash_val);

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
        for (auto [reconstructed_commitment, commitment] : zip_view(kernel_input.ecc_op_tables, ecc_op_tables_val)) {
            EXPECT_EQ(reconstructed_commitment.get_value(), commitment);
        }
        EXPECT_EQ(kernel_input.output_pg_accum_hash.get_value(), output_pg_accum_hash_val);
    }
}

// Demonstrates the basic functionality of the DefaultIO class
TEST_F(SpecialPublicInputsTests, Default)
{
    using Builder = MegaCircuitBuilder;
    using IO = DefaultIO<Builder>;
    using IONative = bb::DefaultIO;

    using Curve = IO::Curve;
    using FF = IO::Curve::ScalarField;
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

        // Propagate the output via the public inputs
        io_output.set_public();

        // Store the public inputs from this circuit for use in the second circuit
        for (const auto& idx : builder.public_inputs()) {
            public_inputs.push_back(builder.get_variable(idx));
        }
    }

    {
        // The second circuit reconstructs the inputs from the public inputs
        Builder builder;

        // Construct the stdlib public inputs (e.g. as a recursive verifier would do upon receiving them in the proof)
        std::vector<FF> stdlib_public_inputs;
        stdlib_public_inputs.reserve(public_inputs.size());
        for (const auto& val : public_inputs) {
            stdlib_public_inputs.push_back(FF::from_witness(&builder, val));
        }

        IO io_input;
        io_input.reconstruct_from_public(stdlib_public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(io_input.pairing_inputs.P0.get_value(), P0_val);
        EXPECT_EQ(io_input.pairing_inputs.P1.get_value(), P1_val);
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

// Demonstrates the basic functionality of the RollUpIO class
TEST_F(SpecialPublicInputsTests, RollUpIO)
{
    using Builder = RollupIO::Builder;
    using RollUpIONative = bb::RollupIO;

    using Curve = RollupIO::Curve;
    using ScalarFieldBn254 = RollupIO::FF;
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
    ScalarFieldGrumpkinNative challenge_val = ScalarFieldGrumpkinNative::random_element();
    ScalarFieldGrumpkinNative evaluation_val = ScalarFieldGrumpkinNative::random_element();
    G1GrumpkinNative commitment_val = G1GrumpkinNative::random_element();

    // Store the public inputs of the circuit
    std::vector<ScalarFieldBn254Native> public_inputs;

    { // The circuit propagates the outputs via its public inputs
        Builder builder;

        RollupIO rollup_io_output;

        // Set the output values
        PairingInputs pairing_inputs{ G1::from_witness(&builder, P0_val), G1::from_witness(&builder, P1_val) };
        IpaClaim ipa_claim{ { ScalarFieldGrumpkin::from_witness(&builder, challenge_val),
                              ScalarFieldGrumpkin::from_witness(&builder, evaluation_val) },
                            G1Grumpkin::from_witness(&builder, commitment_val) };
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
        // The second circuit reconstructs the inputs from the public inputs
        Builder builder;

        // Construct the stdlib public inputs (e.g. as a recursive verifier would do upon receiving them in the proof)
        std::vector<ScalarFieldBn254> stdlib_public_inputs;
        stdlib_public_inputs.reserve(public_inputs.size());
        for (const auto& val : public_inputs) {
            stdlib_public_inputs.push_back(ScalarFieldBn254::from_witness(&builder, val));
        }

        RollupIO rollup_io_input;
        rollup_io_input.reconstruct_from_public(stdlib_public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(rollup_io_input.pairing_inputs.P0.get_value(), P0_val);
        EXPECT_EQ(rollup_io_input.pairing_inputs.P1.get_value(), P1_val);
        EXPECT_EQ(rollup_io_input.ipa_claim.opening_pair.challenge.get_value(), static_cast<uint512_t>(challenge_val));
        EXPECT_EQ(rollup_io_input.ipa_claim.opening_pair.evaluation.get_value(),
                  static_cast<uint512_t>(evaluation_val));
        EXPECT_EQ(rollup_io_input.ipa_claim.commitment.get_value(), commitment_val);
    }

    {
        // Reconstruct the public inputs from native elements
        RollUpIONative rollup_io_input_native;
        rollup_io_input_native.reconstruct_from_public(public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(rollup_io_input_native.pairing_inputs.P0, P0_val);
        EXPECT_EQ(rollup_io_input_native.pairing_inputs.P1, P1_val);
        EXPECT_EQ(rollup_io_input_native.ipa_claim.opening_pair.challenge, challenge_val);
        EXPECT_EQ(rollup_io_input_native.ipa_claim.opening_pair.evaluation, evaluation_val);
        EXPECT_EQ(rollup_io_input_native.ipa_claim.commitment, commitment_val);
    }
}

// Demonstrates the basic functionality of the HidingKernelIO class for propagating public inputs between circuits
TEST_F(SpecialPublicInputsTests, HidingKernel)
{
    using Builder = MegaCircuitBuilder;

    // IO classes
    using HidingIO = HidingKernelIO<Builder>;
    using HidingIONative = bb::HidingKernelIO;

    // Recursive types
    using Curve = HidingIO::Curve;
    using G1 = HidingIO::G1;
    using FF = HidingIO::FF;
    using PairingInputs = HidingIO::PairingInputs;

    // Native types
    using G1Native = Curve::GroupNative::affine_element;
    using FFNative = Curve::ScalarFieldNative;

    static constexpr size_t NUM_WIRES = Builder::NUM_WIRES;

    G1Native P0_val = G1Native::random_element();
    G1Native P1_val = G1Native::random_element();
    std::array<G1Native, NUM_WIRES> ecc_op_tables_val;
    for (auto& commitment : ecc_op_tables_val) {
        commitment = G1Native::random_element();
    }

    // Store the public inputs of the first circuit to be used by the second
    std::vector<FFNative> public_inputs;

    { // The first circuit propagates the kernel output via its public inputs
        Builder builder;

        HidingIO hiding_output;

        // Set the output values
        PairingInputs pairing_inputs{ G1::from_witness(&builder, P0_val), G1::from_witness(&builder, P1_val) };
        hiding_output.pairing_inputs = pairing_inputs;

        for (auto [table_commitment, table_val] : zip_view(hiding_output.ecc_op_tables, ecc_op_tables_val)) {
            table_commitment = G1::from_witness(&builder, table_val);
        }

        // Propagate the kernel output via the public inputs
        hiding_output.set_public();

        // Store the public inputs from this circuit for use in the second circuit
        for (const auto& idx : builder.public_inputs()) {
            public_inputs.push_back(builder.get_variable(idx));
        }
    }

    {
        // The second circuit reconstructs the kernel inputs from the public inputs
        Builder builder;

        // Construct the stdlib public inputs (e.g. as a recursive verifier would do upon receiving them in the
        // proof)
        std::vector<FF> stdlib_public_inputs;
        stdlib_public_inputs.reserve(public_inputs.size());
        for (const auto& val : public_inputs) {
            stdlib_public_inputs.push_back(FF::from_witness(&builder, val));
        }

        HidingIO hiding_input;
        hiding_input.reconstruct_from_public(stdlib_public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(hiding_input.pairing_inputs.P0.get_value(), P0_val);
        EXPECT_EQ(hiding_input.pairing_inputs.P1.get_value(), P1_val);
        for (auto [reconstructed_commitment, commitment] : zip_view(hiding_input.ecc_op_tables, ecc_op_tables_val)) {
            EXPECT_EQ(reconstructed_commitment.get_value(), commitment);
        }
    }

    {
        // Reconstruct the public inputs from native elements
        HidingIONative hiding_input_native;
        hiding_input_native.reconstruct_from_public(public_inputs);

        // Ensure the reconstructed data matches the original values
        EXPECT_EQ(hiding_input_native.pairing_inputs.P0, P0_val);
        EXPECT_EQ(hiding_input_native.pairing_inputs.P1, P1_val);
        for (auto [reconstructed_commitment, commitment] :
             zip_view(hiding_input_native.ecc_op_tables, ecc_op_tables_val)) {
            EXPECT_EQ(reconstructed_commitment, commitment);
        }
    }
}

} // namespace bb::stdlib::recursion::honk
