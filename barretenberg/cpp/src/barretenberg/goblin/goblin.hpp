// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// goblin.hpp
#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"

namespace bb {

class Goblin {
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
    using TranslationEvaluations = TranslationEvaluations_<ECCVMFlavor::FF>;
    using TranslatorBuilder = TranslatorCircuitBuilder;
    using MergeProof = MergeProver::MergeProof;
    using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = TranslatorFlavor::VerificationKey;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();
    std::shared_ptr<CommitmentKey<curve::BN254>> commitment_key;

    MergeProof merge_proof;
    GoblinProof goblin_proof;

    fq translation_batching_challenge_v;    // challenge for batching the translation polynomials
    fq evaluation_challenge_x;              // challenge for evaluating the translation polynomials
    std::shared_ptr<Transcript> transcript; // shared between ECCVM and Translator

    struct VerificationKey {
        std::shared_ptr<ECCVMVerificationKey> eccvm_verification_key = std::make_shared<ECCVMVerificationKey>();
        std::shared_ptr<TranslatorVerificationKey> translator_verification_key =
            std::make_shared<TranslatorVerificationKey>();
    };

    Goblin(const std::shared_ptr<CommitmentKey<curve::BN254>>& bn254_commitment_key = nullptr,
           const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    /**
     * @brief Construct a merge proof for the goblin ECC ops in the provided circuit
     *
     * @param circuit_builder
     */
    MergeProof prove_merge();

    /**
     * @brief Construct the final merge proof, where the prover shares a transcript with ECCVM and Translator.
     *
     */
    MergeProof prove_final_merge();

    /**
     * @brief Construct an ECCVM proof and the translation polynomial evaluations
     */
    void prove_eccvm();

    /**
     * @brief Construct a translator proof
     *
     */
    void prove_translator();

    /**
     * @brief Constuct a full Goblin proof (ECCVM, Translator, merge)
     * @details The merge proof is assumed to already have been constucted in the last accumulate step. It is simply
     * moved into the final proof here.
     *
     * @return Proof
     */
    GoblinProof prove(MergeProof merge_proof_in = {});

    /**
     * @brief Verify a full Goblin proof (ECCVM, Translator, merge)
     *
     * @param proof
     * @return true
     * @return false
     */
    static bool verify(const GoblinProof& proof, const std::shared_ptr<Transcript>& transcript);
};

} // namespace bb
