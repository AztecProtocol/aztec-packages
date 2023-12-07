#pragma once

#include "barretenberg/eccvm/eccvm_composer.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/merge_recursive_verifier.hpp"
#include "barretenberg/translator_vm/goblin_translator_composer.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace barretenberg {

class Goblin {
    using HonkProof = proof_system::plonk::proof;
    using GUHFlavor = proof_system::honk::flavor::GoblinUltra;
    using GUHProvingKey = GUHFlavor::ProvingKey;
    using GUHVerificationKey = GUHFlavor::VerificationKey;

  public:
    /**
     * @brief Output of goblin::accumulate; an Ultra proof and the corresponding verification key
     *
     */
    struct AccumulationOutput {
        HonkProof proof;
        std::shared_ptr<GUHVerificationKey> verification_key;
    };

    struct Proof {
        HonkProof merge_proof;
        HonkProof eccvm_proof;
        HonkProof translator_proof;
        TranslationEvaluations translation_evaluations;
        std::vector<uint8_t> to_buffer()
        {
            return {}; // WORKTODO
        }
    };

    using Fr = barretenberg::fr;
    using Fq = barretenberg::fq;

    using Transcript = proof_system::honk::BaseTranscript;
    using GoblinUltraComposer = proof_system::honk::GoblinUltraComposer;
    using GoblinUltraVerifier = proof_system::honk::UltraVerifier_<GUHFlavor>;
    using GoblinUltraCircuitBuilder = proof_system::GoblinUltraCircuitBuilder;
    using OpQueue = proof_system::ECCOpQueue;
    using ECCVMFlavor = proof_system::honk::flavor::ECCVM;
    using ECCVMBuilder = proof_system::ECCVMCircuitBuilder<ECCVMFlavor>;
    using ECCVMComposer = proof_system::honk::ECCVMComposer;
    using TranslatorBuilder = proof_system::GoblinTranslatorCircuitBuilder;
    using TranslatorComposer = proof_system::honk::GoblinTranslatorComposer;
    using RecursiveMergeVerifier =
        proof_system::plonk::stdlib::recursion::goblin::MergeRecursiveVerifier_<GoblinUltraCircuitBuilder>;
    using MergeVerifier = proof_system::honk::MergeVerifier_<GUHFlavor>;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();

    HonkProof merge_proof;

    std::shared_ptr<GUHProvingKey> proving_key = std::make_shared<GUHProvingKey>();
    std::shared_ptr<GUHVerificationKey> verification_key = std::make_shared<GUHVerificationKey>();

    // on the first call to accumulate there is no merge proof to verify
    bool merge_proof_exists{ false };

  private:
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/798) unique_ptr use is a hack
    std::unique_ptr<ECCVMBuilder> eccvm_builder;
    std::unique_ptr<TranslatorBuilder> translator_builder;
    std::unique_ptr<ECCVMComposer> eccvm_composer;
    std::unique_ptr<TranslatorComposer> translator_composer;
    AccumulationOutput accumulator;

  public:
    /**
     * @brief
     *
     * @param circuit_builder
     */
    AccumulationOutput accumulate(GoblinUltraCircuitBuilder& circuit_builder)
    {
        // Complete the circuit logic by recursively verifying previous merge proof if it exists
        if (merge_proof_exists) {
            RecursiveMergeVerifier merge_verifier{ &circuit_builder };
            [[maybe_unused]] auto pairing_points = merge_verifier.verify_proof(merge_proof);
        }

        // Construct a Honk proof for the main circuit
        GoblinUltraComposer composer;
        auto instance = composer.create_instance(circuit_builder);
        auto prover = composer.create_prover(instance);
        auto ultra_proof = prover.construct_proof();

        // Construct and store the merge proof to be recursively verified on the next call to accumulate
        auto merge_prover = composer.create_merge_prover(op_queue);
        merge_proof = merge_prover.construct_proof();

        if (!merge_proof_exists) {
            merge_proof_exists = true;
        }

        accumulator = { ultra_proof, instance->verification_key };
        return accumulator;
    };

    Proof prove()
    {
        Proof proof;

        proof.merge_proof = std::move(merge_proof);

        eccvm_builder = std::make_unique<ECCVMBuilder>(op_queue);
        eccvm_composer = std::make_unique<ECCVMComposer>();
        auto eccvm_prover = eccvm_composer->create_prover(*eccvm_builder);
        proof.eccvm_proof = eccvm_prover.construct_proof();
        proof.translation_evaluations = eccvm_prover.translation_evaluations;

        translator_builder = std::make_unique<TranslatorBuilder>(
            eccvm_prover.translation_batching_challenge_v, eccvm_prover.evaluation_challenge_x, op_queue);
        translator_composer = std::make_unique<TranslatorComposer>();
        auto translator_prover = translator_composer->create_prover(*translator_builder, eccvm_prover.transcript);
        proof.translator_proof = translator_prover.construct_proof();

        return proof;
    };

    Proof construct_proof(GoblinUltraCircuitBuilder& builder)
    {
        accumulate(builder);
        return prove();
    }

    bool verify(const Proof& proof) const
    {
        MergeVerifier merge_verifier;
        bool merge_verified = merge_verifier.verify_proof(proof.merge_proof);

        auto eccvm_verifier = eccvm_composer->create_verifier(*eccvm_builder);
        bool eccvm_verified = eccvm_verifier.verify_proof(proof.eccvm_proof);

        auto translator_verifier = translator_composer->create_verifier(*translator_builder, eccvm_verifier.transcript);
        bool accumulator_construction_verified = translator_verifier.verify_proof(proof.translator_proof);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/799):
        //   Ensure translation_evaluations are passed correctly
        bool translation_verified = translator_verifier.verify_translation(proof.translation_evaluations);

        return merge_verified && eccvm_verified && accumulator_construction_verified && translation_verified;
    };

    bool verify_proof(const proof_system::plonk::proof& proof) const
    {
        const auto extract_final_kernel_proof = [](auto& in) { return in; };
        GoblinUltraVerifier verifier{ verification_key };
        bool verified = verifier.verify_proof(extract_final_kernel_proof(proof));

        const auto extract_goblin_proof = []([[maybe_unused]] auto& in) { return Proof{}; };
        verified = verified && verify(extract_goblin_proof(proof));
        return verified;
    }
};
} // namespace barretenberg