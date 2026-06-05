// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
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

#ifndef NDEBUG
template <typename NativeFlavor>
void Chonk::run_native_folding_verifier(const std::shared_ptr<typename NativeFlavor::VerificationKey>& honk_vk,
                                        const VerifierInputs& queue_entry,
                                        const std::shared_ptr<Transcript>& verifier_transcript)
{
    auto verifier_inst =
        std::make_shared<VerifierInstance_<NativeFlavor>>(std::make_shared<typename NativeFlavor::VKAndHash>(honk_vk));
    HypernovaFoldingVerifier<NativeFlavor> native_verifier(verifier_transcript);
    if (queue_entry.type == QUEUE_TYPE::OINK) {
        auto [_first_verified, new_accumulator] =
            native_verifier.instance_to_accumulator(verifier_inst, queue_entry.proof);
        native_verifier_accum = std::move(new_accumulator);
        info("Sumcheck: instance to accumulator verified: ", _first_verified ? "true" : "false");
    } else {
        auto [_first_verified, _second_verified, new_accumulator] =
            native_verifier.verify_folding_proof(verifier_inst, native_verifier_accum, queue_entry.proof);
        native_verifier_accum = std::move(new_accumulator);

        info("Sumcheck: instance to accumulator verified: ", _first_verified ? "true" : "false");
        info("Sumcheck: batch two accumulators verified: ", _second_verified ? "true" : "false");

        if (queue_entry.type == QUEUE_TYPE::HN_FINAL) {
            HypernovaDeciderVerifier<NativeFlavor> decider_verifier(verifier_transcript);
            bb::PairingPoints<curve::BN254> pairing_points =
                decider_verifier.verify_proof(native_verifier_accum, decider_proof);

            info("Decider: pairing points verified? ", pairing_points.check() ? "true" : "false");
        }
    }
}

template <typename InstanceFlavor>
void Chonk::debug_incoming_circuit(ClientCircuit& circuit,
                                   const std::shared_ptr<ProverInstance_<InstanceFlavor>>& prover_instance,
                                   const std::shared_ptr<typename InstanceFlavor::VerificationKey>& precomputed_vk)
{
    info("======= DEBUGGING INFO FOR INCOMING CIRCUIT =======");

    info("Accumulating circuit ", num_circuits_accumulated + 1, " of ", num_circuits);
    info("Is the circuit valid? ", CircuitChecker::check(circuit) ? "true" : "false");
    info("Did we find a failure? ", circuit.failed() ? "true" : "false");
    if (circuit.failed()) {
        info("\t\t\tError message? ", circuit.err());
    }

    // Compare precomputed VK with the one generated during accumulation.
    auto vk = std::make_shared<typename InstanceFlavor::VerificationKey>(prover_instance->get_precomputed());
    info("Does the precomputed vk match with the one generated during accumulation? ",
         vk->compare(*precomputed_vk, typename InstanceFlavor::CommitmentLabels().get_precomputed()) ? "true"
                                                                                                     : "false");

    info("======= END OF DEBUGGING INFO FOR INCOMING CIRCUIT =======");
}

void Chonk::update_native_verifier_accumulator(const VerifierInputs& queue_entry,
                                               const std::shared_ptr<Transcript>& verifier_transcript)
{
    info("======= DEBUGGING INFO FOR NATIVE FOLDING STEP =======");

    if (queue_entry.is_kernel()) {
        run_native_folding_verifier<KernelFlavor>(queue_entry.kernel_honk_vk, queue_entry, verifier_transcript);
    } else {
        run_native_folding_verifier<AppFlavor>(queue_entry.app_honk_vk, queue_entry, verifier_transcript);
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
    is_previous_circuit_a_kernel = queue_entry.is_kernel();

    info("======= END OF DEBUGGING INFO FOR NATIVE FOLDING STEP =======");
}
#endif

// Constructor
Chonk::Chonk(size_t num_circuits)
    : num_circuits(num_circuits)
{
    // Not a BB_ASSERT: num_circuits arrives from msgpack (ChonkStart::num_circuits / folding stack
    // size). get_queue_type subtracts 3 from it; an unchecked value < 4 would underflow the unsigned
    // arithmetic and silently mis-type the whole queue, so reject it clearly in release/WASM too.
    if (num_circuits < 4) {
        throw_or_abort("Chonk: number of circuits must be at least 4, got " + std::to_string(num_circuits));
    }
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
                                                  const std::vector<StdlibCircuitVKAndHash>& input_keys)
{
    const bool vkeys_provided = !input_keys.empty();
    if (vkeys_provided) {
        BB_ASSERT_EQ(verification_queue.size(),
                     input_keys.size(),
                     "Incorrect number of verification keys provided in "
                     "stdlib verification queue instantiation.");
    }

    size_t input_idx = 0;
    while (!verification_queue.empty()) {
        const VerifierInputs& entry = verification_queue.front();

        StdlibProof stdlib_proof(circuit, entry.proof);

        if (entry.is_kernel()) {
            auto stdlib_vk_and_hash = vkeys_provided
                                          ? std::get<std::shared_ptr<KernelRecursiveVKAndHash>>(input_keys[input_idx])
                                          : std::make_shared<KernelRecursiveVKAndHash>(circuit, entry.kernel_honk_vk);
            stdlib_verification_queue.emplace_back(stdlib_proof, stdlib_vk_and_hash, entry.type);
        } else {
            auto stdlib_vk_and_hash = vkeys_provided
                                          ? std::get<std::shared_ptr<AppRecursiveVKAndHash>>(input_keys[input_idx])
                                          : std::make_shared<AppRecursiveVKAndHash>(circuit, entry.app_honk_vk);
            stdlib_verification_queue.emplace_back(stdlib_proof, stdlib_vk_and_hash, entry.type);
        }
        ++input_idx;
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
namespace {
template <typename RecursiveFlavor>
Chonk::FoldingResult run_recursive_folding_verifier(
    const std::shared_ptr<VerifierInstance_<RecursiveFlavor>>& verifier_instance,
    const Chonk::StdlibVerifierInputs& verifier_inputs,
    const std::optional<Chonk::RecursiveVerifierAccumulator>& input_verifier_accumulator,
    const std::shared_ptr<Chonk::RecursiveTranscript>& accumulation_recursive_transcript,
    Chonk::ClientCircuit& circuit,
    const HonkProof& decider_proof,
    [[maybe_unused]] size_t stdlib_queue_size)
{
    std::vector<Chonk::PairingPoints> pairing_points;
    std::optional<Chonk::RecursiveVerifierAccumulator> output_accumulator;

    HypernovaFoldingVerifier<RecursiveFlavor> folding_verifier(accumulation_recursive_transcript);
    switch (verifier_inputs.type) {
    case Chonk::QUEUE_TYPE::OINK: {
        vinfo("Recursively verifying accumulation of the first app circuit.");
        auto [_, new_verifier_accumulator] =
            folding_verifier.instance_to_accumulator(verifier_instance, verifier_inputs.proof);
        output_accumulator = std::move(new_verifier_accumulator);
        break;
    }
    case Chonk::QUEUE_TYPE::HN:
    case Chonk::QUEUE_TYPE::HN_TAIL: {
        BB_ASSERT(input_verifier_accumulator.has_value(),
                  "Verifier accumulator should be present for HN and HN_TAIL proofs");

        vinfo("Recursively verifying inner accumulation.");
        auto [_first_verified, _second_verified, new_verifier_accumulator] = folding_verifier.verify_folding_proof(
            verifier_instance, input_verifier_accumulator.value(), verifier_inputs.proof);
        output_accumulator = std::move(new_verifier_accumulator);
        break;
    }
    case Chonk::QUEUE_TYPE::HN_FINAL: {
        BB_ASSERT(input_verifier_accumulator.has_value(), "Verifier accumulator should be present for HN_FINAL proofs");

        vinfo("Recursively verifying accumulation of the tail kernel.");
        BB_ASSERT_EQ(stdlib_queue_size, size_t(1));

        auto [_first_verified, _second_verified, final_verifier_accumulator] = folding_verifier.verify_folding_proof(
            verifier_instance, input_verifier_accumulator.value(), verifier_inputs.proof);

        HypernovaDeciderVerifier<RecursiveFlavor> decider_verifier(accumulation_recursive_transcript);
        Chonk::StdlibProof stdlib_decider_proof(circuit, decider_proof);
        pairing_points.emplace_back(decider_verifier.verify_proof(final_verifier_accumulator, stdlib_decider_proof));
        break;
    }
    default: {
        throw_or_abort("Invalid queue type! Only OINK, HN, HN_TAIL and HN_FINAL are supported");
    }
    }

    return { std::move(output_accumulator), std::move(pairing_points) };
}
} // namespace

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
Chonk::PublicInputsResult Chonk::process_kernel_public_inputs(std::vector<StdlibFF>& public_inputs,
                                                              KernelWitnessCommitments& witness_commitments,
                                                              const std::optional<StdlibFF>& prev_accum_hash)
{
    KernelIO kernel_input; // pairing points, ecc op tables, databus commitments
    kernel_input.reconstruct_from_public(public_inputs);

    // ============= Perform databus consistency checks ===============================

    bool kernel_return_data_match =
        kernel_input.kernel_return_data.get_value() == witness_commitments.kernel_calldata().get_value();
    BB_ASSERT_DEBUG(kernel_return_data_match,
                    "kernel_return_data mismatch: proof contains "
                        << kernel_input.kernel_return_data.get_value() << " but kernel_calldata commitment is "
                        << witness_commitments.kernel_calldata().get_value());
    kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.kernel_calldata());

    const std::array app_calldata_commitments{ &witness_commitments.first_app_calldata(),
                                               &witness_commitments.second_app_calldata(),
                                               &witness_commitments.third_app_calldata() };
    for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
        bool app_return_data_match =
            kernel_input.app_return_data[idx].get_value() == app_calldata_commitments[idx]->get_value();
        BB_ASSERT_DEBUG(app_return_data_match,
                        "app_return_data mismatch: proof contains " << kernel_input.app_return_data[idx].get_value()
                                                                    << " but app calldata commitment " << idx << " is "
                                                                    << app_calldata_commitments[idx]->get_value());
        kernel_input.app_return_data[idx].incomplete_assert_equal(*app_calldata_commitments[idx]);
    }

    // ============= Perform accumulator hash consistency check =========================

    info("Accumulator hash from IO: ", kernel_input.output_hn_accum_hash);
    BB_ASSERT(prev_accum_hash.has_value());
    bool accum_hash_match = kernel_input.output_hn_accum_hash.get_value() == prev_accum_hash->get_value();
    BB_ASSERT_DEBUG(accum_hash_match,
                    "output_hn_accum_hash mismatch: proof contains " << kernel_input.output_hn_accum_hash.get_value()
                                                                     << " but expected "
                                                                     << prev_accum_hash->get_value());
    kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);

    bus_depot.set_kernel_return_data_commitment(witness_commitments.return_data());

    return { std::move(kernel_input.pairing_inputs), std::move(kernel_input.ecc_op_hash) };
}

Chonk::PublicInputsResult Chonk::process_app_public_inputs(std::vector<StdlibFF>& public_inputs,
                                                           AppWitnessCommitments& witness_commitments)
{
    AppIO app_input; // pairing points
    app_input.reconstruct_from_public(public_inputs);
    bus_depot.set_app_return_data_commitment(witness_commitments.return_data());
    return { std::move(app_input.pairing_inputs), std::nullopt };
}

/**
 * @brief Orchestrate recursive verification, databus consistency checks, and merge verification for a single circuit.
 * @details Runs recursive folding verification and public input checks
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

    // Compute prev_accum_hash before folding (transcript state changes during verification)
    std::optional<StdlibFF> prev_accum_hash;
    if (verifier_inputs.is_kernel()) {
        BB_ASSERT(input_verifier_accumulator.has_value(), "Previous accumulator expected for kernel circuit folding");
        prev_accum_hash = input_verifier_accumulator->hash_with_origin_tagging(*accumulation_recursive_transcript);
    }

    if (verifier_inputs.type == QUEUE_TYPE::OINK) {
        BB_ASSERT_EQ(input_verifier_accumulator.has_value(), false);
    }

    std::optional<RecursiveVerifierAccumulator> output_accumulator;
    std::vector<PairingPoints> folding_points;
    PublicInputsResult public_inputs_result;
    std::vector<RecursiveCommitment> ecc_op_col_commitments_vec;

    if (verifier_inputs.is_kernel()) {
        auto verifier_instance =
            std::make_shared<KernelRecursiveVerifierInstance>(verifier_inputs.kernel_honk_vk_and_hash);
        auto fr = run_recursive_folding_verifier<KernelRecursiveFlavor>(verifier_instance,
                                                                        verifier_inputs,
                                                                        input_verifier_accumulator,
                                                                        accumulation_recursive_transcript,
                                                                        circuit,
                                                                        decider_proof,
                                                                        stdlib_verification_queue.size());
        output_accumulator = std::move(fr.output_accumulator);
        folding_points = std::move(fr.pairing_points);

        KernelWitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
        std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);
        public_inputs_result = process_kernel_public_inputs(public_inputs, witness_commitments, prev_accum_hash);

        auto ecc_op_col_commitments = witness_commitments.get_ecc_op_wires().get_copy();
        ecc_op_col_commitments_vec.assign(ecc_op_col_commitments.begin(), ecc_op_col_commitments.end());
    } else {
        auto verifier_instance = std::make_shared<AppRecursiveVerifierInstance>(verifier_inputs.app_honk_vk_and_hash);
        auto fr = run_recursive_folding_verifier<AppRecursiveFlavor>(verifier_instance,
                                                                     verifier_inputs,
                                                                     input_verifier_accumulator,
                                                                     accumulation_recursive_transcript,
                                                                     circuit,
                                                                     decider_proof,
                                                                     stdlib_verification_queue.size());
        output_accumulator = std::move(fr.output_accumulator);
        folding_points = std::move(fr.pairing_points);

        AppWitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
        std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);
        public_inputs_result = process_app_public_inputs(public_inputs, witness_commitments);

        auto ecc_op_col_commitments = witness_commitments.get_ecc_op_wires().get_copy();
        ecc_op_col_commitments_vec.assign(ecc_op_col_commitments.begin(), ecc_op_col_commitments.end());
    }

    std::optional<StdlibFF> updated_hash = running_hash;
    if (public_inputs_result.ecc_op_hash.has_value()) {
        BB_ASSERT_EQ(verifier_inputs.is_kernel(), true, "previous_ecc_op_hash should only be set for kernels");
        BB_ASSERT(!running_hash.has_value(), "Running hash should not be set when recursively verifying a kernel");
        updated_hash = public_inputs_result.ecc_op_hash.value();
    }

    updated_hash = Goblin::BatchMergeRecursiveVerifier::ecc_op_hash_step(ecc_op_col_commitments_vec, updated_hash);

    std::vector<PairingPoints> all_points;
    all_points.insert(all_points.end(), folding_points.begin(), folding_points.end());
    all_points.emplace_back(std::move(public_inputs_result.pairing_points));

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
        current_stdlib_verifier_accumulator =
            RecursiveVerifierAccumulator::stdlib_from_native<RecursiveCurve>(&circuit, recursive_verifier_native_accum);
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
    if (num_circuits_accumulated + 3 < num_circuits) {
        return QUEUE_TYPE::HN;
    }
    // last kernel prior to tail kernel
    if (num_circuits_accumulated + 3 == num_circuits) {
        return QUEUE_TYPE::HN_TAIL;
    }
    // tail kernel
    if (num_circuits_accumulated + 2 == num_circuits) {
        return QUEUE_TYPE::HN_FINAL;
    }
    // hiding kernel
    if (num_circuits_accumulated + 1 == num_circuits) {
        return QUEUE_TYPE::MEGA;
    }
    throw_or_abort("Chonk::get_queue_type: num_circuits_accumulated out of range");
}

/**
 * @brief Build the hiding kernel's ZK proving key and verification key (proving is deferred to prove()).
 */
void Chonk::accumulate_hiding_kernel(ClientCircuit& circuit,
                                     const std::shared_ptr<MegaZKVerificationKey>& precomputed_vk)
{
    BB_BENCH_NAME("Chonk::accumulate_hiding_kernel");
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");
    // throw, not BB_ASSERT: reachable from external step ordering, and a wrong position would feed
    // the wrong variant alternative into std::get below (std::bad_variant_access / mis-folding).
    if (get_queue_type() != QUEUE_TYPE::MEGA) {
        throw_or_abort("Chonk::accumulate_hiding_kernel must be the final circuit in the IVC stack");
    }

    vinfo("Constructing hiding kernel instance (proving deferred to prove())");
    hiding_prover_inst = std::make_shared<HidingKernelProverInstance>(circuit);

    // Free circuit block memory now that trace data has been copied to prover polynomials
    for (auto& block : circuit.blocks.get()) {
        block.free_data();
    }

    if (precomputed_vk) {
#ifndef NDEBUG
        auto computed_vk = std::make_shared<MegaZKVerificationKey>(hiding_prover_inst->get_precomputed());
        BB_ASSERT(*precomputed_vk == *computed_vk,
                  "Chonk::accumulate_hiding_kernel - precomputed MegaZK VK does not match computed VK");
#endif
        hiding_vk = precomputed_vk;
    } else {
        hiding_vk = std::make_shared<MegaZKVerificationKey>(hiding_prover_inst->get_precomputed());
    }
    num_circuits_accumulated++;
}

// Templated body of accumulate_and_fold. Dispatched on InstanceFlavor (MegaAppFlavor for apps,
// MegaKernelFlavor for kernels). The Hypernova accumulator is flavor-agnostic so apps and kernels
// fold into the same `prover_accumulator`.
template <typename InstanceFlavor>
HonkProof Chonk::run_oink_or_fold(ClientCircuit& circuit,
                                  QUEUE_TYPE queue_type,
                                  const std::shared_ptr<typename InstanceFlavor::VerificationKey>& vk,
                                  const std::shared_ptr<Transcript>& accumulation_transcript)
{
    using PI = ProverInstance_<InstanceFlavor>;
    BB_ASSERT(vk != nullptr, "Chonk::accumulate_and_fold - VK expected for the provided circuit");

    auto prover_instance = std::make_shared<PI>(circuit);
#ifndef NDEBUG
    debug_incoming_circuit<InstanceFlavor>(circuit, prover_instance, vk);
#endif
    // Free circuit block memory (wires and selectors) now that they've been copied to prover polynomials.
    for (auto& block : circuit.blocks.get()) {
        block.free_data();
    }

    FoldingProver prover(accumulation_transcript);
    HonkProof proof;
    switch (queue_type) {
    case QUEUE_TYPE::OINK:
        vinfo("Accumulating first app circuit");
        prover_accumulator = prover.template instance_to_accumulator<InstanceFlavor>(prover_instance, vk);
        proof = prover.export_proof();
        break;
    case QUEUE_TYPE::HN:
    case QUEUE_TYPE::HN_TAIL:
        vinfo("Accumulating circuit number ", num_circuits_accumulated + 1);
        std::tie(proof, prover_accumulator) =
            prover.template fold<InstanceFlavor>(std::move(prover_accumulator), prover_instance, vk);
        break;
    case QUEUE_TYPE::HN_FINAL: {
        vinfo("Accumulating tail kernel");
        std::tie(proof, prover_accumulator) =
            prover.template fold<InstanceFlavor>(std::move(prover_accumulator), prover_instance, vk);
        auto decider_transcript = accumulation_transcript;
        DeciderProver decider(decider_transcript);
        decider_proof = decider.construct_proof(prover_accumulator);
        break;
    }
    default:
        BB_ASSERT(false, "Unexpected queue type");
        break;
    }
    return proof;
}

void Chonk::accumulate_and_fold(ClientCircuit& circuit,
                                CircuitKind kind,
                                QUEUE_TYPE queue_type,
                                const CircuitVerificationKey& vk)
{
    BB_BENCH_NAME("Chonk::accumulate_and_fold");

    const bool state_says_kernel = verification_queue.empty() && num_circuits_accumulated > 0;
    BB_ASSERT_EQ(state_says_kernel,
                 kind == CircuitKind::Kernel,
                 "Chonk::accumulate_and_fold: CircuitKind disagrees with the IVC state machine");

    if (kind == CircuitKind::Kernel) {
        prover_accumulation_transcript = std::make_shared<Transcript>();
    }

#ifndef NDEBUG
    auto verifier_transcript =
        Transcript::convert_prover_transcript_to_verifier_transcript(prover_accumulation_transcript);
#endif

    HonkProof proof;
    VerifierInputs queue_entry;
    queue_entry.type = queue_type;
    queue_entry.kind = kind;
    if (kind == CircuitKind::Kernel) {
        auto kernel_vk = std::get<std::shared_ptr<KernelVerificationKey>>(vk);
        proof = run_oink_or_fold<KernelFlavor>(circuit, queue_type, kernel_vk, prover_accumulation_transcript);
        queue_entry.kernel_honk_vk = std::move(kernel_vk);
    } else {
        auto app_vk = std::get<std::shared_ptr<AppVerificationKey>>(vk);
        proof = run_oink_or_fold<AppFlavor>(circuit, queue_type, app_vk, prover_accumulation_transcript);
        queue_entry.app_honk_vk = std::move(app_vk);
    }
    queue_entry.proof = std::move(proof);

    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_accumulate");
        detail::GLOBAL_MEMORY_PROFILE.next_circuit();
    }

    verification_queue.push_back(queue_entry);

#ifndef NDEBUG
    update_native_verifier_accumulator(queue_entry, verifier_transcript);
#endif
    goblin.op_queue->merge();

    num_circuits_accumulated++;
}

Chonk::CircuitKind Chonk::next_circuit_kind() const
{
    if (get_queue_type() == QUEUE_TYPE::MEGA) {
        return CircuitKind::HidingKernel;
    }
    const bool is_kernel = verification_queue.empty() && num_circuits_accumulated > 0;
    return is_kernel ? CircuitKind::Kernel : CircuitKind::App;
}

/**
 * @brief Unified accumulation entry point. Dispatches on `kind` to either folding (App / Kernel)
 * or the hiding-kernel path (HidingKernel — proving deferred to `prove()`).
 */
void Chonk::accumulate(ClientCircuit& circuit, CircuitKind kind, const CircuitVerificationKey& vk)
{
    BB_BENCH_NAME("Chonk::accumulate");
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");
    QUEUE_TYPE queue_type = get_queue_type();

    switch (kind) {
    case CircuitKind::HidingKernel: {
        // throw, not BB_ASSERT: wrong position feeds the wrong variant into std::get (bad_variant_access).
        if (queue_type != QUEUE_TYPE::MEGA) {
            throw_or_abort("HidingKernel must be the final circuit in the IVC stack");
        }
        accumulate_hiding_kernel(circuit, std::get<std::shared_ptr<MegaZKVerificationKey>>(vk));
        break;
    }
    case CircuitKind::App:
    case CircuitKind::Kernel: {
        if (queue_type == QUEUE_TYPE::MEGA) {
            throw_or_abort("App/Kernel cannot be the final circuit; use HidingKernel");
        }
        accumulate_and_fold(circuit, kind, queue_type, vk);

        if (queue_type == QUEUE_TYPE::HN_FINAL) {
            prover_accumulator = ProverAccumulator();
            goblin.prove_batch_merge();
        }
        break;
    }
    case CircuitKind::None:
        throw_or_abort("Chonk::accumulate: CircuitKind is None (unset)");
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
    BB_ASSERT(hiding_vk != nullptr, "Hiding kernel VK has not been computed yet");
    return std::make_shared<MegaZKFlavor::VKAndHash>(hiding_vk);
}

} // namespace bb
