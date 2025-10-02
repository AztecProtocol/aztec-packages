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
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

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
    using TableCommitments = MergeVerifier::TableCommitments;
    using RecursiveTableCommitments = MergeRecursiveVerifier::TableCommitments;
    using MergeCommitments = MergeVerifier::InputCommitments;
    using RecursiveMergeCommitments = MergeRecursiveVerifier::InputCommitments;
    using RecursiveCommitment = MergeRecursiveVerifier::Commitment;
    using RecursiveTranscript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<MegaBuilder>>;

    std::shared_ptr<OpQueue> op_queue = std::make_shared<OpQueue>();
    CommitmentKey<curve::BN254> commitment_key;

    GoblinProof goblin_proof;

    fq translation_batching_challenge_v;    // challenge for batching the translation polynomials
    fq evaluation_challenge_x;              // challenge for evaluating the translation polynomials
    std::shared_ptr<Transcript> transcript; // shared between ECCVM and Translator

    std::deque<MergeProof> merge_verification_queue; // queue of merge proofs to be verified

    // In AVM we only use Goblin for a single circuit (it's recursive verifier) whose proof is not required to be
    // zero-knowledge. While Translator will still expect to find random ops at the beginning to ensure the accumulation
    // result remains at a fixed row we opt for not adding random ops at the end of the op queue.
    bool avm_mode = false;

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
    void prove_merge(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>(),
                     const MergeSettings merge_settings = MergeSettings::PREPEND);

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
    GoblinProof prove(const MergeSettings merge_settings = MergeSettings::PREPEND);

    /**
     * @brief Recursively verify the next merge proof in the merge verification queue.
     * @details Proofs are verified in a FIFO manner
     *
     * @param builder The circuit in which the recursive verification will be performed.
     * @param inputs_commitments The commitment used by the Merge verifier
     * @param transcript The transcript to be passed to the MergeRecursiveVerifier.
     * @param merge_settings How the most recent ecc op subtable is going to be merged into the table of ecc ops
     * @return Pair of PairingPoints and commitments to the merged tables as read from the proof by the Merge verifier
     */
    std::pair<PairingPoints, RecursiveTableCommitments> recursively_verify_merge(
        MegaBuilder& builder,
        const RecursiveMergeCommitments& merge_commitments,
        const std::shared_ptr<RecursiveTranscript>& transcript,
        const MergeSettings merge_settings = MergeSettings::PREPEND);

    /**
     * @brief Verify a full Goblin proof (ECCVM, Translator, merge)
     *
     * @param proof
     * @param inputs_commitments The commitments used by the Merge verifier
     * @param merged_table_commitment The commitment to the merged table as read from the proof
     * @param transcript
     * @param merge_settings How the most recent ecc op subtable is going to be merged into the table of ecc ops
     * @return Pair of verification result and commitments to the merged tables as read from the proof by the Merge
     * verifier
     */
    static bool verify(const GoblinProof& proof,
                       const MergeCommitments& merge_commitments,
                       const std::shared_ptr<Transcript>& transcript,
                       const MergeSettings merge_settings = MergeSettings::PREPEND);

    /**
     * @brief Translator requires the op queue to start with a no-op to ensure op queue polynomials are shiftable and
     * then expects three random ops. This is due to the ZK requirement in ClientIVC.  We need to also ensure these ops
     * are present when Goblin is used for AVM, although we only ever have a single table of ecc ops and no ZK
     * requiements.
     *
     * @todo (https://github.com/AztecProtocol/barretenberg/issues/1537) Asses whether two Translator variants (one with
     * Zk and one without) would be a better option
     */
    void ensure_well_formed_op_queue_for_avm(MegaBuilder& builder) const;
};

} // namespace bb
