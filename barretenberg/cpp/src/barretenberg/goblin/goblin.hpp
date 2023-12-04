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
    using Proof = proof_system::plonk::proof;

    /**
     * @brief Output of goblin::accumulate; an Ultra proof and the corresponding verification key
     *
     */
    struct AccumulationOutput {
        using NativeVerificationKey = proof_system::honk::flavor::GoblinUltra::VerificationKey;
        Proof proof;
        std::shared_ptr<NativeVerificationKey> verification_key;
    };

    /**
     * @brief A full goblin proof
     *
     */
    struct GoblinProof {
        Proof ultra_proof;
        Proof merge_proof;
        Proof eccvm_proof;
        Proof translator_proof;
    };

    using Fr = barretenberg::fr;
    using Fq = barretenberg::fq;

    using Transcript = proof_system::honk::BaseTranscript;
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

  private:
    GoblinProof proof;

  public:
    /**
     * @brief
     *
     * @param circuit_builder
     */
    AccumulationOutput accumulate(GoblinUltraCircuitBuilder& circuit_builder)
    {
        // Complete the "kernel" logic by recursively verifying previous merge proof
        // WORKTODO: auto merge_verifier = composer.create_merge_verifier(/*srs_size=*/10);
        // WORKTODO: verified = verified && merge_verifier.verify_proof(merge_proof);

        // Construct proof of the "kernel" circuit
        info("Goblin: Constructing proof of circuit.");
        GoblinUltraComposer composer;
        auto instance = composer.create_instance(circuit_builder);
        auto prover = composer.create_prover(instance);
        proof.ultra_proof = prover.construct_proof();

        // Construct and verify op queue merge proof
        info("Goblin: Constructing merge proof.");
        auto merge_prover = composer.create_merge_prover(op_queue);
        proof.merge_proof = merge_prover.construct_proof();

        { // DEBUG only: Native verification of kernel proof and merge proof
            info("Goblin: Natively verifying circuit proof.");
            auto verifier = composer.create_verifier(instance);
            bool honk_verified = verifier.verify_proof(proof.ultra_proof);
            ASSERT(honk_verified);
            info("Goblin: Natively verifying merge proof.");
            auto merge_verifier = composer.create_merge_verifier(/*srs_size=*/10);
            bool merge_verified = merge_verifier.verify_proof(proof.merge_proof);
            ASSERT(merge_verified);
        }

        return { proof.ultra_proof, instance->verification_key };
    };

    GoblinProof prove()
    {
        // Execute the ECCVM
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/785) Properly initialize transcript
        info("Goblin: Constucting ECCVM.");
        auto eccvm_builder = ECCVMBuilder(op_queue);
        auto eccvm_composer = ECCVMComposer();
        auto eccvm_prover = eccvm_composer.create_prover(eccvm_builder);

        info("Goblin: Proving ECCVM.");
        proof.eccvm_proof = eccvm_prover.construct_proof();

        // Execute the Translator
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/786) Properly derive batching_challenge
        info("Goblin: Constucting Translator.");
        auto translator_builder = TranslatorBuilder(
            eccvm_prover.translation_batching_challenge_v, eccvm_prover.evaluation_challenge_x, op_queue);
        auto translator_composer = TranslatorComposer();
        auto translator_prover = translator_composer.create_prover(translator_builder, eccvm_prover.transcript);

        info("Goblin: Proving Translator.");
        proof.translator_proof = translator_prover.construct_proof();

        { // DEBUG only native verification
            auto eccvm_verifier = eccvm_composer.create_verifier(eccvm_builder);
            info("Goblin: Verifying ECCVM.");
            bool eccvm_verified = eccvm_verifier.verify_proof(proof.eccvm_proof);
            ASSERT(eccvm_verified);

            auto translator_verifier =
                translator_composer.create_verifier(translator_builder, eccvm_verifier.transcript);
            info("Goblin: Verifying Translator.");
            bool accumulator_construction_verified = translator_verifier.verify_proof(proof.translator_proof);
            ASSERT(accumulator_construction_verified);
            // WORKTODO: This needs to be part of the verifier. evals extracted from eccvm proof?
            bool translation_verified = translator_verifier.verify_translation(eccvm_prover.translation_evaluations);
            ASSERT(translation_verified);
        }

        return proof;
    };

    bool verify()
    {
        // Construct ultra verifier and verify ultra proof
        // Construct merge verifier and verify merge proof
        // Construct eccvm verifier and verify eccvm proof
        // Construct translator verifier and verify translator proof
        return true;
    };
};
} // namespace barretenberg