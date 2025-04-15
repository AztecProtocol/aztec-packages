#pragma once

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"

namespace bb::avm2 {

/**
 * @brief Recursive verifier of AVM2 proofs that utilizes the Goblin mechanism for efficient EC operations.
 * @details Recursive verification for AVM2 proofs proceeds in two phases: (1) recursive verification of the AVM2 proof
 * in a Mega-arithmetized circuit C_M, and (2) recursive verification of the proof of C_M in an Ultra-arithmetized
 * circuit C_U. This results in a protocol that overall is more efficient than direct recursive verification of the AVM2
 * proof in an Ultra circuit.
 *
 * The proof of the Mega-arithmetized AVM2 recursive verifier circuit C_M is of the form {\pi_M, \pi_G}, where \pi_M is
 * a MegaHonk proof and \pi_G is a Goblin proof consisting of an ECCVM proof, a Translator proof, and a Merge proof.
 * \pi_M establishes proper verification of the AVM2 proof up to the deferred EC operations, whose correctness is in
 * turn established by \pi_G. Note: the ECCCVM proof (part of \pi_G) contains an IPA proof. Recursive verification of
 * this component will stop short of full verification, resulting in an IPA claim that must be accumulated with other
 * such claims before final verification later on (e.g. at the root). This is analogous to the aggregation of pairing
 * point inputs for proving systems that use KZG, such as Ultra/MegaHonk.
 *
 * The Ultra-arithmetized circuit C_U is responsible for recursive verification of {\pi_M, \pi_G}, i.e. it contains both
 * a Mega and a Goblin recursive verifier. The output of this recursive verification is a pairing check accumulator and
 * an IPA claim accumulator. To ensure proper transfer of the AVM2 verifier inputs {\pi, pub_inputs, VK}_{AVM2} between
 * the Mega and Ultra circuits, we utilize a hash consistency check. The representation of these inputs in C_M is hashed
 * and the result h_M is propagated via the public inputs (i.e. it will be contained in \pi_M.pub_inputs). Then, C_U
 * computes the hash h_U of its own representation of the same data and performs the check h_U = \pi_M.pub_inputs.h_M.
 *
 * @note The Mega circuit must be constrained to be a genuine AVM2 verifier circuit. This is done by fixing the VK(s)
 * corresponding to proofs {\pi_M, \pi_G} to be circuit constants in C_U.
 *
 */
class AvmGoblinRecursiveVerifier {
  public:
    using UltraBuilder = UltraCircuitBuilder;
    using MegaBuilder = MegaCircuitBuilder;

    using AggregationObject = bb::stdlib::recursion::aggregation_state<UltraBuilder>;
    using MegaAggregationObject = bb::stdlib::recursion::aggregation_state<MegaBuilder>;

    using UltraFF = stdlib::bn254<UltraBuilder>::ScalarField;

    // The structure of the final output of the goblinized AVM2 recursive verifier. The IPA data comes from recursive
    // verification of the ECCVM proof as part of Goblin recursive verification.
    struct RecursiveAvmGoblinOutput {
        std::vector<UltraFF> ipa_proof;
        OpeningClaim<stdlib::grumpkin<UltraBuilder>> ipa_claim;
        stdlib::recursion::aggregation_state<UltraBuilder> aggregation_object;
    };

    // Output of prover for inner Mega-arithmetized AVM recursive verifier circuit; input to the outer verifier
    struct InnerProverOutput {
        HonkProof mega_proof;                                 // \pi_M
        GoblinProof goblin_proof;                             // \pi_G
        std::shared_ptr<MegaFlavor::VerificationKey> mega_vk; // VK_M
        Goblin::VerificationKey goblin_vk;                    // VK_G
        size_t mega_hash_public_input_index;                  // Index of hash h_M in the Mega proof opub inputs
    };

    std::vector<UltraFF> outer_key_fields;

    UltraBuilder& ultra_builder;

    explicit AvmGoblinRecursiveVerifier(UltraBuilder& builder, const std::vector<UltraFF>& outer_key_fields)
        : outer_key_fields(outer_key_fields)
        , ultra_builder(builder)
    {}

    /**
     * @brief Recursively verify an AVM proof using Goblin and two layers of recursive verification.
     * @details First, construct an inner Mega-arithmetized AVM recursive verifier circuit and a corresponding proof
     * {\pi_M, \pi_G}. Then, construct an outer Ultra-arithmetized Mega/Goblin recursive verifier circuit.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @param input_agg_obj
     * @return RecursiveAvmGoblinOutput {ipa_proof, ipa_claim, aggregation_object}
     */
    RecursiveAvmGoblinOutput verify_proof(const StdlibProof<UltraBuilder>& stdlib_proof,
                                          const std::vector<std::vector<UltraFF>>& public_inputs,
                                          const AggregationObject& input_agg_obj) const
    {
        // Construct and prove the inner Mega-arithmetized AVM recursive verifier circuit; proof is {\pi_M, \pi_G}
        InnerProverOutput inner_output =
            construct_and_prove_inner_recursive_verification_circuit(stdlib_proof, public_inputs, input_agg_obj);

        // Construct the outer Ultra-arithmetized Mega/Goblin recursive verifier circuit
        RecursiveAvmGoblinOutput result =
            construct_outer_recursive_verification_circuit(stdlib_proof, public_inputs, input_agg_obj, inner_output);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the Mega + Goblin proofs
        return result;
    }

    /**
     * @brief Construct the outer circuit which recursively verifies a Mega proof and a Goblin proof.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @param input_agg_obj
     * @param inner_output Output of the prover of the inner circuit {\pi_M, \pi_G}, {VK_M, VK_G}
     * @return RecursiveAvmGoblinOutput
     */
    RecursiveAvmGoblinOutput construct_outer_recursive_verification_circuit(
        const StdlibProof<UltraBuilder>& stdlib_proof,
        const std::vector<std::vector<UltraFF>>& public_inputs,
        const AggregationObject& input_agg_obj,
        const InnerProverOutput& inner_output) const
    {
        // Types for MegaHonk and Goblin recursive verifiers arithmetized with Ultra
        using MegaRecursiveFlavor = MegaRecursiveFlavor_<UltraBuilder>;
        using MegaRecursiveVerificationKey = MegaRecursiveFlavor::VerificationKey;
        using MegaRecursiveVerifier = stdlib::recursion::honk::UltraRecursiveVerifier_<MegaRecursiveFlavor>;
        using GoblinRecursiveVerifier = stdlib::recursion::honk::GoblinRecursiveVerifier;
        using GoblinRecursiveVerifierOutput = stdlib::recursion::honk::GoblinRecursiveVerifierOutput;
        using FF = MegaRecursiveFlavor::FF;

        // Construct hash buffer containing the AVM proof, public inputs, and VK
        std::vector<FF> hash_buffer;
        hash_buffer.insert(hash_buffer.end(), stdlib_proof.begin(), stdlib_proof.end());
        for (const std::vector<FF>& input_vec : public_inputs) {
            hash_buffer.insert(hash_buffer.end(), input_vec.begin(), input_vec.end());
        }
        hash_buffer.insert(hash_buffer.end(), outer_key_fields.begin(), outer_key_fields.end());

        // Recursively verify the Mega proof \pi_M in the Ultra circuit
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1305): Mega + Goblin VKs must be circuit constants.
        auto mega_vk = std::make_shared<MegaRecursiveVerificationKey>(&ultra_builder, inner_output.mega_vk);
        MegaRecursiveVerifier mega_verifier(&ultra_builder, mega_vk);
        StdlibProof<UltraBuilder> mega_proof =
            bb::convert_native_proof_to_stdlib(&ultra_builder, inner_output.mega_proof);
        auto mega_verifier_output = mega_verifier.verify_proof(mega_proof, input_agg_obj);

        // Recursively verify the goblin proof\pi_G in the Ultra circuit
        GoblinRecursiveVerifier goblin_verifier{ &ultra_builder, inner_output.goblin_vk };
        GoblinRecursiveVerifierOutput goblin_verifier_output = goblin_verifier.verify(inner_output.goblin_proof);

        // Propagate the IPA claim via the public inputs of the outer circuit
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1306): Determine the right location/entity to
        // handle this IPA data propagation.

        // TODO(jeamon): Restore ipa_claim and ipa_proof integration in the builder. While running ./bootstrap.sh,
        // for the mock-protocol-circuits, we hit an assertion at circuit_builder_base_impl.hpp:262 ("added IPA claim
        // when one already exists")
        // ultra_builder.add_ipa_claim(goblin_verifier_output.opening_claim.get_witness_indices());
        // ultra_builder.ipa_proof = convert_stdlib_proof_to_native(goblin_verifier_output.ipa_transcript->proof_data);
        // ASSERT(ultra_builder.ipa_proof.size() && "IPA proof should not be empty");

        // Validate the consistency of the AVM2 verifier inputs {\pi, pub_inputs, VK}_{AVM2} between the inner (Mega)
        // circuit and the outer (Ultra) by asserting equality on the independently computed hashes of this data.
        const FF ultra_hash = stdlib::poseidon2<UltraBuilder>::hash(ultra_builder, hash_buffer);
        mega_proof[inner_output.mega_hash_public_input_index].assert_equal(ultra_hash);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the Mega + Goblin proofs
        return RecursiveAvmGoblinOutput{ .ipa_proof = goblin_verifier_output.ipa_transcript->proof_data,
                                         .ipa_claim = goblin_verifier_output.opening_claim,
                                         .aggregation_object = mega_verifier_output.agg_obj };
    }

    /**
     * @brief Construct and prove the inner Mega-arithmetized AVM recursive verifier circuit.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @param input_agg_obj
     * @return InnerCircuitOutput proof and verification key for Mega + Goblin; {\pi_M, \pi_G}, {VK_M, VK_G}
     */
    InnerProverOutput construct_and_prove_inner_recursive_verification_circuit(
        const StdlibProof<UltraBuilder>& stdlib_proof,
        const std::vector<std::vector<UltraFF>>& public_inputs,
        [[maybe_unused]] const AggregationObject& input_agg_obj) const
    {
        using AvmRecursiveFlavor = AvmRecursiveFlavor_<MegaBuilder>;
        using AvmRecursiveVerificationKey = AvmRecursiveFlavor::VerificationKey;
        using AvmRecursiveVerifier = AvmRecursiveVerifier_<AvmRecursiveFlavor>;
        using ECCVMVK = Goblin::ECCVMVerificationKey;
        using TranslatorVK = Goblin::TranslatorVerificationKey;
        using MegaProver = UltraProver_<MegaFlavor>;
        using MegaVerificationKey = MegaFlavor::VerificationKey;
        using FF = AvmRecursiveFlavor::FF;

        // Instantiate Mega builder for the inner circuit (AVM2 proof recursive verifier)
        Goblin goblin;
        MegaBuilder mega_builder(goblin.op_queue);

        // lambda to convert from Ultra to Mega stdlib field buffer and add all elements to respective hash buffers
        std::vector<FF> mega_hash_buffer;
        auto convert_stdlib_ultra_to_stdlib_mega = [&](const std::vector<UltraFF>& ultra_object) {
            std::vector<FF> mega_object;
            for (const UltraFF& ultra_element : ultra_object) {
                FF mega_element = FF::from_witness(&mega_builder, ultra_element.get_value());
                mega_object.emplace_back(mega_element);
                mega_hash_buffer.emplace_back(mega_element);
            }
            return mega_object;
        };

        // Convert the AVM proof, public inputs, and VK to stdlib Mega representations and add them to the hash buffer.
        std::vector<FF> mega_stdlib_proof = convert_stdlib_ultra_to_stdlib_mega(stdlib_proof);
        std::vector<std::vector<FF>> mega_public_inputs;
        mega_public_inputs.reserve(public_inputs.size());
        for (const std::vector<UltraFF>& input_vec : public_inputs) {
            mega_public_inputs.emplace_back(convert_stdlib_ultra_to_stdlib_mega(input_vec));
        }
        std::vector<FF> key_fields = convert_stdlib_ultra_to_stdlib_mega(outer_key_fields);

        // Compute the hash and set it public
        const FF mega_input_hash = stdlib::poseidon2<MegaBuilder>::hash(mega_builder, mega_hash_buffer);
        const size_t mega_hash_public_input_index = mega_builder.public_inputs.size();
        mega_input_hash.set_public(); // Add the hash result to the public inputs

        // Construct a Mega-arithmetized AVM2 recursive verifier circuit
        auto stdlib_key = std::make_shared<AvmRecursiveVerificationKey>(mega_builder, std::span<FF>(key_fields));
        AvmRecursiveVerifier recursive_verifier{ mega_builder, stdlib_key };
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1304): Do proper pairing point aggregation.
        auto default_agg_object = MegaAggregationObject::construct_default(mega_builder);
        [[maybe_unused]] auto mega_agg_output =
            recursive_verifier.verify_proof(mega_stdlib_proof, mega_public_inputs, default_agg_object);
        MegaAggregationObject::add_default_pairing_points_to_public_inputs(mega_builder);

        // Construct Mega proof \pi_M of the AVM recursive verifier circuit
        MegaProver mega_prover(mega_builder);
        HonkProof mega_proof = mega_prover.construct_proof();

        // Construct corresponding Goblin proof \pi_G (includes Merge, ECCVM, and Translator proofs)
        goblin.prove_merge(mega_builder);
        GoblinProof goblin_proof = goblin.prove();

        // Recursively verify the goblin proof in the Ultra circuit
        auto mega_vk = std::make_shared<MegaVerificationKey>(mega_prover.proving_key->proving_key);
        Goblin::VerificationKey goblin_vk{ std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() };

        return {
            .mega_proof = mega_proof,
            .goblin_proof = goblin_proof,
            .mega_vk = mega_vk,
            .goblin_vk = goblin_vk,
            .mega_hash_public_input_index = mega_hash_public_input_index,
        };
    }
};

} // namespace bb::avm2
