#pragma once

#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_trace_checker.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/plonk_honk_shared/proving_key_inspector.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/goblin_verifier/merge_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

class GoblinProver {
    using Commitment = MegaFlavor::Commitment;
    using FF = MegaFlavor::FF;

  public:
    using MegaBuilder = MegaCircuitBuilder;
    using Fr = bb::fr;
    using Transcript = NativeTranscript;
    using MegaDeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
    using OpQueue = ECCOpQueue;
    using ECCVMBuilder = ECCVMFlavor::CircuitBuilder;
    using ECCVMProvingKey = ECCVMFlavor::ProvingKey;
    using TranslationEvaluations = ECCVMProver::TranslationEvaluations;
    using TranslatorBuilder = TranslatorCircuitBuilder;

    using MergeProver = MergeProver_<MegaFlavor>;
    using VerificationKey = MegaFlavor::VerificationKey;
    using MergeProof = MergeProver::MergeProof;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();
    std::shared_ptr<CommitmentKey<curve::BN254>> commitment_key;

    MergeProof merge_proof;
    GoblinProof goblin_proof;

    std::shared_ptr<ECCVMProvingKey> get_eccvm_proving_key() const { return eccvm_key; }
    std::shared_ptr<TranslatorProvingKey::ProvingKey> get_translator_proving_key() const
    {
        return translator_key->proving_key;
    }

  private:
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/798) unique_ptr use is a hack
    std::unique_ptr<TranslatorProver> translator_prover;
    std::unique_ptr<ECCVMProver> eccvm_prover;
    std::shared_ptr<ECCVMProvingKey> eccvm_key;
    std::shared_ptr<TranslatorProvingKey> translator_key;

    GoblinAccumulationOutput accumulator; // Used only for ACIR methods for now

  public:
    GoblinProver(const std::shared_ptr<CommitmentKey<curve::BN254>>& bn254_commitment_key = nullptr)
        : commitment_key(bn254_commitment_key)
    {}

    /**
     * @brief Construct a merge proof for the goblin ECC ops in the provided circuit
     *
     * @param circuit_builder
     */
    MergeProof prove_merge(MegaBuilder& circuit_builder)
    {
        PROFILE_THIS_NAME("Goblin::merge");
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/993): Some circuits (particularly on the first call
        // to accumulate) may not have any goblin ecc ops prior to the call to merge(), so the commitment to the new
        // contribution (C_t_shift) in the merge prover will be the point at infinity. (Note: Some dummy ops are added
        // in 'add_gates_to_ensure...' but not until proving_key construction which comes later). See issue for ideas
        // about how to resolve.
        if (circuit_builder.blocks.ecc_op.size() == 0) {
            MockCircuits::construct_goblin_ecc_op_circuit(circuit_builder); // Add some arbitrary goblin ECC ops
        }

        MergeProver merge_prover{ circuit_builder.op_queue, commitment_key };
        merge_proof = merge_prover.construct_proof();
        return merge_proof;
    };

    void construct_eccvm_prover()
    {
        PROFILE_THIS_NAME("Create ECCVMBuilder and ECCVMProver");

        auto eccvm_builder = std::make_unique<ECCVMBuilder>(op_queue);
        // As is it used in ClientIVC, we make it fixed size = 2^{CONST_ECCVM_LOG_N}
        eccvm_prover = std::make_unique<ECCVMProver>(*eccvm_builder, /*fixed_size =*/true);
        eccvm_key = eccvm_prover->key;
    }

    /**
     * @brief Construct an ECCVM proof and the translation polynomial evaluations
     */
    void prove_eccvm()
    {
        construct_eccvm_prover();
        goblin_proof.eccvm_proof = eccvm_prover->construct_proof();
        goblin_proof.translation_evaluations = eccvm_prover->translation_evaluations;
    }

    void construct_translator_prover(const fq& translation_batching_challenge_v,
                                     const fq& evaluation_challenge_x,
                                     const std::shared_ptr<Transcript>& transcript)
    {
        PROFILE_THIS_NAME("Create TranslatorBuilder and TranslatorProver");
        auto translator_builder =
            std::make_unique<TranslatorBuilder>(translation_batching_challenge_v, evaluation_challenge_x, op_queue);
        translator_key = std::make_shared<TranslatorProvingKey>(*translator_builder, commitment_key);
        translator_prover = std::make_unique<TranslatorProver>(translator_key, transcript);
        eccvm_prover = nullptr;
    }

    /**
     * @brief Construct a translator proof
     *
     */
    void prove_translator()
    {
        construct_translator_prover(
            eccvm_prover->batching_challenge_v, eccvm_prover->evaluation_challenge_x, eccvm_prover->transcript);
        goblin_proof.translator_proof = translator_prover->construct_proof();
    }

    void construct_vks()
    {
        construct_eccvm_prover();
        construct_translator_prover(0, 0, nullptr);
    };

    /**
     * @brief Constuct a full Goblin proof (ECCVM, Translator, merge)
     * @details The merge proof is assumed to already have been constucted in the last accumulate step. It is simply
     * moved into the final proof here.
     *
     * @return Proof
     */
    GoblinProof prove(MergeProof merge_proof_in = {})
    {

        PROFILE_THIS_NAME("Goblin::prove");

        info("Constructing a Goblin proof with num ultra ops = ", op_queue->get_ultra_ops_table_num_rows());

        goblin_proof.merge_proof = merge_proof_in.empty() ? std::move(merge_proof) : std::move(merge_proof_in);
        {
            PROFILE_THIS_NAME("prove_eccvm");
            vinfo("prove eccvm...");
            prove_eccvm();
            vinfo("finished eccvm proving.");
        }
        {
            PROFILE_THIS_NAME("prove_translator");
            vinfo("prove translator...");
            prove_translator();
            vinfo("finished translator proving.");
        }
        return goblin_proof;
    };
};

class GoblinVerifier {
  public:
    using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using MergeVerifier = bb::MergeVerifier_<MegaFlavor>;
    using Builder = MegaCircuitBuilder;
    using RecursiveMergeVerifier = stdlib::recursion::goblin::MergeRecursiveVerifier_<Builder>;
    using PairingPoints = RecursiveMergeVerifier::PairingPoints;

    struct VerifierInput {
        std::shared_ptr<ECCVMVerificationKey> eccvm_verification_key;
        std::shared_ptr<TranslatorVerificationKey> translator_verification_key;
    };

  private:
    std::shared_ptr<ECCVMVerificationKey> eccvm_verification_key;
    std::shared_ptr<TranslatorVerificationKey> translator_verification_key;

  public:
    GoblinVerifier(std::shared_ptr<ECCVMVerificationKey> eccvm_verification_key,
                   std::shared_ptr<TranslatorVerificationKey> translator_verification_key)
        : eccvm_verification_key(eccvm_verification_key)
        , translator_verification_key(translator_verification_key)
    {}

    GoblinVerifier(VerifierInput input)
        : eccvm_verification_key(input.eccvm_verification_key)
        , translator_verification_key(input.translator_verification_key)
    {}

    /**
     * @brief Append recursive verification of a merge proof to a provided circuit
     *
     * @param circuit_builder
     * @return PairingPoints
     */
    static PairingPoints recursive_verify_merge(Builder& circuit_builder, const StdlibProof<Builder>& proof)
    {
        PROFILE_THIS_NAME("Goblin::merge");
        RecursiveMergeVerifier merge_verifier{ &circuit_builder };
        return merge_verifier.verify_proof(proof);
    };

    /**
     * @brief Verify a full Goblin proof (ECCVM, Translator, merge)
     *
     * @param proof
     * @return true
     * @return false
     */
    bool verify(const GoblinProof& proof)
    {
        MergeVerifier merge_verifier;
        bool merge_verified = merge_verifier.verify_proof(proof.merge_proof);

        ECCVMVerifier eccvm_verifier(eccvm_verification_key);
        bool eccvm_verified = eccvm_verifier.verify_proof(proof.eccvm_proof);

        TranslatorVerifier translator_verifier(translator_verification_key, eccvm_verifier.transcript);

        bool accumulator_construction_verified = translator_verifier.verify_proof(
            proof.translator_proof, eccvm_verifier.evaluation_challenge_x, eccvm_verifier.batching_challenge_v);

        bool translation_verified = translator_verifier.verify_translation(
            proof.translation_evaluations, eccvm_verifier.translation_masking_term_eval);

        vinfo("merge verified?: ", merge_verified);
        vinfo("eccvm verified?: ", eccvm_verified);
        vinfo("accumulator construction_verified?: ", accumulator_construction_verified);
        vinfo("translation verified?: ", translation_verified);

        return merge_verified && eccvm_verified && accumulator_construction_verified && translation_verified;
    };
};
} // namespace bb
