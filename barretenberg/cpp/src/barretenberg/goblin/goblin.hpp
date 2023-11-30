#pragma once

#include "barretenberg/eccvm/eccvm_composer.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/translator_vm/goblin_translator_composer.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace barretenberg {

class Goblin {
  public:
    using PartialProof = bool;
    // // WORKTODO
    // struct PartialProof {
    //     proof_system::plonk::proof ultra_proof;
    //     proof_system::plonk::proof merge_proof;
    // };

    using Fr = barretenberg::fr;
    using Fq = barretenberg::fq;

    using Transcript = proof_system::honk::BaseTranscript<Fr>;
    using GoblinUltraComposer = proof_system::honk::GoblinUltraComposer;
    using GoblinUltraCircuitBuilder = proof_system::GoblinUltraCircuitBuilder;
    using OpQueue = proof_system::ECCOpQueue;
    using ECCVMFlavor = proof_system::honk::flavor::ECCVM;
    using ECCVMBuilder = proof_system::ECCVMCircuitBuilder<ECCVMFlavor>;
    using ECCVMComposer = proof_system::honk::ECCVMComposer;
    using TranslatorBuilder = proof_system::GoblinTranslatorCircuitBuilder;
    using TranslatorComposer = proof_system::honk::GoblinTranslatorComposer;
    using TranslatorConsistencyData = barretenberg::TranslationEvaluations;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();
    bool verified{ true };

    // GoblinUltraCircuitBuilder circuit_builder{op_queue};  // WORKTODO: need to remove reference-type data members

    /**
     * @brief
     *
     * @param circuit_builder
     */
    void accumulate(GoblinUltraCircuitBuilder& circuit_builder)
    {
        // Complete the "kernel" logic by recursively verifying previous merge proof
        // WORKTODO: auto merge_verifier = composer.create_merge_verifier(/*srs_size=*/10);
        // WORKTODO: verified = verified && merge_verifier.verify_proof(merge_proof);

        // Construct proof of the "kernel" circuit
        GoblinUltraComposer composer;
        auto instance = composer.create_instance(circuit_builder);
        auto prover = composer.create_prover(instance);
        auto honk_proof = prover.construct_proof();
        // WORKTODO: for now, do a native verification here for good measure.
        auto verifier = composer.create_verifier(instance);
        bool honk_verified = verifier.verify_proof(honk_proof);
        ASSERT(honk_verified);

        // Construct and verify op queue merge proof
        auto merge_prover = composer.create_merge_prover(op_queue);
        auto merge_proof = merge_prover.construct_proof();
        // WORKTODO: for now, do a native verification here for good measure.
        auto merge_verifier = composer.create_merge_verifier(/*srs_size=*/10);
        bool merge_verified = merge_verifier.verify_proof(merge_proof);
        ASSERT(merge_verified);

        // WORKTODO: reset the circuit builder? Is this better than just creating a new one?
        // circuit_builder = GoblinUltraCircuitBuilder(); // WORKTODO: need to remove reference-type data members

        // WORKTODO: this needs to return a proof and a verification key for use by the next circuit. Make a struct for
        // this?
    };

    PartialProof prove()
    {
        // Execute the ECCVM
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/785) Properly initialize transcript
        auto eccvm_builder = ECCVMBuilder(op_queue);
        auto eccvm_composer = ECCVMComposer();
        auto eccvm_prover = eccvm_composer.create_prover(eccvm_builder);
        auto eccvm_verifier = eccvm_composer.create_verifier(eccvm_builder);
        auto eccvm_proof = eccvm_prover.construct_proof();
        bool eccvm_verified = eccvm_verifier.verify_proof(eccvm_proof);

        // Execute the Translator
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/786) Properly derive batching_challenge
        auto batching_challenge = Fq::random_element();
        auto evaluation_input = eccvm_prover.evaluation_challenge_x;
        auto translator_builder = TranslatorBuilder(batching_challenge, evaluation_input, op_queue);
        auto translator_composer = TranslatorComposer();
        auto translator_prover = translator_composer.create_prover(translator_builder);
        auto translator_verifier = translator_composer.create_verifier(translator_builder);
        auto translator_proof = translator_prover.construct_proof();
        bool accumulator_construction_verified = translator_verifier.verify_proof(translator_proof);
        bool translation_verified = translator_verifier.verify_translation(eccvm_prover.translation_evaluations);

        return eccvm_verified && accumulator_construction_verified && translation_verified;
    };
};
} // namespace barretenberg