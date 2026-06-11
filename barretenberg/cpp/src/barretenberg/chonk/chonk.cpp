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

    // With per-kernel batching every proof contributes only a sumcheck claim; the claims are batched together in the
    // kernel's recursive verifier rather than folded pairwise here.
    HypernovaFoldingVerifier<NativeFlavor> native_verifier(verifier_transcript);
    auto [sumcheck_verified, new_accumulator] =
        native_verifier.instance_to_accumulator(verifier_inst, queue_entry.proof);
    native_verifier_accum = std::move(new_accumulator);
    info("Sumcheck: instance to accumulator verified: ", sumcheck_verified ? "true" : "false");
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
    info("======= DEBUGGING INFO FOR NATIVE SUMCHECK STEP =======");

    if (queue_entry.is_kernel()) {
        run_native_folding_verifier<KernelFlavor>(queue_entry.kernel_honk_vk, queue_entry, verifier_transcript);
    } else {
        run_native_folding_verifier<AppFlavor>(queue_entry.app_honk_vk, queue_entry, verifier_transcript);
    }

    info("======= END OF DEBUGGING INFO FOR NATIVE SUMCHECK STEP =======");
}
#endif

// Constructor
Chonk::Chonk(std::vector<CircuitKind> circuit_kinds)
    : circuit_kinds(std::move(circuit_kinds))
    , num_circuits(this->circuit_kinds.size())
{
    // Not BB_ASSERTs: the kinds arrive from msgpack (ChonkStart::kinds / folding stack). get_queue_type
    // subtracts 3 from num_circuits; an unchecked value < 4 would underflow the unsigned arithmetic and
    // silently mis-type the whole queue, so reject malformed stacks clearly in release/WASM too.
    if (num_circuits < 4U) {
        throw_or_abort("Chonk: number of circuits must be at least 4, got " + std::to_string(num_circuits));
    }

    for (size_t idx = 0; idx < num_circuits; ++idx) {
        const CircuitKind kind = this->circuit_kinds[idx];
        const bool is_valid_kind =
            kind == CircuitKind::App || kind == CircuitKind::Kernel || kind == CircuitKind::HidingKernel;
        if (!is_valid_kind) {
            throw_or_abort("Chonk: invalid CircuitKind at position " + std::to_string(idx));
        }
        const bool is_valid_hiding_kernel_position = (kind == CircuitKind::HidingKernel) == (idx == num_circuits - 1);
        if (!is_valid_hiding_kernel_position) {
            throw_or_abort("Chonk: HidingKernel must be the final circuit in the IVC stack and nowhere else");
        }
        const bool is_first_circuit_app = this->circuit_kinds.front() == CircuitKind::App;
        if (!is_first_circuit_app) {
            throw_or_abort("Chonk: the first circuit in the IVC stack must be an app");
        }
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
 * @brief Process public inputs from a verified circuit and perform databus consistency checks
 * @details For kernel circuits: reconstructs KernelIO from public inputs, verifies that databus return data
 * commitments match witness commitments, checks accumulator hash consistency, and returns the kernel's ECC op
 * running hash. For app circuits: reconstructs AppIO from public inputs and extracts pairing points. In both cases,
 * updates the bus depot with the appropriate return data commitment.
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
 * @brief Run sumcheck on a single proof in the group and perform its databus/accumulator-hash consistency checks.
 * @details Delegates to two steps: (1) sumcheck on the incoming instance to obtain its claim (no multilinear batching),
 * and (2) public inputs processing and databus consistency checks. Returns the resulting sumcheck claim, its pairing
 * points, and the updated ECC-op running hash. The claim is collected by complete_kernel_circuit_logic and batched
 * together with the rest of the group at the end of the kernel.
 *
 * @param circuit
 * @param verifier_inputs {proof, vkey, type (Oink/HN)} A set of inputs for recursive verification
 * @param input_verifier_accumulator The accumulator from the previous step of recursive verification
 * group's kernel proof, to check the propagated accumulator hash.
 * @param running_ecc_op_hash Running hash of ECC-op column commitments from prior steps in this kernel.
 * @param accumulation_recursive_transcript Transcript shared across recursive verification of the sumchecks of
 * K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app)
 */
std::tuple<Chonk::RecursiveVerifierAccumulator, std::vector<Chonk::PairingPoints>, Chonk::StdlibFF> Chonk::
    recursive_verification_and_consistency_checks(
        ClientCircuit& circuit,
        const StdlibVerifierInputs& verifier_inputs,
        const std::optional<RecursiveVerifierAccumulator>& input_verifier_accumulator,
        const std::optional<StdlibFF>& running_ecc_op_hash,
        const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript,
        bool explain_batch_merge_hash_repetition)
{
    BB_BENCH_NAME("Chonk::recursive_verification_and_consistency_checks");

    // For the kernel entry (the previous kernel proof, always the first entry in a group), the
    // input_verifier_accumulator's hash must match the accumulator hash this kernel propagated through its
    // public inputs. Compute it before running sumcheck, as the transcript state changes during verification.
    std::optional<StdlibFF> prev_accum_hash;
    if (verifier_inputs.is_kernel()) {
        BB_ASSERT(input_verifier_accumulator.has_value(), "Previous accumulator expected for kernel circuit folding");
        prev_accum_hash = input_verifier_accumulator->hash_with_origin_tagging(*accumulation_recursive_transcript);
    }

    if (verifier_inputs.type == QUEUE_TYPE::OINK) {
        BB_ASSERT_EQ(input_verifier_accumulator.has_value(), false);
    }

    // Step 1: Run sumcheck on the incoming instance to obtain its claim. Unlike folding, no multilinear batching is
    // performed here; the claims of every proof in the group are batched together once at the end of the kernel. The
    // incoming instance, its VK, and its witness commitments are typed per kind (app vs kernel).
    RecursiveVerifierAccumulator claim;
    PublicInputsResult public_inputs_result;
    std::vector<RecursiveCommitment> ecc_op_col_commitments_vec;

    if (verifier_inputs.is_kernel()) {
        auto verifier_instance =
            std::make_shared<KernelRecursiveVerifierInstance>(verifier_inputs.kernel_honk_vk_and_hash);
        HypernovaFoldingVerifier<KernelRecursiveFlavor> folding_verifier(accumulation_recursive_transcript);
        auto [_sumcheck_verified, sumcheck_claim] =
            folding_verifier.instance_to_accumulator(verifier_instance, verifier_inputs.proof);
        claim = std::move(sumcheck_claim);

        KernelWitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
        std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);
        public_inputs_result = process_kernel_public_inputs(public_inputs, witness_commitments, prev_accum_hash);

        auto ecc_op_col_commitments = witness_commitments.get_ecc_op_wires().get_copy();
        ecc_op_col_commitments_vec.assign(ecc_op_col_commitments.begin(), ecc_op_col_commitments.end());
    } else {
        auto verifier_instance = std::make_shared<AppRecursiveVerifierInstance>(verifier_inputs.app_honk_vk_and_hash);
        HypernovaFoldingVerifier<AppRecursiveFlavor> folding_verifier(accumulation_recursive_transcript);
        auto [_sumcheck_verified, sumcheck_claim] =
            folding_verifier.instance_to_accumulator(verifier_instance, verifier_inputs.proof);
        claim = std::move(sumcheck_claim);

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

    // Step 3: Update the running ECC op hash with this circuit's ECC op column commitments.
    const auto update_ecc_op_hash = [&]() {
        return Goblin::BatchMergeRecursiveVerifier::ecc_op_hash_step(ecc_op_col_commitments_vec, updated_hash);
    };
    if (explain_batch_merge_hash_repetition) {
        // BOOMERANG_DUPLICATE_PROVENANCE: See
        // barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md. The hiding
        // kernel's running ECC-op hash is intentionally recomputed by the batch-merge transcript hash. Scope this
        // Poseidon2 call as the running-hash side of that cryptographic binding.
        auto duplicate_binding_scope = circuit.scoped_duplicate_cryptographic_binding(
            batch_merge_ecc_op_hash_binding_local_id(DuplicateCryptographicBindingRole::RUNNING_HASH));
        updated_hash = update_ecc_op_hash();
    } else {
        updated_hash = update_ecc_op_hash();
    }

    std::vector<PairingPoints> all_points;
    all_points.emplace_back(std::move(public_inputs_result.pairing_points));

    return { std::move(claim), std::move(all_points), updated_hash.value() };
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

    // Transcript is shared across recursive verification of the sumchecks of K_{i-1} (kernel) and A_{i}, \dots,
    // A_{i + N} (apps) where N is the number of apps in the group being accumulated in this kernel
    auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();

    // Running Poseidon2 hash over ECC op column commitments, propagated through kernel public inputs.
    std::optional<StdlibFF> running_ecc_op_hash = std::nullopt;

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

    BB_ASSERT(bus_depot.app_return_data_slots_are_empty(),
              "DataBusDepot has stale app return-data slots at kernel-completion boundary");

    // The number of claims this kernel batches: the accumulator carried in from the previous kernel (absent for the
    // init kernel) plus one sumcheck claim per proof in the group. A single-claim init kernel needs no batching -
    // its lone sumcheck claim is already the accumulator.
    const size_t group_size = stdlib_verification_queue.size();
    const size_t num_claims = (is_init_kernel ? 0 : 1) + group_size;
    BB_ASSERT_LTE(num_claims, CHONK_MAX_CLAIMS_PER_KERNEL, "Per-kernel batch width exceeds the supported maximum");

    // Step 2: RECURSIVE VERIFIER - Run sumcheck on each proof in the group and collect the resulting claims in
    // memory.

    std::vector<PairingPoints> points_accumulator;

    // The accumulator carried in from the previous kernel is claim 0 of this kernel's batch. It is absent for the init
    // kernel, which only verifies app circuits.
    std::optional<RecursiveVerifierAccumulator> current_stdlib_verifier_accumulator;
    if (!is_init_kernel) {
        current_stdlib_verifier_accumulator =
            RecursiveVerifierAccumulator::stdlib_from_native<RecursiveCurve>(&circuit, recursive_verifier_native_accum);
    }

    // Claims fed into the batching sumcheck, held in memory: the carried accumulator followed by each proof's sumcheck
    // claim in queue order. They are not sent in any proof; the batching verifier consumes them directly.
    std::vector<RecursiveVerifierAccumulator> claims;
    claims.reserve(num_claims);
    while (!stdlib_verification_queue.empty()) {
        const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();

        auto [claim, pairing_points, updated_ecc_hash] =
            recursive_verification_and_consistency_checks(circuit,
                                                          verifier_input,
                                                          current_stdlib_verifier_accumulator,
                                                          running_ecc_op_hash,
                                                          accumulation_recursive_transcript);
        points_accumulator.insert(points_accumulator.end(), pairing_points.begin(), pairing_points.end());
        running_ecc_op_hash = updated_ecc_hash;
        claims.emplace_back(std::move(claim));

        stdlib_verification_queue.pop_front();
    }

    // Prepend the carried accumulator as claim 0. This is done after the loop because verifying the kernel proof above
    // assigns the carried accumulator its transcript origin tag (via the propagated-hash consistency check), which it
    // must carry before being combined with the origin-tagged batching scalars.
    if (current_stdlib_verifier_accumulator.has_value()) {
        claims.insert(claims.begin(), current_stdlib_verifier_accumulator.value());
    }

    BB_ASSERT_EQ(claims.size(), num_claims, "Collected claim count must equal the batch width");
    BB_ASSERT_EQ(
        running_ecc_op_hash.has_value(), true, "Running ECC op hash should be set for public input propagation");

    // Step 3: Reduce the group's claims to a single accumulator via the width-matched batching proof (or, for a
    // single-claim init kernel, use the lone sumcheck claim directly). For the hiding kernel the decider is verified
    // against the resulting accumulator inside verify_kernel_batch.
    RecursiveVerifierAccumulator output_accumulator;
    if (num_claims == 1) {
        // No batching: the single sumcheck claim is already the accumulator.
        output_accumulator = std::move(claims[0]);
    } else {
        // Verify the batching sumcheck against the in-memory claims, continuing on the accumulation transcript.
        MultilinearBatchingRecursiveVerifier multilinear_batch_verifier(accumulation_recursive_transcript);
        StdlibProof stdlib_multilinear_batch_proof(circuit, multilinear_batch_proof);
        accumulation_recursive_transcript->load_proof(stdlib_multilinear_batch_proof);
        auto [batch_verified, batched_accumulator] = multilinear_batch_verifier.verify_proof(claims);
        vinfo("Per-kernel multilinear batching verified: ", batch_verified ? "true" : "false");
        output_accumulator = batched_accumulator;
    }

    // Output differs based on kernel type: HidingKernelIO (no accum hash) vs KernelIO (with accum hash)
    if (is_hiding_kernel) {
        // Perform decider verification
        BB_ASSERT_GT(num_claims, 1U, "In the hiding kernel the number of claims should alway be greater than one.");
        RecursiveDeciderVerifier decider_verifier(accumulation_recursive_transcript);
        StdlibProof stdlib_decider_proof(circuit, decider_proof);
        points_accumulator.emplace_back(decider_verifier.verify_proof(output_accumulator, stdlib_decider_proof));

        // Perform batch merge verification
        auto [batch_pairing_points, batch_merged_table_commitments] =
            goblin.recursively_verify_batch_merge(circuit, running_ecc_op_hash.value());

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
        // Compute aggregated pairing points for output
        PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

        // Extract native verifier accumulator from the stdlib accum to use it in the next round
        recursive_verifier_native_accum = output_accumulator.get_value<VerifierAccumulator>();

        auto kernel_return_data_commitment = bus_depot.get_kernel_return_data_commitment(circuit);
        KernelIO::AppReturnDataCommitments app_return_data_commitments;
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
HonkProof Chonk::instance_to_accumulator(ClientCircuit& circuit,
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

    // Run sumcheck on the incoming instance and collect the resulting claim. The claims of the whole group are
    // batched together once, when the group's last circuit is accumulated (see prove_multilinear_batching).
    vinfo("Accumulating circuit number ", num_circuits_accumulated + 1);
    FoldingProver prover(accumulation_transcript);
    multilinear_batch_prover_accumulators.emplace_back(
        prover.template instance_to_accumulator<InstanceFlavor>(prover_instance, vk));
    return prover.export_proof();
}

void Chonk::accumulate_and_fold(ClientCircuit& circuit, QUEUE_TYPE queue_type, const CircuitVerificationKey& vk)
{
    BB_BENCH_NAME("Chonk::accumulate_and_fold");

    const CircuitKind kind = current_kind();
    const CircuitKind following_kind = next_kind();

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
        proof = instance_to_accumulator<KernelFlavor>(circuit, kernel_vk, prover_accumulation_transcript);
        queue_entry.kernel_honk_vk = std::move(kernel_vk);
    } else {
        auto app_vk = std::get<std::shared_ptr<AppVerificationKey>>(vk);
        proof = instance_to_accumulator<AppFlavor>(circuit, app_vk, prover_accumulation_transcript);
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

    // If a kernel follows, the circuit just folded was the last of that kernel's group: produce the batching
    // proof the kernel will recursively verify.
    if (following_kind == CircuitKind::Kernel || following_kind == CircuitKind::HidingKernel) {
        prove_multilinear_batching();
    }
}

Chonk::CircuitKind Chonk::current_kind() const
{
    BB_ASSERT_LT(num_circuits_accumulated, num_circuits, "Chonk: every circuit has already been accumulated.");
    return circuit_kinds[num_circuits_accumulated];
}

Chonk::CircuitKind Chonk::next_kind() const
{
    const size_t next_idx = num_circuits_accumulated + 1;
    return next_idx < num_circuits ? circuit_kinds[next_idx] : CircuitKind::None;
}

/**
 * @brief Unified accumulation entry point. Dispatches on `current_kind()` to either folding (App / Kernel)
 * or the hiding-kernel path (HidingKernel — proving deferred to `prove()`). When the next circuit is a
 * kernel, the circuit being accumulated completes that kernel's group, so its multilinear batching proof
 * (and, before the hiding kernel, the decider proof) is produced here.
 */
void Chonk::accumulate(ClientCircuit& circuit, const CircuitVerificationKey& vk)
{
    BB_BENCH_NAME("Chonk::accumulate");
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");
    const CircuitKind kind = current_kind();
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
        // Capture before folding: accumulate_and_fold advances num_circuits_accumulated.
        const CircuitKind following_kind = next_kind();

        accumulate_and_fold(circuit, queue_type, vk);

        // If the hiding kernel follows, the IVC is complete: prove the batch merge and run the decider on the
        // final accumulator (the output of the hiding kernel's batching). Both proofs are recursively verified
        // in the hiding kernel.
        if (following_kind == CircuitKind::HidingKernel) {
            DeciderProver decider(prover_accumulation_transcript);
            decider_proof = decider.construct_proof(prover_accumulator);

            goblin.prove_batch_merge();
        }
        break;
    }
    case CircuitKind::None:
        throw_or_abort("Chonk::accumulate: CircuitKind is None (unset)");
    }
}

/**
 * @brief Batch the group's sumcheck claims (collected during the group's accumulate() calls) together with the
 * accumulator carried in from the previous kernel, using the batching circuit of exactly matching width.
 * @details Called at the end of accumulating the last circuit of a group, i.e. when the next circuit is a kernel.
 * The resulting proof is recursively verified in that kernel's complete_kernel_circuit_logic.
 */
void Chonk::prove_multilinear_batching()
{
    BB_ASSERT(!verification_queue.empty(), "Chonk: cannot batch an empty group");
    BB_ASSERT_EQ(multilinear_batch_prover_accumulators.size(),
                 verification_queue.size(),
                 "Mismatch between collected prover claims and group size");

    // The init kernel's group begins with the first app's oink proof and carries no accumulator.
    const bool is_init_group = verification_queue.front().type == QUEUE_TYPE::OINK;
    const size_t num_claims = (is_init_group ? 0 : 1) + verification_queue.size();
    BB_ASSERT_LTE(num_claims, CHONK_MAX_CLAIMS_PER_KERNEL, "Per-kernel batch width exceeds the supported maximum");

    std::vector<ProverAccumulator> batch_claims;
    batch_claims.reserve(num_claims);
    if (!is_init_group) {
        batch_claims.emplace_back(std::move(prover_accumulator));
    }
    for (auto& accumulator : multilinear_batch_prover_accumulators) {
        batch_claims.emplace_back(std::move(accumulator));
    }
    multilinear_batch_prover_accumulators.clear();

    if (num_claims == 1) {
        // No batching: the single sumcheck claim is already the accumulator.
        // This only happens when the first app is processed by a kernel instead of being batched with other apps
        prover_accumulator = std::move(batch_claims[0]);
    } else {
        // The batching continues on the group's accumulation transcript, so the batching challenge is bound by the
        // group's instance sumchecks already absorbed there. The claims themselves are not added to the proof.
        MultilinearBatchingProver multilinear_batch_prover(std::move(batch_claims), prover_accumulation_transcript);
        multilinear_batch_proof = multilinear_batch_prover.construct_proof();
        prover_accumulator = multilinear_batch_prover.compute_new_claim();
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
