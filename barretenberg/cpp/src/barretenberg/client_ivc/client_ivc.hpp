#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/plonk_honk_shared/arithmetization/max_block_size_tracker.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"
#include <algorithm>

namespace bb {

/**
 * @brief The IVC scheme used by the aztec client for private function execution
 * @details Combines Protogalaxy with Goblin to accumulate one circuit at a time with efficient EC group
 * operations. It is assumed that the circuits being accumulated correspond alternatingly to an app and a kernel, as is
 * the case in Aztec. Two recursive folding verifiers are appended to each kernel (except the first one) to verify the
 * folding of a previous kernel and an app/function circuit. Due to this structure it is enforced that the total number
 * of circuits being accumulated is even.
 *
 */
class ClientIVC {

  public:
    using Flavor = MegaFlavor;
    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;
    using FoldProof = std::vector<FF>;
    using MergeProof = std::vector<FF>;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using DeciderProver = DeciderProver_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<DeciderProvingKeys>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;

    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using RecursiveDeciderVerificationKeys =
        bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using OinkRecursiveVerifier = stdlib::recursion::honk::OinkRecursiveVerifier_<RecursiveFlavor>;

    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;

    // A full proof for the IVC scheme
    struct Proof {
        FoldProof folding_proof; // final fold proof
        HonkProof decider_proof;
        GoblinProof goblin_proof;

        size_t size() const { return folding_proof.size() + decider_proof.size() + goblin_proof.size(); }

        MSGPACK_FIELDS(folding_proof, decider_proof, goblin_proof);
    };

    enum class QUEUE_TYPE { OINK, PG }; // for specifying type of proof in the verification queue

    // An entry in the native verification queue
    struct VerifierInputs {
        std::vector<FF> proof; // oink or PG
        std::shared_ptr<VerificationKey> honk_verification_key;
        QUEUE_TYPE type;
    };
    using VerificationQueue = std::vector<VerifierInputs>;

    // An entry in the stdlib verification queue
    struct StdlibVerifierInputs {
        StdlibProof<ClientCircuit> proof; // oink or PG
        std::shared_ptr<RecursiveVerificationKey> honk_verification_key;
        QUEUE_TYPE type;
    };
    using StdlibVerificationQueue = std::vector<StdlibVerifierInputs>;

    // Utility for tracking the max size of each block across the full IVC
    MaxBlockSizeTracker max_block_size_tracker;

  private:
    using ProverFoldOutput = FoldingResult<Flavor>;

  public:
    GoblinProver goblin;

    ProverFoldOutput fold_output; // prover accumulator and fold proof

    std::shared_ptr<DeciderVerificationKey> verifier_accumulator; // verifier accumulator
    std::shared_ptr<VerificationKey> honk_vk; // honk vk to be completed and folded into the accumulator

    // Set of tuples {proof, verification_key, type} to be recursively verified
    VerificationQueue verification_queue;
    // Set of tuples {stdlib_proof, stdlib_verification_key, type} corresponding to the native verification queue
    StdlibVerificationQueue stdlib_verification_queue;
    // Set of merge proofs to be recursively verified
    std::vector<MergeProof> merge_verification_queue;

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    // A flag indicating whether or not to construct a structured trace in the DeciderProvingKey
    TraceStructure trace_structure = TraceStructure::NONE;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1101): eventually do away with this.
    // Setting auto_verify_mode = true will cause kernel completion logic to be added to kernels automatically
    bool auto_verify_mode = false;
    bool is_kernel = true;

    bool initialized = false; // Is the IVC accumulator initialized

    void instantiate_stdlib_verification_queue(
        ClientCircuit& circuit, const std::vector<std::shared_ptr<RecursiveVerificationKey>>& input_keys = {});

    void perform_recursive_verification_and_databus_consistency_checks(
        ClientCircuit& circuit,
        const StdlibProof<ClientCircuit>& proof,
        const std::shared_ptr<RecursiveVerificationKey>& vkey,
        const QUEUE_TYPE type);

    void process_recursive_merge_verification_queue(ClientCircuit& circuit);

    // Complete the logic of a kernel circuit (e.g. PG/merge recursive verification, databus consistency checks)
    void complete_kernel_circuit_logic(ClientCircuit& circuit);

    /**
     * @brief Perform prover work for accumulation (e.g. PG folding, merge proving)
     *
     * @param circuit The incoming statement
     * @param precomputed_vk The verification key of the incoming statement OR a mocked key whose metadata needs to be
     * set using the proving key produced from `circuit` in order to pass some assertions in the Oink prover.
     * @param mock_vk A boolean to say whether the precomputed vk shoudl have its metadata set.
     */
    void accumulate(ClientCircuit& circuit,
                    const std::shared_ptr<VerificationKey>& precomputed_vk = nullptr,
                    bool mock_vk = false);

    Proof prove();

    static bool verify(const Proof& proof,
                       const std::shared_ptr<DeciderVerificationKey>& accumulator,
                       const std::shared_ptr<DeciderVerificationKey>& final_stack_vk,
                       const std::shared_ptr<ClientIVC::ECCVMVerificationKey>& eccvm_vk,
                       const std::shared_ptr<ClientIVC::TranslatorVerificationKey>& translator_vk);

    bool verify(const Proof& proof, const std::vector<std::shared_ptr<DeciderVerificationKey>>& vk_stack);

    bool prove_and_verify();

    HonkProof decider_prove() const;

    std::vector<std::shared_ptr<VerificationKey>> precompute_folding_verification_keys(
        std::vector<ClientCircuit> circuits);
};
} // namespace bb