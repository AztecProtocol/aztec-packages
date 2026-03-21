#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/flavor/mega_v2_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_v2_zk_flavor.hpp"
#include "barretenberg/goblin/goblin_v2.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_v2_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_v2_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs_v2.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#ifndef NDEBUG
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#endif

namespace bb {

/**
 * @brief ChonkV2: Full IVC with deferred Poseidon2 hash verification.
 *
 * @details Mirrors the Chonk IVC scheme exactly, with additional Poseidon2 op queue handling.
 * Uses MegaV2Flavor (which has poseidon2_op_wire columns and the Poseidon2OpQueueRelation).
 *
 * Key differences from Chonk:
 *   - Uses GoblinV2 (manages both ECC + Poseidon2 op queues)
 *   - At each accumulate(): runs BOTH ECC merge AND Poseidon2 merge
 *   - prove() constructs the Poseidon2 final proof in addition to Goblin proofs
 *   - Kernel circuits recursively verify BOTH merge protocols
 *   - Uses KernelV2IO/HidingKernelV2IO with poseidon2_op_tables
 */
class ChonkV2 {
  public:
    using Flavor = MegaV2Flavor;
    using MegaVerificationKey = Flavor::VerificationKey;
    using MegaV2ZKVerificationKey = MegaV2ZKFlavor::VerificationKey;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using ProverPolynomials = Flavor::ProverPolynomials;
    using Point = Flavor::Curve::AffineElement;
    using ProverInstance = ProverInstance_<Flavor>;
    using DeciderZKProvingKey = ProverInstance_<MegaV2ZKFlavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder;
    using Transcript = NativeTranscript;

    // Recursive types
    using RecursiveFlavor = MegaV2RecursiveFlavor_<bb::MegaCircuitBuilder>;
    using StdlibFF = RecursiveFlavor::FF;
    using RecursiveCommitment = RecursiveFlavor::Commitment;
    using RecursiveVerifierInstance = VerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using RecursiveVKAndHash = RecursiveFlavor::VKAndHash;
    using RecursiveTranscript = RecursiveFlavor::Transcript;
    using PairingPoints = stdlib::recursion::PairingPoints<stdlib::bn254<ClientCircuit>>;
    using KernelV2IO = bb::stdlib::recursion::honk::KernelV2IO;
    using HidingKernelV2IO = bb::stdlib::recursion::honk::HidingKernelV2IO<ClientCircuit>;
    using AppIO = bb::stdlib::recursion::honk::AppIO;
    using StdlibProof = stdlib::Proof<ClientCircuit>;
    using WitnessCommitments = RecursiveFlavor::WitnessCommitments;
    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using EccTableCommitments = std::array<RecursiveFlavor::Commitment, ClientCircuit::NUM_WIRES>;
    using Poseidon2TableCommitments = std::array<RecursiveFlavor::Commitment, Poseidon2OpQueue::TABLE_WIDTH>;

    // Folding
    using FoldingProver = HypernovaV2FoldingProver;
    using FoldingVerifier = HypernovaFoldingVerifier<Flavor>;
    using RecursiveFoldingVerifier = HypernovaFoldingVerifier<RecursiveFlavor>;
    using DeciderProver = HypernovaV2DeciderProver;
    using RecursiveDeciderVerifier = HypernovaDeciderVerifier<RecursiveFlavor>;
    using ProverAccumulator = FoldingProver::Accumulator;
    using VerifierAccumulator = FoldingVerifier::Accumulator;
    using RecursiveVerifierAccumulator = RecursiveFoldingVerifier::Accumulator;

    enum class QUEUE_TYPE : uint8_t { OINK, HN, HN_TAIL, HN_FINAL, MEGA };

    struct VerifierInputs {
        std::vector<FF> proof;
        std::shared_ptr<MegaVerificationKey> honk_vk;
        QUEUE_TYPE type;
        bool is_kernel = false;
    };
    using VerificationQueue = std::deque<VerifierInputs>;

    struct StdlibVerifierInputs {
        StdlibProof proof;
        std::shared_ptr<RecursiveVKAndHash> honk_vk_and_hash;
        QUEUE_TYPE type;
        bool is_kernel = false;

        StdlibVerifierInputs(StdlibProof proof_,
                             std::shared_ptr<RecursiveVKAndHash> honk_vk_and_hash_,
                             QUEUE_TYPE type_,
                             bool is_kernel_)
            : proof(std::move(proof_))
            , honk_vk_and_hash(std::move(honk_vk_and_hash_))
            , type(type_)
            , is_kernel(is_kernel_)
        {}
    };
    using StdlibVerificationQueue = std::deque<StdlibVerifierInputs>;

    struct ChonkV2Proof {
        HonkProof mega_proof;
        GoblinV2Proof goblin_v2_proof;
        size_t size() const { return mega_proof.size() + goblin_v2_proof.size(); }
    };

  private:
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();
    std::shared_ptr<Transcript> prover_accumulation_transcript = std::make_shared<Transcript>();
    size_t num_circuits;

  public:
    size_t num_circuits_accumulated = 0;
    ProverAccumulator prover_accumulator;
    HonkProof decider_proof;
    VerifierAccumulator recursive_verifier_native_accum;

    VerificationQueue verification_queue;
    StdlibVerificationQueue stdlib_verification_queue;
    DataBusDepot bus_depot;
    GoblinV2 goblin;

    size_t get_num_circuits() const { return num_circuits; }
    GoblinV2& get_goblin() { return goblin; }
    const GoblinV2& get_goblin() const { return goblin; }

    ChonkV2(size_t num_circuits)
        : num_circuits(num_circuits)
    {
        BB_ASSERT_GT(num_circuits, 0UL, "Number of circuits must be specified and greater than 0.");
    }

    void instantiate_stdlib_verification_queue(ClientCircuit& circuit,
                                               const std::vector<std::shared_ptr<RecursiveVKAndHash>>& input_keys = {})
    {
        bool vkeys_provided = !input_keys.empty();
        size_t key_idx = 0;
        while (!verification_queue.empty()) {
            const VerifierInputs& entry = verification_queue.front();
            StdlibProof stdlib_proof(circuit, entry.proof);
            std::shared_ptr<RecursiveVKAndHash> stdlib_vk_and_hash;
            if (vkeys_provided) {
                stdlib_vk_and_hash = input_keys[key_idx++];
            } else {
                stdlib_vk_and_hash = std::make_shared<RecursiveVKAndHash>(circuit, entry.honk_vk);
            }
            stdlib_verification_queue.emplace_back(stdlib_proof, stdlib_vk_and_hash, entry.type, entry.is_kernel);
            verification_queue.pop_front();
        }
    }

    void complete_kernel_circuit_logic(ClientCircuit& circuit)
    {
        auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();
        EccTableCommitments ecc_T_prev_commitments;
        Poseidon2TableCommitments poseidon2_T_prev_commitments;

        if (stdlib_verification_queue.empty()) {
            instantiate_stdlib_verification_queue(circuit);
        }

        bool is_init_kernel =
            stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::OINK);
        bool is_tail_kernel =
            stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::HN_TAIL);
        bool is_hiding_kernel =
            stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::HN_FINAL);

        if (is_tail_kernel) {
            circuit.queue_ecc_no_op();
            Chonk::hide_op_queue_content_in_tail(circuit);
            Chonk::hide_op_queue_accumulation_result(circuit);
        }
        circuit.queue_ecc_eq();

        std::vector<PairingPoints> points_accumulator;
        std::optional<RecursiveVerifierAccumulator> current_stdlib_verifier_accumulator;
        if (!is_init_kernel) {
            current_stdlib_verifier_accumulator =
                RecursiveVerifierAccumulator::stdlib_from_native<RecursiveFlavor::Curve>(
                    &circuit, recursive_verifier_native_accum);
        }

        while (!stdlib_verification_queue.empty()) {
            const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();

            // --- Standard recursive verification (same as Chonk) ---
            using MergeCommitments = Goblin::MergeRecursiveVerifier::InputCommitments;
            MergeCommitments ecc_merge_commitments{ .T_prev_commitments = ecc_T_prev_commitments };

            auto verifier_instance = std::make_shared<RecursiveVerifierInstance>(verifier_input.honk_vk_and_hash);
            std::optional<RecursiveVerifierAccumulator> output_verifier_accumulator;

            RecursiveFoldingVerifier folding_verifier(accumulation_recursive_transcript);
            switch (verifier_input.type) {
            case QUEUE_TYPE::OINK: {
                auto [_, new_verifier_accumulator] =
                    folding_verifier.instance_to_accumulator(verifier_instance, verifier_input.proof);
                output_verifier_accumulator = std::move(new_verifier_accumulator);
                ecc_merge_commitments.T_prev_commitments =
                    stdlib::recursion::honk::empty_ecc_op_tables(circuit);
                // Initialize empty poseidon2 T_prev for init kernel
                for (auto& c : poseidon2_T_prev_commitments) {
                    using G1 = RecursiveCommitment;
                    using BF = typename G1::BaseField;
                    c = G1(BF(nullptr, uint256_t(stdlib::recursion::honk::DEFAULT_ECC_COMMITMENT.x)),
                            BF(nullptr, uint256_t(stdlib::recursion::honk::DEFAULT_ECC_COMMITMENT.y)),
                            false);
                    c.convert_constant_to_fixed_witness(&circuit);
                }
                break;
            }
            case QUEUE_TYPE::HN:
            case QUEUE_TYPE::HN_TAIL: {
                auto [_first, _second, new_acc] =
                    folding_verifier.verify_folding_proof(verifier_instance, verifier_input.proof);
                output_verifier_accumulator = std::move(new_acc);
                break;
            }
            case QUEUE_TYPE::HN_FINAL: {
                auto [_first, _second, final_acc] =
                    folding_verifier.verify_folding_proof(verifier_instance, verifier_input.proof);
                RecursiveDeciderVerifier decider_verifier(accumulation_recursive_transcript);
                StdlibProof stdlib_decider_proof(circuit, decider_proof);
                points_accumulator.emplace_back(decider_verifier.verify_proof(final_acc, stdlib_decider_proof));
                break;
            }
            default:
                throw_or_abort("Invalid queue type");
            }

            WitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
            std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);

            if (verifier_input.is_kernel) {
                KernelV2IO kernel_input;
                kernel_input.reconstruct_from_public(public_inputs);
                points_accumulator.emplace_back(kernel_input.pairing_inputs);

                // Databus consistency checks
                kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.calldata);
                kernel_input.app_return_data.incomplete_assert_equal(witness_commitments.secondary_calldata);

                // ECC T_prev from previous kernel
                ecc_merge_commitments.T_prev_commitments = std::move(kernel_input.ecc_op_tables);
                // Poseidon2 T_prev from previous kernel
                poseidon2_T_prev_commitments = std::move(kernel_input.poseidon2_op_tables);

                bus_depot.set_kernel_return_data_commitment(witness_commitments.return_data);
            } else {
                AppIO app_input;
                app_input.reconstruct_from_public(public_inputs);
                points_accumulator.emplace_back(app_input.pairing_inputs);
                bus_depot.set_app_return_data_commitment(witness_commitments.return_data);
            }

            // ECC merge verification (same as Chonk)
            ecc_merge_commitments.t_commitments = witness_commitments.get_ecc_op_wires().get_copy();
            auto [ecc_merge_pp, ecc_merged] =
                goblin.recursively_verify_merge(circuit, ecc_merge_commitments, accumulation_recursive_transcript);
            points_accumulator.emplace_back(ecc_merge_pp);
            ecc_T_prev_commitments = ecc_merged;

            // Poseidon2 merge verification (NEW in ChonkV2)
            typename GoblinV2::RecursivePoseidon2MergeCommitments p2_merge_commitments;
            p2_merge_commitments.T_prev_commitments = poseidon2_T_prev_commitments;
            p2_merge_commitments.t_commitments = witness_commitments.get_poseidon2_op_wires().get_copy();
            auto [p2_merge_pp, p2_merged] = goblin.recursively_verify_poseidon2_merge(
                circuit, p2_merge_commitments, accumulation_recursive_transcript);
            points_accumulator.emplace_back(p2_merge_pp);
            poseidon2_T_prev_commitments = p2_merged;

            current_stdlib_verifier_accumulator = output_verifier_accumulator;
            stdlib_verification_queue.pop_front();
        }

        // Set public inputs
        PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

        if (is_hiding_kernel) {
            Chonk::hide_op_queue_content_in_hiding(circuit);

            HidingKernelV2IO hiding_output;
            hiding_output.pairing_inputs = pairing_points_aggregator;
            hiding_output.kernel_return_data = bus_depot.get_kernel_return_data_commitment(circuit);
            hiding_output.ecc_op_tables = ecc_T_prev_commitments;
            hiding_output.poseidon2_op_tables = poseidon2_T_prev_commitments;
            hiding_output.set_public();
        } else {
            recursive_verifier_native_accum = current_stdlib_verifier_accumulator->get_value<VerifierAccumulator>();

            KernelV2IO kernel_output;
            kernel_output.pairing_inputs = pairing_points_aggregator;
            kernel_output.kernel_return_data = bus_depot.get_kernel_return_data_commitment(circuit);
            kernel_output.app_return_data = bus_depot.get_app_return_data_commitment(circuit);
            kernel_output.ecc_op_tables = ecc_T_prev_commitments;
            kernel_output.poseidon2_op_tables = poseidon2_T_prev_commitments;
            RecursiveTranscript hash_transcript;
            kernel_output.output_hn_accum_hash =
                current_stdlib_verifier_accumulator->hash_with_origin_tagging(hash_transcript);
            kernel_output.set_public();
        }
    }

    QUEUE_TYPE get_queue_type() const
    {
        if (num_circuits_accumulated == 0)
            return QUEUE_TYPE::OINK;
        if (num_circuits_accumulated < num_circuits - 3)
            return QUEUE_TYPE::HN;
        if (num_circuits_accumulated == num_circuits - 3)
            return QUEUE_TYPE::HN_TAIL;
        if (num_circuits_accumulated == num_circuits - 2)
            return QUEUE_TYPE::HN_FINAL;
        if (num_circuits_accumulated == num_circuits - 1)
            return QUEUE_TYPE::MEGA;
        return QUEUE_TYPE{};
    }

    void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk)
    {
        // Share poseidon2_op_queue between builder and GoblinV2
        if (!circuit.poseidon2_op_queue) {
            circuit.poseidon2_op_queue = goblin.poseidon2_op_queue;
        }

        std::shared_ptr<ProverInstance> prover_instance = std::make_shared<ProverInstance>(circuit);

        bool is_kernel = verification_queue.empty() && num_circuits_accumulated > 0;

        if (is_kernel) {
            prover_accumulation_transcript = std::make_shared<Transcript>();
        }

        QUEUE_TYPE queue_type = get_queue_type();
        FoldingProver prover(prover_accumulation_transcript);
        HonkProof proof;

        switch (queue_type) {
        case QUEUE_TYPE::OINK:
            prover_accumulator = prover.instance_to_accumulator(prover_instance, precomputed_vk);
            proof = prover.export_proof();
            break;
        case QUEUE_TYPE::HN:
        case QUEUE_TYPE::HN_TAIL:
            std::tie(proof, prover_accumulator) =
                prover.fold(std::move(prover_accumulator), prover_instance, precomputed_vk);
            break;
        case QUEUE_TYPE::HN_FINAL: {
            std::tie(proof, prover_accumulator) =
                prover.fold(std::move(prover_accumulator), prover_instance, precomputed_vk);
            DeciderProver decider(prover_accumulation_transcript);
            decider_proof = decider.construct_proof(prover_accumulator);
            break;
        }
        case QUEUE_TYPE::MEGA:
            prover_instance.reset();
            proof = construct_honk_proof_for_hiding_kernel(circuit, precomputed_vk);
            break;
        }

        verification_queue.push_back(
            VerifierInputs{ std::move(proof), precomputed_vk, queue_type, is_kernel });

        // Construct merge proofs (excluded for hiding kernel)
        if (queue_type != QUEUE_TYPE::MEGA) {
            goblin.prove_merge(prover_accumulation_transcript);
            goblin.prove_poseidon2_merge(prover_accumulation_transcript);
        }

        num_circuits_accumulated++;
    }

    ChonkV2Proof prove()
    {
        prover_accumulator = ProverAccumulator();
        auto mega_proof = verification_queue.front().proof;
        goblin.transcript = transcript;
        return ChonkV2Proof{ mega_proof, goblin.prove() };
    }

  private:
    HonkProof construct_honk_proof_for_hiding_kernel(ClientCircuit& circuit,
                                                     const std::shared_ptr<MegaVerificationKey>& verification_key)
    {
        auto hiding_prover_inst = std::make_shared<DeciderZKProvingKey>(circuit);
        UltraProver_<MegaV2ZKFlavor> prover(hiding_prover_inst, verification_key, transcript);
        return prover.construct_proof();
    }
};

} // namespace bb
