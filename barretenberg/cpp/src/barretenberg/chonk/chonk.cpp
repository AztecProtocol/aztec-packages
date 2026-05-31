// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include <array>

namespace bb {

// Constructor
Chonk::Chonk(size_t num_circuits)
    : num_circuits(num_circuits)
{
    BB_ASSERT_GTE(num_circuits, 4UL, "Number of circuits must be at least 4 (get_queue_type uses num_circuits - 3).");
}

/**
 * @brief Instantiate a stdlib verification queue for use in the kernel completion logic
 * @details Construct a stdlib proof/verification_key for each entry in the native verification queue. By default, both
 * are constructed from their counterpart in the native queue. Alternatively, Stdlib verification keys can be provided
 * directly as input to this method. (The later option is used, for example, when constructing recursive verifiers based
 * on the verification key witnesses from an acir recursion constraint. This option is not provided for proofs since
 * valid proof witnesses are in general not known at the time of acir constraint generation).
 *
 * @param circuit
 */
void Chonk::instantiate_stdlib_verification_queue(ClientCircuit& circuit,
                                                  const std::vector<std::shared_ptr<RecursiveVKAndHash>>& input_keys)
{
    bool vkeys_provided = !input_keys.empty();
    if (vkeys_provided) {
        BB_ASSERT_EQ(verification_queue.size(),
                     input_keys.size(),
                     "Incorrect number of verification keys provided in "
                     "stdlib verification queue instantiation.");
    }

    size_t key_idx = 0;
    while (!verification_queue.empty()) {
        const VerifierInputs& entry = verification_queue.front();

        // Construct stdlib proof directly from the internal native queue data
        StdlibProof stdlib_proof(circuit, entry.proof);

        // Use the provided stdlib vkey if present, otherwise construct one from the internal native queue
        std::shared_ptr<RecursiveVKAndHash> stdlib_vk_and_hash;
        if (vkeys_provided) {
            stdlib_vk_and_hash = input_keys[key_idx++];
        } else {
            stdlib_vk_and_hash = std::make_shared<RecursiveVKAndHash>(circuit, entry.honk_vk);
        }

        stdlib_verification_queue.emplace_back(stdlib_proof, stdlib_vk_and_hash, entry.type, entry.is_kernel);

        verification_queue.pop_front(); // the native data is not needed beyond this point
    }
}

/**
 * @brief Perform recursive folding verification for a single circuit in the IVC
 * @details Runs the appropriate folding verifier (Oink for first app, HyperNova for subsequent circuits) and returns
 * the resulting accumulator. For HN_FINAL (tail kernel), also runs the decider verifier and returns its pairing points.
 *
 * @param circuit
 * @param verifier_inputs {proof, vkey, type (Oink/HN)} A set of inputs for recursive verification
 * @param verifier_instance The instance to be folded into the running accumulator
 * @param accumulation_recursive_transcript Transcript shared across recursive verification of the folding of
 * K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app)
 *
 */
Chonk::FoldingResult Chonk::verify_folding(
    ClientCircuit& circuit,
    const StdlibVerifierInputs& verifier_inputs,
    const std::shared_ptr<RecursiveVerifierInstance>& verifier_instance,
    const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript) const
{
    std::vector<PairingPoints> pairing_points;
    std::optional<RecursiveVerifierAccumulator> output_accumulator;

    RecursiveFoldingVerifier folding_verifier(accumulation_recursive_transcript);
    switch (verifier_inputs.type) {
    case QUEUE_TYPE::OINK: {
        vinfo("Recursively verifying accumulation of the first app circuit.");
        auto [_, new_verifier_accumulator] =
            folding_verifier.instance_to_accumulator(verifier_instance, verifier_inputs.proof);
        output_accumulator = std::move(new_verifier_accumulator);
        break;
    }
    case QUEUE_TYPE::HN:
    case QUEUE_TYPE::HN_TAIL: {
        vinfo("Recursively verifying inner accumulation.");
        auto [_first_verified, _second_verified, new_verifier_accumulator] =
            folding_verifier.verify_folding_proof(verifier_instance, verifier_inputs.proof);
        output_accumulator = std::move(new_verifier_accumulator);
        break;
    }
    case QUEUE_TYPE::HN_FINAL: {
        vinfo("Recursively verifying accumulation of the tail kernel.");
        BB_ASSERT_EQ(stdlib_verification_queue.size(), size_t(1));

        auto [_first_verified, _second_verified, final_verifier_accumulator] =
            folding_verifier.verify_folding_proof(verifier_instance, verifier_inputs.proof);

        RecursiveDeciderVerifier decider_verifier(accumulation_recursive_transcript);
        StdlibProof stdlib_decider_proof(circuit, decider_proof);
        pairing_points.emplace_back(decider_verifier.verify_proof(final_verifier_accumulator, stdlib_decider_proof));
        break;
    }
    default: {
        throw_or_abort("Invalid queue type! Only OINK, HN, HN_TAIL and HN_FINAL are supported");
    }
    }

    return { std::move(output_accumulator), std::move(pairing_points) };
}

/**
 * @brief Process public inputs from a verified circuit and perform databus consistency checks
 * @details For kernel circuits: reconstructs KernelIO from public inputs, verifies that databus return data commitments
 * match witness commitments, checks accumulator hash consistency, and returns the kernel's ECC op running hash.
 * For app circuits: reconstructs AppIO from public inputs and extracts pairing points.
 * In both cases, updates the bus depot with the appropriate return data commitment.
 *
 * @param verifier_inputs {proof, vkey, type (Oink/HN)} A set of inputs for recursive verification
 * @param public_inputs The public inputs extracted from the verifier instance that was folded into the running
 * accumulator
 * @param witness_commitments The witness commitments extracted from the verifier instance that was folded into the
 * running accumulator
 * @param prev_accum_hash The accumulator hash from the previous kernel
 */
Chonk::PublicInputsResult Chonk::process_public_inputs_and_consistency_checks(
    const StdlibVerifierInputs& verifier_inputs,
    std::vector<StdlibFF>& public_inputs,
    WitnessCommitments& witness_commitments,
    const std::optional<StdlibFF>& prev_accum_hash)
{
    if (verifier_inputs.is_kernel) {
        BB_ASSERT_EQ(verifier_inputs.type == QUEUE_TYPE::HN || verifier_inputs.type == QUEUE_TYPE::HN_TAIL ||
                         verifier_inputs.type == QUEUE_TYPE::HN_FINAL,
                     true,
                     "Kernel circuits should be folded.");

        // ============= Reconstruct the public inputs of the previous kernel =============

        KernelIO kernel_input; // pairing points, ecc op tables, databus commitments
        kernel_input.reconstruct_from_public(public_inputs);

        // ============= Perform databus consistency checks ===============================

        // Kernel return data.
        // Native commitment values are not canonical for empty/point-at-infinity databus columns, so they can differ
        // here even when the in-circuit `incomplete_assert_equal` constraint (which canonicalizes infinity to (0, 0))
        // holds and the proof is valid. Emit a diagnostic rather than asserting, matching ChonkRecursiveVerifier.
        if (kernel_input.kernel_return_data.get_value() != witness_commitments.kernel_calldata.get_value()) {
            info("Chonk: kernel_return_data / kernel_calldata native commitment mismatch (empty databus)");
        }
        kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.kernel_calldata);

        const std::array app_calldata_commitments{ &witness_commitments.first_app_calldata,
                                                   &witness_commitments.second_app_calldata,
                                                   &witness_commitments.third_app_calldata };
        for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
            if (kernel_input.app_return_data[idx].get_value() != app_calldata_commitments[idx]->get_value()) {
                info("Chonk: app_return_data / app_calldata native commitment mismatch (empty databus), app ", idx);
            }
            kernel_input.app_return_data[idx].incomplete_assert_equal(*app_calldata_commitments[idx]);
        }

        // ============= Perform accumulator hash consistency check =========================

        info("Accumulator hash from IO: ", kernel_input.output_hn_accum_hash);
        BB_ASSERT(prev_accum_hash.has_value());
        bool accum_hash_match = kernel_input.output_hn_accum_hash.get_value() == prev_accum_hash->get_value();
        BB_ASSERT_DEBUG(accum_hash_match,
                        "output_hn_accum_hash mismatch: proof contains "
                            << kernel_input.output_hn_accum_hash.get_value() << " but expected "
                            << prev_accum_hash->get_value());
        kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);

        // ============= Set the kernel return data commitment ==============================

        bus_depot.set_kernel_return_data_commitment(witness_commitments.return_data);

        return { std::move(kernel_input.pairing_inputs), std::move(kernel_input.ecc_op_hash) };
    }

    // App circuit path
    AppIO app_input; // pairing points
    app_input.reconstruct_from_public(public_inputs);

    // Set the app return data commitment to be propagated via the public inputs. The depot owns slot allocation.
    bus_depot.set_app_return_data_commitment(witness_commitments.return_data);

    return { std::move(app_input.pairing_inputs), std::nullopt };
}

/**
 * @brief Orchestrate recursive verification, databus consistency checks, and merge verification for a single circuit.
 * @details Delegates to three steps: (1) recursive folding verification via verify_folding, (2) public inputs
 * processing and databus consistency checks via process_public_inputs_and_consistency_checks, and (3) merge recursive
 * verification. Returns the output accumulator, aggregated pairing points, and merged table commitments.
 *
 * @param circuit
 * @param verifier_inputs {proof, vkey, type (Oink/HN)} A set of inputs for recursive verification
 * @param input_verifier_accumulator The accumulator from the previous step of recursive verification
 * @param running_hash Running hash of ECC-op column commitments from prior steps in this kernel.
 * @param accumulation_recursive_transcript Transcript shared across recursive verification of the folding of
 * K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app)
 */
std::tuple<std::optional<Chonk::RecursiveVerifierAccumulator>, std::vector<Chonk::PairingPoints>, Chonk::StdlibFF>
Chonk::recursive_verification_and_consistency_checks(
    ClientCircuit& circuit,
    const StdlibVerifierInputs& verifier_inputs,
    const std::optional<RecursiveVerifierAccumulator>& input_verifier_accumulator,
    const std::optional<StdlibFF>& running_hash,
    const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript)
{
    BB_BENCH_NAME("Chonk::recursive_verification_and_consistency_checks");

    auto verifier_instance = std::make_shared<RecursiveVerifierInstance>(verifier_inputs.honk_vk_and_hash);

    // Compute prev_accum_hash before folding (transcript state changes during verification)
    std::optional<StdlibFF> prev_accum_hash;
    if (verifier_inputs.is_kernel) {
        BB_ASSERT(input_verifier_accumulator.has_value(), "Previous accumulator expected for kernel circuit folding");
        prev_accum_hash = input_verifier_accumulator->hash_with_origin_tagging(*accumulation_recursive_transcript);
    }

    // Step 1: Recursive folding verification
    if (verifier_inputs.type == QUEUE_TYPE::OINK) {
        BB_ASSERT_EQ(input_verifier_accumulator.has_value(), false);
    }
    auto [output_accumulator, folding_points] =
        verify_folding(circuit, verifier_inputs, verifier_instance, accumulation_recursive_transcript);

    // Extract the witness commitments and public inputs from the verified instance
    WitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
    std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);

    // Step 2: Process public inputs and perform databus consistency checks
    auto [io_pairing_points, previous_ecc_op_hash] = process_public_inputs_and_consistency_checks(
        verifier_inputs, public_inputs, witness_commitments, prev_accum_hash);

    std::optional<StdlibFF> updated_hash = running_hash;
    if (previous_ecc_op_hash.has_value()) {
        BB_ASSERT_EQ(verifier_inputs.is_kernel, true, "previous_ecc_op_hash should only be set for kernels");
        BB_ASSERT(!running_hash.has_value(), "Running hash should not be set when recursively verifying a kernel");
        updated_hash = previous_ecc_op_hash.value();
    }

    // Step 3: Update the running ECC op hash with this circuit's ECC op column commitments.
    auto ecc_op_col_commitments = witness_commitments.get_ecc_op_wires().get_copy();
    const std::vector<RecursiveCommitment> ecc_op_col_commitments_vec(ecc_op_col_commitments.begin(),
                                                                      ecc_op_col_commitments.end());
    updated_hash = Goblin::BatchMergeRecursiveVerifier::ecc_op_hash_step(ecc_op_col_commitments_vec, updated_hash);

    // Combine all pairing points
    std::vector<PairingPoints> all_points;
    all_points.insert(all_points.end(), folding_points.begin(), folding_points.end());
    all_points.emplace_back(std::move(io_pairing_points));

    return { std::move(output_accumulator), std::move(all_points), updated_hash.value() };
}

/**
 * @brief Append logic to complete a kernel circuit
 *
 * @details This is the verifier counterpart to prover's `accumulate()`. While `accumulate()` creates
 * proofs for each circuit, this method adds recursive verification constraints to kernel circuits.
 *
 * The method performs the following steps:
 *   1. SETUP: Initialize transcript and determine kernel type
 *   2. VERIFICATION LOOP: Process each entry in stdlib_verification_queue (folding + merge + databus)
 *   3. OUTPUT: Set public inputs (KernelIO or HidingKernelIO) for propagation to next kernel
 *
 * @param circuit The kernel circuit to append verification logic to
 */
void Chonk::complete_kernel_circuit_logic(ClientCircuit& circuit)
{
    BB_BENCH_NAME("Chonk::complete_kernel_circuit_logic");
    // Step 1: SETUP - Initialize state and determine kernel type

    // Transcript is shared across recursive verification of the folding of K_{i-1} (kernel) and A_{i} (app)
    auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();

    // Running Poseidon2 hash over ECC op column commitments, propagated through kernel public inputs.
    std::optional<StdlibFF> running_hash = std::nullopt;

    // Convert native verification queue to circuit witnesses
    if (stdlib_verification_queue.empty()) {
        instantiate_stdlib_verification_queue(circuit);
    }

    // Determine kernel type from queue contents
    bool is_init_kernel = stdlib_verification_queue.front().type == QUEUE_TYPE::OINK;

    bool is_hiding_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::HN_FINAL);

    // The ECC-op subtable for a kernel begins with an eq-and-reset to ensure that the preceding circuit's subtable
    // cannot affect the ECC-op accumulator for the kernel.
    circuit.queue_ecc_eq();

    // Step 2: VERIFICATION LOOP - Recursively verify each proof in the queue

    BB_ASSERT(bus_depot.app_return_data_slots_are_empty(),
              "DataBusDepot has stale app return-data slots at kernel-completion boundary");

    std::vector<PairingPoints> points_accumulator;
    std::optional<RecursiveVerifierAccumulator> current_stdlib_verifier_accumulator;
    if (!is_init_kernel) {
        current_stdlib_verifier_accumulator = RecursiveVerifierAccumulator::stdlib_from_native<RecursiveFlavor::Curve>(
            &circuit, recursive_verifier_native_accum);
    }
    while (!stdlib_verification_queue.empty()) {
        const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();

        auto [output_stdlib_verifier_accumulator, pairing_points, updated_hash] =
            recursive_verification_and_consistency_checks(circuit,
                                                          verifier_input,
                                                          current_stdlib_verifier_accumulator,
                                                          running_hash,
                                                          accumulation_recursive_transcript);
        points_accumulator.insert(points_accumulator.end(), pairing_points.begin(), pairing_points.end());
        running_hash = updated_hash;

        // Update the output verifier accumulator
        current_stdlib_verifier_accumulator = output_stdlib_verifier_accumulator;

        stdlib_verification_queue.pop_front();
    }

    // Step 3: OUTPUT - Set public inputs for propagation to next kernel
    BB_ASSERT_EQ(running_hash.has_value(), true, "Running hash should be set for public input propagation");

    // Output differs based on kernel type: HidingKernelIO (no accum hash) vs KernelIO (with accum hash)
    if (is_hiding_kernel) {
        BB_ASSERT_EQ(current_stdlib_verifier_accumulator.has_value(), false);

        // Perform batch merge verification
        auto [batch_pairing_points, batch_merged_table_commitments] =
            goblin.recursively_verify_batch_merge(circuit, running_hash.value());

        // Append batch merge pairing points to the list of pairing points
        points_accumulator.emplace_back(batch_pairing_points);

        // Compute aggregated pairing points for output
        PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

        // Add randomness at the end of the hiding kernel (whose ecc ops fall right at the end of the op queue table) to
        // ensure the Chonk proof doesn't leak information about the actual content of the op queue
        hide_op_queue_content_in_hiding(circuit);

        HidingKernelIO hiding_output{ pairing_points_aggregator,
                                      bus_depot.get_kernel_return_data_commitment(circuit),
                                      std::move(batch_merged_table_commitments) };
        hiding_output.set_public();
    } else {
        BB_ASSERT_NEQ(current_stdlib_verifier_accumulator.has_value(), false);

        // Compute aggregated pairing points for output
        PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

        // Extract native verifier accumulator from the stdlib accum to use it in the next round
        recursive_verifier_native_accum = current_stdlib_verifier_accumulator->get_value<VerifierAccumulator>();

        auto kernel_return_data_commitment = bus_depot.get_kernel_return_data_commitment(circuit);
        KernelIO::AppReturnDataCommitments app_return_data_commitments;
        for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
            app_return_data_commitments[idx] = bus_depot.get_app_return_data_commitment(circuit, idx);
        }

        // Compute hash of output accumulator
        RecursiveTranscript hash_transcript;
        StdlibFF current_verifier_accum_hash =
            current_stdlib_verifier_accumulator->hash_with_origin_tagging(hash_transcript);
        info("Kernel output accumulator hash: ", current_verifier_accum_hash);
#ifndef NDEBUG
        info("Chonk recursive verification: accumulator hash set in the public inputs matches the one "
             "computed natively: ",
             current_verifier_accum_hash.get_value() == native_verifier_accum_hash ? "true" : "false");
#endif

        // Propagate public inputs
        KernelIO kernel_output{ pairing_points_aggregator,
                                kernel_return_data_commitment,
                                app_return_data_commitments,
                                running_hash.value(),
                                current_verifier_accum_hash };
        kernel_output.set_public();
    }
}

/**
 * @brief Get queue type for the proof of a circuit about to be accumulated based on num circuits accumulated so far.
 */
Chonk::QUEUE_TYPE Chonk::get_queue_type() const
{
    // first app
    if (num_circuits_accumulated == 0) {
        return QUEUE_TYPE::OINK;
    }
    // app (excluding first) or kernel (inner or reset)
    if (num_circuits_accumulated < num_circuits - 3) {
        return QUEUE_TYPE::HN;
    }
    // last kernel prior to tail kernel
    if (num_circuits_accumulated == num_circuits - 3) {
        return QUEUE_TYPE::HN_TAIL;
    }
    // tail kernel
    if (num_circuits_accumulated == num_circuits - 2) {
        return QUEUE_TYPE::HN_FINAL;
    }
    // hiding kernel
    if (num_circuits_accumulated == num_circuits - 1) {
        return QUEUE_TYPE::MEGA;
    }
    throw_or_abort("Chonk::get_queue_type: num_circuits_accumulated out of range");
}

/**
 * @brief Build the hiding kernel's ZK proving key and verification key (proving is deferred to prove()).
 */
void Chonk::accumulate_hiding_kernel(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk)
{
    BB_BENCH_NAME("Chonk::accumulate_hiding_kernel");
    vinfo("Constructing hiding kernel instance (proving deferred to prove())");
    hiding_prover_inst = std::make_shared<HidingKernelProverInstance>(circuit);
    // Free circuit block memory now that trace data has been copied to prover polynomials
    for (auto& block : circuit.blocks.get()) {
        block.free_data();
    }
    // MegaZKFlavor inherits VerificationKey from MegaFlavor unchanged, so MegaZKVerificationKey
    // and MegaVerificationKey are the same type. Reuse the caller-supplied precomputed VK when
    // present to skip the 31 sequential commitments in the NativeVerificationKey_ ctor.
    static_assert(
        std::is_same_v<MegaVerificationKey, MegaZKVerificationKey>,
        "hiding-kernel precomputed VK reuse relies on MegaZKFlavor inheriting VerificationKey from MegaFlavor");
    if (precomputed_vk) {
        hiding_vk = precomputed_vk;
    } else {
        hiding_vk = std::make_shared<MegaZKVerificationKey>(hiding_prover_inst->get_precomputed());
    }

    // Push VK to queue so get_hiding_kernel_vk_and_hash() can find it.
    VerifierInputs queue_entry{ {}, hiding_vk, QUEUE_TYPE::MEGA, /*is_kernel=*/true };
    verification_queue.push_back(queue_entry);
    num_circuits_accumulated++;
}

/**
 * @brief Perform HyperNova folding for a circuit and produce the corresponding merge proof.
 *
 * @details Handles OINK (first app), HN (inner folding), HN_TAIL (last pre-tail), and HN_FINAL (tail + decider).
 *
 * @param circuit The circuit to fold
 * @param precomputed_vk Precomputed verification key for the circuit
 * @param queue_type The folding type for this circuit
 * @param prover_instance Pre-built prover instance (from debug path) or nullptr
 */
void Chonk::accumulate_and_fold(ClientCircuit& circuit,
                                const std::shared_ptr<MegaVerificationKey>& precomputed_vk,
                                QUEUE_TYPE queue_type,
                                std::shared_ptr<ProverInstance> prover_instance)
{
    BB_BENCH_NAME("Chonk::accumulate_and_fold");
    // Construct the prover instance for circuit (may already exist from debug path)
    if (!prover_instance) {
        prover_instance = std::make_shared<ProverInstance>(circuit);
    }

    // Free circuit block memory (wires and selectors) now that they've been copied to prover polynomials
    for (auto& block : circuit.blocks.get()) {
        block.free_data();
    }

    // We're accumulating a kernel if the verification queue is empty (because the kernel circuit contains recursive
    // verifiers for all the entries previously present in the verification queue) and if it's not the first accumulate
    // call (which will always be for an app circuit).
    bool is_kernel = verification_queue.empty() && num_circuits_accumulated > 0;

    // Transcript to be shared across folding of K_{i} (kernel) (the current kernel), A_{i+1,1} (app), .., A_{i+1,
    // n} (app)
    if (is_kernel) {
        prover_accumulation_transcript = std::make_shared<Transcript>();
    }

#ifndef NDEBUG
    // Make a copy of the prover_accumulation_transcript for the native verifier to use, only happens in debugging
    // builds
    auto verifier_transcript =
        Transcript::convert_prover_transcript_to_verifier_transcript(prover_accumulation_transcript);
#endif

    FoldingProver prover(prover_accumulation_transcript);
    HonkProof proof;
    switch (queue_type) {
    case QUEUE_TYPE::OINK:
        vinfo("Accumulating first app circuit");
        BB_ASSERT_EQ(is_kernel, false, "First circuit accumulated must always be an app");

        prover_accumulator = prover.instance_to_accumulator(prover_instance, precomputed_vk);
        proof = prover.export_proof();
        break;
    case QUEUE_TYPE::HN:
    case QUEUE_TYPE::HN_TAIL:
        vinfo("Accumulating circuit number ", num_circuits_accumulated + 1);
        // Move old accumulator into fold, receive new accumulator back
        std::tie(proof, prover_accumulator) =
            prover.fold(std::move(prover_accumulator), prover_instance, precomputed_vk);
        break;
    case QUEUE_TYPE::HN_FINAL: {
        vinfo("Accumulating tail kernel");
        // Move old accumulator into fold, receive new accumulator back
        std::tie(proof, prover_accumulator) =
            prover.fold(std::move(prover_accumulator), prover_instance, precomputed_vk);
        // Decider uses the NEW prover_accumulator (result of fold)
        DeciderProver decider(prover_accumulation_transcript);
        decider_proof = decider.construct_proof(prover_accumulator);
        break;
    }
    default:
        BB_ASSERT(false, "Unexpected queue type");
        break;
    }

    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_accumulate");
        detail::GLOBAL_MEMORY_PROFILE.next_circuit();
    }

    VerifierInputs queue_entry{ std::move(proof), precomputed_vk, queue_type, is_kernel };
    verification_queue.push_back(queue_entry);

#ifndef NDEBUG
    update_native_verifier_accumulator(queue_entry, verifier_transcript);
#endif
    // Keep one subtable per folded circuit and prove the batched merge after the tail kernel.
    goblin.op_queue->merge();

    num_circuits_accumulated++;
}

/**
 * @brief Execute prover work for accumulation (e.g. HN folding, merge proving)
 *
 * @details Dispatches to accumulate_hiding_kernel (for MEGA/hiding kernel) or accumulate_and_fold (for all
 * folding-based queue types). See chonk.hpp QUEUE_TYPE for the full state machine.
 *
 * @param circuit The circuit to accumulate
 * @param precomputed_vk Precomputed verification key for the circuit
 */
void Chonk::accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk)
{
    BB_BENCH_NAME("Chonk::accumulate");
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");
    BB_ASSERT(precomputed_vk != nullptr, "Chonk::accumulate - VK expected for the provided circuit");

    QUEUE_TYPE queue_type = get_queue_type();

    std::shared_ptr<ProverInstance> prover_instance;
#ifndef NDEBUG
    prover_instance = std::make_shared<ProverInstance>(circuit);
    debug_incoming_circuit(circuit, prover_instance, precomputed_vk);
#endif

    if (queue_type == QUEUE_TYPE::MEGA) {
        accumulate_hiding_kernel(circuit, precomputed_vk);
    } else {
        accumulate_and_fold(circuit, precomputed_vk, queue_type, std::move(prover_instance));
    }

    prover_instance.reset();
    if (queue_type == QUEUE_TYPE::HN_FINAL) {
        prover_accumulator = ProverAccumulator(); // Free the prover accumulator now that it's no longer needed in the
                                                  // remaining fold of the hiding kernel
        goblin.prove_batch_merge();
    }
}

/**
 * @brief Adds two random non-ops to the hiding kernel for zero-knowledge.
 *
 * @details See MERGE_PROTOCOL.md (ZK Considerations) for detailed analysis.
 */
void Chonk::hide_op_queue_content_in_hiding(ClientCircuit& circuit)
{
    circuit.queue_ecc_random_op();
    circuit.queue_ecc_random_op();
}

/**
 * @brief Construct Chonk proof using the batched MegaZK + Translator protocol.
 *
 * @details Orchestrates the batched proving flow on a shared transcript:
 *   1. MegaZK Oink (pre-sumcheck commitments for the hiding kernel)
 *   2. Merge proof (fixed-location append of the final subtable from the hiding kernel)
 *   3. ECCVM proof (produces translation challenges v, x)
 *   4. IPA proof (separate transcript)
 *   5. Translator Oink + Joint sumcheck + Joint PCS
 *
 * The joint sumcheck and PCS batch the MegaZK and translator circuits together,
 * eliminating separate sumcheck/PCS phases and reducing proof size.
 */
ChonkProof Chonk::prove()
{
    BB_BENCH_NAME("Chonk::prove");

    // Share transcript between all provers.
    goblin.transcript = transcript;

    // Phase 1: MegaZK Oink on the shared transcript.
    BatchedHonkTranslatorProver batched_prover(hiding_prover_inst, hiding_vk, transcript);
    auto hiding_oink_proof = batched_prover.prove_mega_zk_oink();

    // Phase 2: Merge proof on the shared transcript (fixed append — hiding kernel's subtable).
    auto merge_proof = goblin.prove_merge(transcript);
    info("Goblin: num ultra ops = ", goblin.op_queue->get_ultra_ops_count());

    // Phase 3: ECCVM proof on the shared transcript.
    vinfo("prove eccvm...");
    goblin.prove_eccvm();
    vinfo("finished eccvm proving.");

    // Phase 4: Build translator proving key from ECCVM-derived challenges.
    TranslatorCircuitBuilder translator_builder(
        goblin.translation_batching_challenge_v, goblin.evaluation_challenge_x, goblin.op_queue);
    auto translator_key = std::make_shared<TranslatorProvingKey>(translator_builder);

    // Phase 5: Translator Oink + Joint Sumcheck + Joint PCS on the shared transcript.
    vinfo("prove translator and joint...");
    auto joint_proof = batched_prover.prove(translator_key);
    vinfo("finished translator and joint proving.");

    // Release the hiding kernel instance now that proving is complete.
    hiding_prover_inst.reset();

    return ChonkProof{ std::move(hiding_oink_proof),
                       std::move(merge_proof),
                       std::move(goblin.goblin_proof.eccvm_proof),
                       std::move(goblin.goblin_proof.ipa_proof),
                       std::move(joint_proof) };
}

std::shared_ptr<MegaZKFlavor::VKAndHash> Chonk::get_hiding_kernel_vk_and_hash() const
{
    BB_ASSERT_EQ(verification_queue.size(), 1UL, "Expected single hiding kernel VK in queue");
    BB_ASSERT(verification_queue.front().type == QUEUE_TYPE::MEGA, "Expected MEGA proof type");
    return std::make_shared<MegaZKFlavor::VKAndHash>(verification_queue.front().honk_vk);
}

#ifndef NDEBUG
void Chonk::update_native_verifier_accumulator(const VerifierInputs& queue_entry,
                                               const std::shared_ptr<Transcript>& verifier_transcript)
{
    info("======= DEBUGGING INFO FOR NATIVE FOLDING STEP =======");

    auto verifier_inst =
        std::make_shared<VerifierInstance>(std::make_shared<MegaFlavor::VKAndHash>(queue_entry.honk_vk));

    FoldingVerifier native_verifier(verifier_transcript);
    if (queue_entry.type == QUEUE_TYPE::OINK) {
        auto [_first_verified, new_accumulator] =
            native_verifier.instance_to_accumulator(verifier_inst, queue_entry.proof);
        native_verifier_accum = std::move(new_accumulator);

        info("Sumcheck: instance to accumulator verified: ", _first_verified ? "true" : "false");
    } else {
        auto [_first_verified, _second_verified, new_accumulator] =
            native_verifier.verify_folding_proof(verifier_inst, queue_entry.proof);
        native_verifier_accum = std::move(new_accumulator);

        info("Sumcheck: instance to accumulator verified: ", _first_verified ? "true" : "false");
        info("Sumcheck: batch two accumulators verified: ", _second_verified ? "true" : "false");

        if (queue_entry.type == QUEUE_TYPE::HN_FINAL) {
            HypernovaDeciderVerifier<MegaFlavor> decider_verifier(verifier_transcript);
            bb::PairingPoints<curve::BN254> pairing_points =
                decider_verifier.verify_proof(native_verifier_accum, decider_proof);

            info("Decider: pairing points verified? ", pairing_points.check() ? "true" : "false");
        }
    }

    info("Chonk accumulate: prover and verifier accumulators match: ",
         prover_accumulator.compare_with_verifier_claim(native_verifier_accum) ? "true" : "false");

    // Update the native verifier accumulator hash if we are accumulating an app (i.e. the previous circuit was a
    // kernel) or if the last app has been accumulated (i.e. the current circuit is the tail kernel)
    bool update_verifier_accum_hash = is_previous_circuit_a_kernel || has_last_app_been_accumulated;
    if (update_verifier_accum_hash) {
        native_verifier_accum_hash = native_verifier_accum.hash_with_origin_tagging(*verifier_transcript);
        info("Chonk accumulate: hash of verifier accumulator computed natively set in previous kernel IO: ",
             native_verifier_accum_hash);
    }
    has_last_app_been_accumulated = num_circuits_accumulated + 1 == num_circuits - 3;
    is_previous_circuit_a_kernel = queue_entry.is_kernel;

    info("======= END OF DEBUGGING INFO FOR NATIVE FOLDING STEP =======");
}

void Chonk::debug_incoming_circuit(ClientCircuit& circuit,
                                   const std::shared_ptr<ProverInstance>& prover_instance,
                                   const std::shared_ptr<MegaVerificationKey>& precomputed_vk)
{
    info("======= DEBUGGING INFO FOR INCOMING CIRCUIT =======");

    info("Accumulating circuit ", num_circuits_accumulated + 1, " of ", num_circuits);
    info("Is the circuit valid? ", CircuitChecker::check(circuit) ? "true" : "false");
    info("Did we find a failure? ", circuit.failed() ? "true" : "false");
    if (circuit.failed()) {
        info("\t\t\tError message? ", circuit.err());
    }

    // Compare precomputed VK with the one generated during accumulation
    auto vk = std::make_shared<MegaVerificationKey>(prover_instance->get_precomputed());
    info("Does the precomputed vk match with the one generated during accumulation? ",
         vk->compare(*precomputed_vk, MegaFlavor::CommitmentLabels().get_precomputed()) ? "true" : "false");

    info("======= END OF DEBUGGING INFO FOR INCOMING CIRCUIT =======");
}
#endif

} // namespace bb
