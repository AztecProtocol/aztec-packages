#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
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
class UltraVanillaClientIVC {

  public:
    using Flavor = MegaFlavor;
    using MegaVerificationKey = Flavor::VerificationKey;
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
    using MegaProver = UltraProver_<Flavor>;
    using MegaVerifier = UltraVerifier_<Flavor>;

    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using RecursiveDeciderVerificationKeys =
        bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using OinkRecursiveVerifier = stdlib::recursion::honk::OinkRecursiveVerifier_<RecursiveFlavor>;
    using DeciderRecursiveVerifier = stdlib::recursion::honk::DeciderRecursiveVerifier_<RecursiveFlavor>;

    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;

    /**
     * @brief A full  proof for the IVC scheme containing a Mega proof showing correctness of the hiding circuit (which
     * recursive verified the last folding and decider proof) and a Goblin proof (translator VM, ECCVM and last merge
     * proof).
     *
     * @details This proof will be zero-knowledge.
     */
    struct Proof {
        HonkProof mega_proof;
        GoblinProof goblin_proof;

        size_t size() const { return mega_proof.size() + goblin_proof.size(); }

        MSGPACK_FIELDS(mega_proof, goblin_proof);
    };

    struct VerificationKey {
        std::shared_ptr<MegaVerificationKey> mega;
        std::shared_ptr<ECCVMVerificationKey> eccvm;
        std::shared_ptr<TranslatorVerificationKey> translator;

        MSGPACK_FIELDS(mega, eccvm, translator);
    };

    enum class QUEUE_TYPE { OINK, PG }; // for specifying type of proof in the verification queue

    // An entry in the native verification queue
    struct VerifierInputs {
        std::vector<FF> proof; // oink or PG
        std::shared_ptr<MegaVerificationKey> honk_verification_key;
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
    ExecutionTraceUsageTracker trace_usage_tracker;

  private:
    using ProverFoldOutput = FoldingResult<Flavor>;

  public:
    ProverFoldOutput fold_output; // prover accumulator and fold proof
    HonkProof mega_proof;

    std::shared_ptr<DeciderVerificationKey> verifier_accumulator; // verifier accumulator
    std::shared_ptr<MegaVerificationKey> honk_vk; // honk vk to be completed and folded into the accumulator

    // Set of tuples {proof, verification_key, type} to be recursively verified
    VerificationQueue verification_queue;
    // Set of tuples {stdlib_proof, stdlib_verification_key, type} corresponding to the native verification queue
    StdlibVerificationQueue stdlib_verification_queue;
    // Set of merge proofs to be recursively verified
    std::vector<MergeProof> merge_verification_queue;

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    // Settings related to the use of fixed block sizes for each gate in the execution trace
    TraceSettings trace_settings;

    std::shared_ptr<typename MegaFlavor::CommitmentKey> bn254_commitment_key;

    GoblinProver goblin;

    // We dynamically detect whether the input stack consists of one circuit, in which case we do not construct the
    // hiding circuit and instead simply prove the single input circuit.
    bool one_circuit = false;

    bool initialized = false; // Is the IVC accumulator initialized

    UltraVanillaClientIVC(TraceSettings trace_settings = {})
        : trace_usage_tracker(trace_settings)
        , trace_settings(trace_settings)
        , bn254_commitment_key(trace_settings.structure.has_value()
                                   ? std::make_shared<CommitmentKey<curve::BN254>>(trace_settings.dyadic_size())
                                   : nullptr)
        , goblin(bn254_commitment_key)
    {}

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
                    const bool _one_circuit = false,
                    const std::shared_ptr<MegaVerificationKey>& precomputed_vk = nullptr,
                    const bool mock_vk = false);

    Proof prove();

    HonkProof construct_and_prove_hiding_circuit();

    static bool verify(const Proof& proof, const VerificationKey& vk);

    bool verify(const Proof& proof);

    bool prove_and_verify();

    HonkProof decider_prove() const;

    std::vector<std::shared_ptr<MegaVerificationKey>> precompute_folding_verification_keys(
        std::vector<ClientCircuit> circuits);

    VerificationKey get_vk() const
    {
        return { honk_vk,
                 std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key()),
                 std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key()) };
    }
};
} // namespace bb