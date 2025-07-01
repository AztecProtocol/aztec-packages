// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// goblin.hpp
#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib/merge_verifier/merge_recursive_verifier.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"

namespace bb {

class Goblin {
    using Commitment = MegaFlavor::Commitment;
    using FF = MegaFlavor::FF;

  public:
    using MegaBuilder = MegaCircuitBuilder;
    using Fr = bb::fr;
    using Transcript = NativeTranscript;
    using OpQueue = ECCOpQueue;
    using ECCVMBuilder = ECCVMFlavor::CircuitBuilder;
    using ECCVMProvingKey = ECCVMFlavor::ProvingKey;
    using TranslatorBuilder = TranslatorCircuitBuilder;
    using MergeProof = MergeProver::MergeProof;
    using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = TranslatorFlavor::VerificationKey;
    using MergeRecursiveVerifier = stdlib::recursion::goblin::MergeRecursiveVerifier_<MegaBuilder>;
    using PairingPoints = MergeRecursiveVerifier::PairingPoints;
    using RecursiveTranscript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<MegaBuilder>>;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();
    CommitmentKey<curve::BN254> commitment_key;

    GoblinProof goblin_proof;

    fq translation_batching_challenge_v;    // challenge for batching the translation polynomials
    fq evaluation_challenge_x;              // challenge for evaluating the translation polynomials
    std::shared_ptr<Transcript> transcript; // shared between ECCVM and Translator

    std::deque<MergeProof> merge_verification_queue; // queue of merge proofs to be verified

    struct VerificationKey {
        std::shared_ptr<ECCVMVerificationKey> eccvm_verification_key = std::make_shared<ECCVMVerificationKey>();
        std::shared_ptr<TranslatorVerificationKey> translator_verification_key =
            std::make_shared<TranslatorVerificationKey>();
    };

    Goblin(CommitmentKey<curve::BN254> bn254_commitment_key = CommitmentKey<curve::BN254>(),
           const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    /**
     * @brief Construct a merge proof for the goblin ECC ops in the provided circuit; append the proof to the
     * merge_verification_queue.
     *
     * @param transcript
     */
    void prove_merge(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

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
     *
     * @return Proof
     */
    GoblinProof prove();

    /**
     * @brief Recursively verify the next merge proof in the merge verification queue.
     * @details Proofs are verified in a FIFO manner
     *
     * @param builder The circuit in which the recursive verification will be performed.
     * @param t_commitments The commitments to the subtable for which the merge is being verified.
     * @param transcript The transcript to be passed to the MergeRecursiveVerifier.
     * @return PairingPoints
     */
    PairingPoints recursively_verify_merge(
        MegaBuilder& builder,
        const RefArray<MergeRecursiveVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments,
        const std::shared_ptr<RecursiveTranscript>& transcript);

    /**
     * @brief Verify a full Goblin proof (ECCVM, Translator, merge)
     *
     * @param proof
     * @param t_commitments // The commitments to the subtable for which the merge is being verified
     * @param transcript
     *
     * @return true
     * @return false
     */
    static bool verify(const GoblinProof& proof,
                       const RefArray<MergeVerifier::Commitment, MegaFlavor::NUM_WIRES>& t_commitments,
                       const std::shared_ptr<Transcript>& transcript);
};

} // namespace bb
