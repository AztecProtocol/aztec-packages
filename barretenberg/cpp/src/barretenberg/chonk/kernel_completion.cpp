// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/chonk/kernel_completion.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"

namespace bb {

template <typename Circuit>
void KernelCompletion<Circuit>::instantiate_stdlib_verification_queue(
    Circuit& circuit, const std::vector<StdlibCircuitVKAndHash<Circuit>>& input_keys)
{
    const bool vkeys_provided = !input_keys.empty();
    if (vkeys_provided) {
        BB_ASSERT_EQ(ivc.verification_queue.size(),
                     input_keys.size(),
                     "Incorrect number of verification keys provided in "
                     "stdlib verification queue instantiation.");
    }

    size_t input_idx = 0;
    while (!ivc.verification_queue.empty()) {
        const typename Chonk::VerifierInputs& entry = ivc.verification_queue.front();

        StdlibProof stdlib_proof(circuit, entry.proof);

        if (entry.is_kernel()) {
            auto stdlib_vk_and_hash = vkeys_provided
                                          ? std::get<std::shared_ptr<KernelRecursiveVKAndHash>>(input_keys[input_idx])
                                          : std::make_shared<KernelRecursiveVKAndHash>(circuit, entry.kernel_honk_vk);
            stdlib_verification_queue.emplace_back(stdlib_proof, stdlib_vk_and_hash);
        } else {
            auto stdlib_vk_and_hash = vkeys_provided
                                          ? std::get<std::shared_ptr<AppRecursiveVKAndHash>>(input_keys[input_idx])
                                          : std::make_shared<AppRecursiveVKAndHash>(circuit, entry.app_honk_vk);
            stdlib_verification_queue.emplace_back(stdlib_proof, stdlib_vk_and_hash);
        }
        ++input_idx;
        ivc.verification_queue.pop_front(); // the native data is not needed beyond this point
    }
}

template <typename Circuit>
typename KernelCompletion<Circuit>::PublicInputsResult KernelCompletion<Circuit>::process_kernel_public_inputs(
    std::vector<StdlibFF>& public_inputs,
    KernelWitnessCommitments& witness_commitments,
    const std::optional<StdlibFF>& prev_accum_hash)
{
    KernelIO kernel_input; // pairing points, ecc op tables, databus commitments
    kernel_input.reconstruct_from_public(public_inputs);

    // ============= Perform databus consistency checks ===============================

#ifndef NDEBUG
    bool kernel_return_data_match =
        kernel_input.kernel_return_data.get_value() == witness_commitments.kernel_calldata().get_value();
    if (!kernel_return_data_match) {
        info("kernel_return_data mismatch: proof contains ",
             kernel_input.kernel_return_data.get_value(),
             " but kernel_calldata commitment is ",
             witness_commitments.kernel_calldata().get_value());
    }
#endif
    kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.kernel_calldata());

    const std::array app_calldata_commitments{ &witness_commitments.first_app_calldata(),
                                               &witness_commitments.second_app_calldata(),
                                               &witness_commitments.third_app_calldata(),
                                               &witness_commitments.fourth_app_calldata(),
                                               &witness_commitments.fifth_app_calldata() };
    static_assert(std::tuple_size_v<decltype(app_calldata_commitments)> == MAX_APPS_PER_KERNEL,
                  "app_calldata_commitments must list one commitment per app bus column");
    for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
#ifndef NDEBUG
        bool app_return_data_match =
            kernel_input.app_return_data[idx].get_value() == app_calldata_commitments[idx]->get_value();
        if (!app_return_data_match) {
            info("app_return_data mismatch: proof contains ",
                 kernel_input.app_return_data[idx].get_value(),
                 " but app calldata commitment ",
                 idx,
                 " is ",
                 app_calldata_commitments[idx]->get_value());
        }
#endif
        kernel_input.app_return_data[idx].incomplete_assert_equal(*app_calldata_commitments[idx]);
    }

    // ============= Perform accumulator hash consistency check =========================

    info("Accumulator hash from IO: ", kernel_input.output_hn_accum_hash);
    BB_ASSERT(prev_accum_hash.has_value());
#ifndef NDEBUG
    bool accum_hash_match = kernel_input.output_hn_accum_hash.get_value() == prev_accum_hash->get_value();
    if (!accum_hash_match) {
        info("output_hn_accum_hash mismatch: proof contains ",
             kernel_input.output_hn_accum_hash.get_value(),
             " but expected ",
             prev_accum_hash->get_value());
    }
#endif
    kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);

    bus_depot.set_kernel_return_data_commitment(witness_commitments.return_data());

    return { std::move(kernel_input.pairing_inputs), std::move(kernel_input.ecc_op_hash) };
}

template <typename Circuit>
typename KernelCompletion<Circuit>::PublicInputsResult KernelCompletion<Circuit>::process_app_public_inputs(
    std::vector<StdlibFF>& public_inputs, AppWitnessCommitments& witness_commitments)
{
    stdlib::recursion::honk::AppIO<Circuit> app_input; // pairing points
    app_input.reconstruct_from_public(public_inputs);
    bus_depot.set_app_return_data_commitment(witness_commitments.return_data());
    return { std::move(app_input.pairing_inputs), std::nullopt };
}

template <typename Circuit>
std::pair<typename KernelCompletion<Circuit>::PairingPoints, typename KernelCompletion<Circuit>::EccOpRunningHash>
KernelCompletion<Circuit>::recursive_verification_and_consistency_checks(
    const StdlibVerifierInputs& verifier_inputs,
    FoldingRecursiveVerifier& folding_verifier,
    const std::optional<StdlibFF>& prev_stdlib_acc_hash,
    const std::optional<EccOpRunningHash>& running_ecc_op_hash)
{
    BB_BENCH_NAME("KernelCompletion::recursive_verification_and_consistency_checks");

    // Step 1: Run sumcheck on the incoming instance and cache its claim in the folding verifier.
    PublicInputsResult public_inputs_result;
    std::vector<RecursiveCommitment> ecc_op_col_commitments_vec;

    if (verifier_inputs.is_kernel()) {
        auto verifier_instance =
            std::make_shared<KernelRecursiveVerifierInstance>(verifier_inputs.kernel_honk_vk_and_hash);
        folding_verifier.template accumulate_instance<KernelRecursiveFlavor>(verifier_instance, verifier_inputs.proof);

        KernelWitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
        std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);
        public_inputs_result = process_kernel_public_inputs(public_inputs, witness_commitments, prev_stdlib_acc_hash);

        auto ecc_op_col_commitments = witness_commitments.get_ecc_op_wires().get_copy();
        ecc_op_col_commitments_vec.assign(ecc_op_col_commitments.begin(), ecc_op_col_commitments.end());
    } else {
        auto verifier_instance = std::make_shared<AppRecursiveVerifierInstance>(verifier_inputs.app_honk_vk_and_hash);
        folding_verifier.template accumulate_instance<AppRecursiveFlavor>(verifier_instance, verifier_inputs.proof);

        AppWitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
        std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);
        public_inputs_result = process_app_public_inputs(public_inputs, witness_commitments);

        auto ecc_op_col_commitments = witness_commitments.get_ecc_op_wires().get_copy();
        ecc_op_col_commitments_vec.assign(ecc_op_col_commitments.begin(), ecc_op_col_commitments.end());
    }

    // Step 2: Update the running ECC op hash with this circuit's ECC op column commitments.
    std::optional<StdlibFF> updated_hash = running_ecc_op_hash;
    if (public_inputs_result.ecc_op_hash.has_value()) {
        BB_ASSERT_EQ(verifier_inputs.is_kernel(), true, "previous_ecc_op_hash should only be set for kernels");
        BB_ASSERT(!running_ecc_op_hash.has_value(),
                  "Running ECC op hash should not be set when recursively verifying a kernel");
        updated_hash = public_inputs_result.ecc_op_hash.value();
    }

    updated_hash =
        Goblin::BatchMergeRecursiveVerifier<Circuit>::ecc_op_hash_step(ecc_op_col_commitments_vec, updated_hash);

    return { public_inputs_result.pairing_points, updated_hash.value() };
}

/**
 * @brief Append logic to complete a kernel circuit
 *
 * @details This is the verifier counterpart to prover's `accumulate()`. While `accumulate()` creates
 * proofs for each circuit, this method adds recursive verification constraints to kernel circuits.
 *
 * The method performs the following steps:
 *   1. SETUP: Initialize transcript and determine kernel type
 *   2. VERIFICATION LOOP: Process each entry in stdlib_verification_queue
 *   3. OUTPUT: Set public inputs (KernelIO or HidingKernelIO) for propagation to next kernel
 *
 * @param circuit The kernel circuit to append verification logic to
 */
template <typename Circuit> void KernelCompletion<Circuit>::complete_kernel_circuit_logic(Circuit& circuit)
{
    BB_BENCH_NAME("KernelCompletion::complete_kernel_circuit_logic");
    // Step 1: SETUP - Initialize state and determine kernel type

    // Transcript is shared across recursive verification of the sumchecks of K_{i-1} (kernel) and A_{i}, \dots,
    // A_{i + N} (apps) where N is the number of apps in the group being accumulated in this kernel
    auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();

    // Running Poseidon2 hash over ECC op column commitments, propagated through kernel public inputs.
    std::optional<EccOpRunningHash> running_ecc_op_hash = std::nullopt;

    // Convert native verification queue to circuit witnesses
    if (stdlib_verification_queue.empty()) {
        instantiate_stdlib_verification_queue(circuit);
    }

    // Determine kernel type from circuit kinds and the queued group. The init kernel's group begins with the
    // first app's proof; every later kernel's group begins with the previous kernel's proof. Whether
    // this is the hiding kernel is read directly from the circuit kinds supplied at construction.
    const bool is_init = is_init_kernel();
    const bool is_hiding = ivc.is_hiding_kernel();

    // The ECC-op subtable for a kernel begins with an eq-and-reset to ensure that the preceding circuit's subtable
    // cannot affect the ECC-op accumulator for the kernel.
    circuit.queue_ecc_eq();

    BB_ASSERT(bus_depot.app_return_data_slots_are_empty(),
              "DataBusDepot has stale app return-data slots at kernel-completion boundary");

    // The number of claims this kernel batches: the previous accumulator (absent for the
    // init kernel) plus one sumcheck claim per proof in the group. A single-claim init kernel needs no batching -
    // its lone sumcheck claim is already the accumulator.
    const size_t group_size = stdlib_verification_queue.size();
    const size_t num_claims = Chonk::group_claim_count(/*has_previous_accumulator=*/!is_init, group_size);
    BB_ASSERT_LTE(num_claims, CHONK_MAX_CLAIMS_PER_KERNEL, "Per-kernel batch width exceeds the supported maximum");

    // Step 2: RECURSIVE VERIFIER - Fold each proof in the group into the folding verifier.

    std::vector<PairingPoints> points_accumulator;

    // The previous accumulator is claim 0 of this kernel's batch. It is absent for the init
    // kernel, which only verifies app circuits.
    std::optional<RecursiveVerifierAccumulator> prev_stdlib_verifier_accumulator;
    std::optional<StdlibFF> prev_stdlib_accum_hash;
    if (!is_init) {
        prev_stdlib_verifier_accumulator = RecursiveVerifierAccumulator::template stdlib_from_native<RecursiveCurve>(
            &circuit, ivc.recursive_verifier_native_accum);
        prev_stdlib_accum_hash =
            prev_stdlib_verifier_accumulator->hash_with_origin_tagging(*accumulation_recursive_transcript);
    }

    FoldingRecursiveVerifier folding_verifier(accumulation_recursive_transcript);

    while (!stdlib_verification_queue.empty()) {
        const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();

        auto [pairing_points, updated_ecc_hash] = recursive_verification_and_consistency_checks(
            verifier_input, folding_verifier, prev_stdlib_accum_hash, running_ecc_op_hash);
        points_accumulator.push_back(pairing_points);
        running_ecc_op_hash = updated_ecc_hash;

        stdlib_verification_queue.pop_front();
    }

    BB_ASSERT_EQ(
        running_ecc_op_hash.has_value(), true, "Running ECC op hash should be set for public input propagation");

    // Step 3: Reduce the group's claims to a single accumulator. For a single-claim init kernel the batching proof is
    // empty and finalize returns the lone sumcheck claim directly.
    StdlibProof stdlib_multilinear_batch_proof(circuit, ivc.multilinear_batch_proof);
    auto [batch_verified, output_accumulator] =
        folding_verifier.finalize(stdlib_multilinear_batch_proof, std::move(prev_stdlib_verifier_accumulator));
    vinfo("Per-kernel folding verified: ", batch_verified ? "true" : "false");

    // Output differs based on kernel type: HidingKernelIO (no accum hash) vs KernelIO (with accum hash)
    if (is_hiding) {
        // Perform decider verification
        BB_ASSERT_EQ(num_claims, 2U, "In the hiding kernel the number of claims should always be equal to 2");
        RecursiveDeciderVerifier decider_verifier(accumulation_recursive_transcript);
        StdlibProof stdlib_decider_proof(circuit, ivc.decider_proof);
        points_accumulator.emplace_back(decider_verifier.verify_proof(output_accumulator, stdlib_decider_proof));

        // Perform batch merge verification
        auto [batch_pairing_points, batch_merged_table_commitments] =
            ivc.get_goblin().recursively_verify_batch_merge(circuit, running_ecc_op_hash.value());

        // Append batch merge pairing points to the list of pairing points
        points_accumulator.emplace_back(batch_pairing_points);

        // Compute aggregated pairing points for output
        PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

        // Add randomness at the end of the hiding kernel (whose ecc ops fall right at the end of the op queue table) to
        // ensure the Chonk proof doesn't leak information about the actual content of the op queue
        hide_op_queue_content(circuit);

        HidingKernelIO hiding_output{ pairing_points_aggregator,
                                      bus_depot.get_kernel_return_data_commitment(circuit),
                                      std::move(batch_merged_table_commitments) };
        hiding_output.set_public();
    } else {
        // Compute aggregated pairing points for output
        PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

        // Extract native verifier accumulator from the stdlib accum to use it in the next round
        ivc.recursive_verifier_native_accum = output_accumulator.template get_value<Chonk::VerifierAccumulator>();

        auto kernel_return_data_commitment = bus_depot.get_kernel_return_data_commitment(circuit);
        typename KernelIO::AppReturnDataCommitments app_return_data_commitments;
        for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
            app_return_data_commitments[idx] = bus_depot.get_app_return_data_commitment(circuit, idx);
        }

        // Compute hash of output accumulator
        RecursiveTranscript hash_transcript;
        StdlibFF current_verifier_accum_hash = output_accumulator.hash_with_origin_tagging(hash_transcript);
        info("Kernel output accumulator hash: ", current_verifier_accum_hash);

        // Propagate public inputs
        KernelIO kernel_output{ pairing_points_aggregator,
                                kernel_return_data_commitment,
                                app_return_data_commitments,
                                running_ecc_op_hash.value(),
                                current_verifier_accum_hash };
        kernel_output.set_public();
    }
}

template <typename Circuit> bool KernelCompletion<Circuit>::is_init_kernel() const
{
    BB_ASSERT(!stdlib_verification_queue.empty(),
              "is_init_kernel: stdlib verification queue must hold the current kernel's group");
    return stdlib_verification_queue.front().kind == CircuitKind::App;
}

template <typename Circuit> void KernelCompletion<Circuit>::hide_op_queue_content(Circuit& circuit)
{
    circuit.queue_ecc_random_op();
    circuit.queue_ecc_random_op();
}

template class KernelCompletion<KernelCircuit>;
template class KernelCompletion<HidingKernelCircuit>;

} // namespace bb
