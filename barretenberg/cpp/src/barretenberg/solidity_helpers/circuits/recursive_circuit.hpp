#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {
class RecursiveCircuit {
  public:
    using InnerFlavor = bb::UltraFlavor;
    using InnerProver = bb::UltraProver_<InnerFlavor>;
    using InnerVerifier = bb::UltraVerifier_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProverInstance = bb::ProverInstance_<InnerFlavor>;
    using InnerCommitment = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerIO = bb::stdlib::recursion::honk::DefaultIO<InnerBuilder>;
    using NativeIO = DefaultIO;

    using RecursiveFlavor = bb::UltraRecursiveFlavor_<bb::UltraCircuitBuilder>;
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;

    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor>;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;
    using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<OuterBuilder>;
    using OuterIO = bb::stdlib::recursion::honk::DefaultIO<OuterBuilder>;

    using field_ct = bb::stdlib::field_t<OuterBuilder>;
    using public_witness_ct = bb::stdlib::public_witness_t<OuterBuilder>;
    using StdlibProof = bb::stdlib::Proof<OuterBuilder>;

    /**
     * @brief Create a inner circuit object. In this case an extremely simple circuit that just adds two numbers.
     *
     * @param inputs
     * @return InnerBuilder
     */
    static InnerBuilder create_inner_circuit(uint256_t inputs[])
    {
        InnerBuilder builder;

        field_ct a(public_witness_ct(&builder, inputs[0]));
        field_ct b(public_witness_ct(&builder, inputs[1]));
        field_ct c(public_witness_ct(&builder, inputs[2]));

        c.assert_equal(a + b);

        InnerIO::add_default(builder);

        return builder;
    }

    /**
     * @brief Generate a recursive circuit.
     *
     * Wraps the simple inner circuit in a recursive verifier - this returns the builder to be proven by the caller
     *
     * @param inputs
     * @return OuterBuilder
     */
    static OuterBuilder generate(uint256_t inputs[])
    {
        // Create the initial inner circuit - it is just a simple multiplication gate!
        auto inner_circuit = create_inner_circuit(inputs);

        // Create the outer recursive verifier circuit
        OuterBuilder outer_circuit;

        auto inner_prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
        auto inner_verification_key =
            std::make_shared<typename InnerFlavor::VerificationKey>(inner_prover_instance->get_precomputed());
        InnerProver inner_prover(inner_prover_instance, inner_verification_key);
        auto inner_proof = inner_prover.construct_proof();

        auto stdlib_vk_and_hash =
            std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, inner_verification_key);

        // Instantiate the recursive verifier using the native verification key
        RecursiveVerifier verifier{ &outer_circuit, stdlib_vk_and_hash };
        verifier.transcript->enable_manifest();

        InnerVerifier native_verifier(inner_verification_key);
        native_verifier.transcript->enable_manifest();
        auto native_result = native_verifier.template verify_proof<NativeIO>(inner_proof);
        if (!native_result) {
            throw std::runtime_error("Inner proof verification failed");
        }

        StdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
        VerifierOutput output = verifier.template verify_proof<OuterIO>(stdlib_inner_proof);
        output.points_accumulator.set_public();

        return outer_circuit;
    }
};
} // namespace bb
