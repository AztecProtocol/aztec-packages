// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/goblin/batch_merge_prover.hpp"
#include "barretenberg/goblin/batch_merge_verifier.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

class Goblin {
    using Commitment = MegaFlavor::Commitment;
    using FF = MegaFlavor::FF;

  protected:
    // In AVM we only use Goblin for a single circuit whose proof is not required to be zero-knowledge. While Translator
    // will still expect to find random ops at the beginning to ensure the accumulation result remains at a fixed row we
    // opt for not adding random ops at the end of the op queue.
    bool avm_mode = false;

  public:
    using MegaBuilder = MegaCircuitBuilder;
    using Fr = bb::fr;
    using Transcript = NativeTranscript;
    using OpQueue = ECCOpQueue;
    using ECCVMBuilder = ECCVMFlavor::CircuitBuilder;
    using ECCVMProvingKey = ECCVMFlavor::ProvingKey;
    using TranslatorBuilder = TranslatorCircuitBuilder;
    using MergeProof = MergeProver::MergeProof;
    using BatchMergeProof = BatchMergeProver::MergeProof;
    using ECCVMVerificationKey = ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = TranslatorFlavor::VerificationKey;
    using MergeRecursiveVerifier = stdlib::recursion::goblin::MergeRecursiveVerifier<MegaBuilder>;
    using BatchMergeRecursiveVerifier = stdlib::recursion::goblin::BatchMergeRecursiveVerifier<MegaBuilder>;
    using PairingPoints = MergeRecursiveVerifier::PairingPoints;
    using TableCommitments = MergeVerifier::TableCommitments;
    using RecursiveTableCommitments = MergeRecursiveVerifier::TableCommitments;
    using BatchRecursiveTableCommitments = BatchMergeRecursiveVerifier::TableCommitments;
    using MergeCommitments = MergeVerifier::InputCommitments;
    using RecursiveMergeCommitments = MergeRecursiveVerifier::InputCommitments;
    using RecursiveCommitment = MergeRecursiveVerifier::Commitment;
    using RecursiveTranscript = MegaStdlibTranscript;
    using TranslatorInputData = TranslatorInputData_<fq>;
    using IPA_PCS = IPA<ECCVMFlavor::Curve, CONST_ECCVM_LOG_N>;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();

    GoblinProof goblin_proof;

    fq translation_batching_challenge_v;    // challenge for batching the translation polynomials
    fq evaluation_challenge_x;              // challenge for evaluating the translation polynomials
    std::shared_ptr<Transcript> transcript; // shared between ECCVM and Translator

    BatchMergeProof batch_merge_proof; // delayed batch merge proof for Chonk

    struct VerificationKey {
        std::shared_ptr<ECCVMVerificationKey> eccvm_verification_key = std::make_shared<ECCVMVerificationKey>();
        std::shared_ptr<TranslatorVerificationKey> translator_verification_key =
            std::make_shared<TranslatorVerificationKey>();
    };

    Goblin(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    /**
     * @brief Construct a single-step merge proof for the most recently merged subtable.
     * @details In the Chonk flow this is invoked only for the final fixed-location append of the hiding kernel
     * subtable; multi-subtable merges are handled by prove_batch_merge().
     */
    MergeProof prove_merge(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>()) const;

    /**
     * @brief Construct an ECCVM proof and TripleIPA opening proof.
     * @details Also computes the translation polynomial evaluation challenges (batching_challenge_v,
     * evaluation_challenge_x) which are passed to the Translator.
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
     * @brief Recursively verify the most recent single-step merge proof.
     * @details In Chonk this is invoked once per IVC, recursively verifying the hiding kernel's fixed-location
     * append against the prior aggregate table.
     *
     * @param builder The circuit in which the recursive verification will be performed.
     * @param inputs_commitments The commitments used by the Merge verifier (subtable + prior aggregate)
     * @param transcript The transcript to be passed to the MergeRecursiveVerifier.
     * @return Pair of PairingPoints and commitments to the merged tables as read from the proof by the Merge verifier
     */
    std::pair<PairingPoints, RecursiveTableCommitments> recursively_verify_merge(
        MegaBuilder& builder,
        const RecursiveMergeCommitments& merge_commitments,
        const std::shared_ptr<RecursiveTranscript>& transcript);

    /**
     * @brief Construct a batched merge proof for all subtables accumulated during the IVC.
     * @details Proves in a single shot that the full merged table is the correct concatenation of all per-circuit
     * subtables. Run once at the end of the IVC.
     */
    void prove_batch_merge();

    /**
     * @brief Recursively verify the batched merge proof inside the hiding kernel.
     * @details `hash` is the running ECC-op hash chained over all per-circuit subtable commitments observed
     * during accumulation; the in-circuit verifier checks the proof's column commitments against it.
     */
    std::pair<PairingPoints, BatchRecursiveTableCommitments> recursively_verify_batch_merge(
        MegaBuilder& builder, const BatchMergeRecursiveVerifier::FF& hash) const;
};

} // namespace bb
