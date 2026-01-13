// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

// Constructor
Chonk::Chonk(size_t num_circuits)
    : num_circuits(num_circuits)
    , goblin(bn254_commitment_key)
{
    BB_ASSERT_GT(num_circuits, 0UL, "Number of circuits must be specified and greater than 0.");
    // Allocate BN254 commitment key based on translator circuit size.
    // https://github.com/AztecProtocol/barretenberg/issues/1319): Account for Translator only when it's necessary
    size_t commitment_key_size = 1UL << TranslatorFlavor::CONST_TRANSLATOR_LOG_N;
    info("BN254 commitment key size: ", commitment_key_size);
    bn254_commitment_key = CommitmentKey<curve::BN254>(commitment_key_size);
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
 * @brief Populate the provided circuit with constraints for (1) recursive verification of the provided accumulation
 * proof and (2) the associated databus commitment consistency checks.
 * @details The recursive verifier will be either Oink or Hypernova depending on the specified proof type. In either
 * case, the verifier accumulator is updated in place via the verification algorithm. Databus commitment consistency
 * checks are performed on the witness commitments and public inputs extracted from the proof by the verifier. Merge
 * verification is performed with commitments to the subtable t_j extracted from the HN verifier. The computed
 * commitment T is propagated to the next step of recursive verification.
 *
 * @param circuit
 * @param verifier_inputs {proof, vkey, type (Oink/HN)} A set of inputs for recursive verification
 * @param merge_commitments Container for the commitments for the Merge recursive verification to be performed
 * @param accumulation_recursive_transcript Transcript shared across recursive verification of the folding of
 * K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app)
 *
 * @return Triple of output verifier accumulator, PairingPoints for final verification and commitments to the merged
 * tables as read from the proof by the Merge verifier
 */
std::tuple<std::optional<Chonk::RecursiveVerifierAccumulator>,
           std::vector<Chonk::PairingPoints>,
           Chonk::TableCommitments>
Chonk::perform_recursive_verification_and_databus_consistency_checks(
    ClientCircuit& circuit,
    const StdlibVerifierInputs& verifier_inputs,
    const std::optional<RecursiveVerifierAccumulator>& input_verifier_accumulator,
    const TableCommitments& T_prev_commitments,
    const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript)
{
    using MergeCommitments = Goblin::MergeRecursiveVerifier::InputCommitments;

    // PairingPoints to be returned for aggregation
    std::vector<PairingPoints> pairing_points;

    // Input commitments to be passed to the merge recursive verification
    MergeCommitments merge_commitments{ .T_prev_commitments = T_prev_commitments };

    auto verifier_instance = std::make_shared<RecursiveVerifierInstance>(&circuit, verifier_inputs.honk_vk_and_hash);

    std::optional<RecursiveVerifierAccumulator> output_verifier_accumulator;
    std::optional<StdlibFF> prev_accum_hash = std::nullopt;

    // Update previous accumulator hash so that we can check it against the one extracted from the public inputs
    if (verifier_inputs.is_kernel) {
        prev_accum_hash = input_verifier_accumulator->hash_with_origin_tagging("", *accumulation_recursive_transcript);
    }

    RecursiveFoldingVerifier folding_verifier(accumulation_recursive_transcript);
    switch (verifier_inputs.type) {
    case QUEUE_TYPE::OINK: {
        vinfo("Recursively verifying accumulation of the first app circuit.");
        BB_ASSERT_EQ(input_verifier_accumulator.has_value(), false);

        auto [_, new_verifier_accumulator] =
            folding_verifier.instance_to_accumulator(verifier_instance, verifier_inputs.proof);
        output_verifier_accumulator = std::move(new_verifier_accumulator);

        // T_prev = 0 in the first recursive verification
        merge_commitments.T_prev_commitments = stdlib::recursion::honk::empty_ecc_op_tables(circuit);
        break;
    }
    case QUEUE_TYPE::HN:
    case QUEUE_TYPE::HN_TAIL: {
        vinfo("Recursively verifying inner accumulation.");
        auto [_first_verified, _second_verified, new_verifier_accumulator] =
            folding_verifier.verify_folding_proof(verifier_instance, verifier_inputs.proof);
        output_verifier_accumulator = std::move(new_verifier_accumulator);
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

        BB_ASSERT_EQ(output_verifier_accumulator.has_value(), false);
        break;
    }
    default: {
        throw_or_abort("Invalid queue type! Only OINK, HN, HN_TAIL and HN_FINAL are supported");
    }
    }

    // Extract the witness commitments and public inputs from the incoming verifier instance
    WitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
    std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);

    if (verifier_inputs.is_kernel) {
        // Reconstruct the input from the previous kernel from its public inputs
        KernelIO kernel_input; // pairing points, databus return data commitments
        kernel_input.reconstruct_from_public(public_inputs);
        // Add pairing points for aggregation
        pairing_points.emplace_back(kernel_input.pairing_inputs);
        // Perform databus consistency checks
        bool kernel_return_data_match =
            kernel_input.kernel_return_data.get_value() == witness_commitments.calldata.get_value();
        BB_ASSERT_DEBUG(kernel_return_data_match,
                        "kernel_return_data mismatch: proof contains " << kernel_input.kernel_return_data.get_value()
                                                                       << " but calldata commitment is "
                                                                       << witness_commitments.calldata.get_value());
        kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.calldata);

        bool app_return_data_match =
            kernel_input.app_return_data.get_value() == witness_commitments.secondary_calldata.get_value();
        BB_ASSERT_DEBUG(app_return_data_match,
                        "app_return_data mismatch: proof contains "
                            << kernel_input.app_return_data.get_value() << " but secondary_calldata commitment is "
                            << witness_commitments.secondary_calldata.get_value());
        kernel_input.app_return_data.incomplete_assert_equal(witness_commitments.secondary_calldata);

        // T_prev is read by the public input of the previous kernel K_{i-1} at the beginning of the recursive
        // verification of of the folding of K_{i-1} (kernel), A_{i} (app). This verification happens in K_{i}
        merge_commitments.T_prev_commitments = std::move(kernel_input.ecc_op_tables);

        BB_ASSERT_EQ(verifier_inputs.type == QUEUE_TYPE::HN || verifier_inputs.type == QUEUE_TYPE::HN_TAIL ||
                         verifier_inputs.type == QUEUE_TYPE::HN_FINAL,
                     true,
                     "Kernel circuits should be folded.");
        // Get the previous accum hash
        info("Accumulator hash from IO: ", kernel_input.output_hn_accum_hash);
        BB_ASSERT(prev_accum_hash.has_value());
        bool accum_hash_match = kernel_input.output_hn_accum_hash.get_value() == prev_accum_hash->get_value();
        BB_ASSERT_DEBUG(accum_hash_match,
                        "output_hn_accum_hash mismatch: proof contains "
                            << kernel_input.output_hn_accum_hash.get_value() << " but expected "
                            << prev_accum_hash->get_value());
        kernel_input.output_hn_accum_hash.assert_equal(*prev_accum_hash);

        // Set the kernel return data commitment to be propagated via the public inputs
        bus_depot.set_kernel_return_data_commitment(witness_commitments.return_data);
    } else {
        // Reconstruct the input from the previous app from its public inputs
        AppIO app_input; // pairing points
        app_input.reconstruct_from_public(public_inputs);
        // Add pairing points for aggregation
        pairing_points.emplace_back(app_input.pairing_inputs);

        // Set the app return data commitment to be propagated via the public inputs
        bus_depot.set_app_return_data_commitment(witness_commitments.return_data);
    }

    // Extract the commitments to the subtable corresponding to the incoming circuit
    merge_commitments.t_commitments = witness_commitments.get_ecc_op_wires().get_copy();

    // Recursively verify the corresponding merge proof
    auto [merge_pairing_points, merged_table_commitments] =
        goblin.recursively_verify_merge(circuit, merge_commitments, accumulation_recursive_transcript);
    pairing_points.emplace_back(merge_pairing_points);

    return { output_verifier_accumulator, pairing_points, merged_table_commitments };
}

/**
 * @brief Append logic to complete a kernel circuit
 *
 * @details This is the verifier counterpart to prover's `accumulate()`. While `accumulate()` creates
 * proofs for each circuit, this method adds recursive verification constraints to kernel circuits.
 *
 * The method performs the following steps:
 *   1. SETUP: Initialize transcript, determine kernel type, add ZK masking for tail kernel
 *   2. VERIFICATION LOOP: Process each entry in stdlib_verification_queue (folding + merge + databus)
 *   3. OUTPUT: Set public inputs (KernelIO or HidingKernelIO) for propagation to next kernel
 *
 * @param circuit The kernel circuit to append verification logic to
 */
void Chonk::complete_kernel_circuit_logic(ClientCircuit& circuit)
{
    // Step 1: SETUP - Initialize state and determine kernel type

    // Transcript is shared across recursive verification of the folding of K_{i-1} (kernel) and A_{i} (app)
    auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();

    // T_prev: commitment to previous merged table, propagated via public inputs
    TableCommitments T_prev_commitments;

    // Convert native verification queue to circuit witnesses
    if (stdlib_verification_queue.empty()) {
        instantiate_stdlib_verification_queue(circuit);
    }

    // Determine kernel type from queue contents
    bool is_init_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::OINK);

    bool is_tail_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::HN_TAIL);

    bool is_hiding_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::HN_FINAL);

    // For ZK: Tail kernel adds masking at op queue start
    // The ECC-op subtable for a kernel begins with an eq-and-reset to ensure that the preceeding circuit's subtable
    // cannot affect the ECC-op accumulator for the kernel. For the tail kernel, we additionally add a preceeding no-op
    // to ensure the op queue wires in translator are shiftable, i.e. their 0th coefficient is 0. (The tail kernel
    // subtable is at the top of the final aggregate table since it is the last to be prepended).
    if (is_tail_kernel) {
        BB_ASSERT_EQ(circuit.op_queue->get_current_subtable_size(),
                     0U,
                     "tail kernel ecc ops table should be empty at this point");
        circuit.queue_ecc_no_op();
        // Add randomness at the begining of the tail kernel (whose ecc ops fall at the beginning of the op queue table)
        // to ensure the CHONK proof doesn't leak information about the actual content of the op queue
        hide_op_queue_content_in_tail(circuit);

        // Add the hiding op with random (non-curve) Px, Py values for statistical hiding of accumulated_result.
        hide_op_queue_accumulation_result(circuit);
    }
    circuit.queue_ecc_eq();

    // Step 2: VERIFICATION LOOP - Recursively verify each proof in the queue

    std::vector<PairingPoints> points_accumulator;
    std::optional<RecursiveVerifierAccumulator> current_stdlib_verifier_accumulator;
    if (!is_init_kernel) {
        current_stdlib_verifier_accumulator = RecursiveVerifierAccumulator::stdlib_from_native<RecursiveFlavor::Curve>(
            &circuit, recursive_verifier_native_accum);
    }
    while (!stdlib_verification_queue.empty()) {
        const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();

        auto [output_stdlib_verifier_accumulator, pairing_points, merged_table_commitments] =
            perform_recursive_verification_and_databus_consistency_checks(circuit,
                                                                          verifier_input,
                                                                          current_stdlib_verifier_accumulator,
                                                                          T_prev_commitments,
                                                                          accumulation_recursive_transcript);
        points_accumulator.insert(points_accumulator.end(), pairing_points.begin(), pairing_points.end());
        // Update commitment to the status of the op_queue
        T_prev_commitments = merged_table_commitments;
        // Update the output verifier accumulator
        current_stdlib_verifier_accumulator = output_stdlib_verifier_accumulator;

        stdlib_verification_queue.pop_front();
    }

    // Step 3: OUTPUT - Set public inputs for propagation to next kernel

    PairingPoints pairing_points_aggregator = PairingPoints::aggregate_multiple(points_accumulator);

    // Output differs based on kernel type: HidingKernelIO (no accum hash) vs KernelIO (with accum hash)
    if (is_hiding_kernel) {
        BB_ASSERT_EQ(current_stdlib_verifier_accumulator.has_value(), false);
        // Add randomness at the end of the hiding kernel (whose ecc ops fall right at the end of the op queue table) to
        // ensure the Chonk proof doesn't leak information about the actual content of the op queue
        hide_op_queue_content_in_hiding(circuit);

        HidingKernelIO hiding_output{ pairing_points_aggregator,
                                      bus_depot.get_kernel_return_data_commitment(circuit),
                                      T_prev_commitments };
        hiding_output.set_public();
    } else {
        BB_ASSERT_NEQ(current_stdlib_verifier_accumulator.has_value(), false);
        // Extract native verifier accumulator from the stdlib accum to use it in the next round
        recursive_verifier_native_accum = current_stdlib_verifier_accumulator->get_value<VerifierAccumulator>();

        KernelIO kernel_output;
        kernel_output.pairing_inputs = pairing_points_aggregator;
        kernel_output.kernel_return_data = bus_depot.get_kernel_return_data_commitment(circuit);
        kernel_output.app_return_data = bus_depot.get_app_return_data_commitment(circuit);
        kernel_output.ecc_op_tables = T_prev_commitments;
        RecursiveTranscript hash_transcript;
        kernel_output.output_hn_accum_hash =
            current_stdlib_verifier_accumulator->hash_with_origin_tagging("", hash_transcript);
        info("Kernel output accumulator hash: ", kernel_output.output_hn_accum_hash);
#ifndef NDEBUG
        info("Chonk recursive verification: accumulator hash set in the public inputs matches the one "
             "computed natively: ",
             kernel_output.output_hn_accum_hash.get_value() == native_verifier_accum_hash ? "true" : "false");
#endif
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
    if ((num_circuits_accumulated > 0 && num_circuits_accumulated < num_circuits - 3)) {
        return QUEUE_TYPE::HN;
    }
    // last kernel prior to tail kernel
    if ((num_circuits_accumulated == num_circuits - 3)) {
        return QUEUE_TYPE::HN_TAIL;
    }
    // tail kernel
    if ((num_circuits_accumulated == num_circuits - 2)) {
        return QUEUE_TYPE::HN_FINAL;
    }
    // hiding kernel
    if ((num_circuits_accumulated == num_circuits - 1)) {
        return QUEUE_TYPE::MEGA;
    }
    return QUEUE_TYPE{};
}

/**
 * @brief Execute prover work for accumulation
 *
 * @details Creates proofs that will later be recursively verified in kernel circuits.
 *
 * Prover actions per QUEUE_TYPE (see chonk.hpp for verifier perspective):
 *   - OINK:     instance_to_accumulator (first app, circuit 0)
 *   - HN:       fold (circuits 1..n-4: apps, inner kernels, reset kernels)
 *   - HN_TAIL:  fold (circuit n-3)
 *   - HN_FINAL: fold + decider (tail kernel, circuit n-2)
 *   - MEGA:     MegaZK proof (hiding kernel, circuit n-1)
 *
 * @param circuit The circuit to accumulate
 * @param precomputed_vk Precomputed verification key for the circuit
 */
void Chonk::accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk)
{
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "Chonk: Attempting to accumulate more circuits than expected.");

    BB_ASSERT(precomputed_vk != nullptr, "Chonk::accumulate - VK expected for the provided circuit");

    // Construct the prover instance for circuit
    std::shared_ptr<ProverInstance> prover_instance = std::make_shared<ProverInstance>(circuit);

#ifndef NDEBUG
    debug_incoming_circuit(circuit, prover_instance, precomputed_vk);
#endif

    // If the current circuit exceeds the current size of the commitment key, reinitialize accordingly.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1319)
    if (prover_instance->dyadic_size() > bn254_commitment_key.dyadic_size) {
        bn254_commitment_key = CommitmentKey<curve::BN254>(prover_instance->dyadic_size());
        goblin.commitment_key = bn254_commitment_key;
    }
    prover_instance->commitment_key = bn254_commitment_key;

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

    QUEUE_TYPE queue_type = get_queue_type();

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
        std::tie(proof, prover_accumulator) = prover.fold(prover_accumulator, prover_instance, precomputed_vk);
        break;
    case QUEUE_TYPE::HN_FINAL: {
        vinfo("Accumulating tail kernel");
        std::tie(proof, prover_accumulator) = prover.fold(prover_accumulator, prover_instance, precomputed_vk);
        DeciderProver decider(prover_accumulation_transcript);
        decider_proof = decider.construct_proof(bn254_commitment_key, prover_accumulator);
        break;
    }
    case QUEUE_TYPE::MEGA:
        vinfo("Generating proof for hiding kernel");
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Method for constructing hiding kernel proof
        // constructs a new ProverInstance (with ZK Flavor). For now just do a hacky shared ptr deallocation to avoid
        // double memory for storing two instances.
        prover_instance.reset();
        proof = construct_honk_proof_for_hiding_kernel(circuit, precomputed_vk);
        break;
    }

    VerifierInputs queue_entry{ std::move(proof), precomputed_vk, queue_type, is_kernel };
    verification_queue.push_back(queue_entry);

    // Construct merge proof (excluded for hiding kernel since accumulation terminates with
    // tail kernel and hiding merge proof is constructed as part of goblin proving)
    if (queue_entry.type != QUEUE_TYPE::MEGA) {
#ifndef NDEBUG
        // In debugging builds update native verifier accumulator
        update_native_verifier_accumulator(queue_entry, verifier_transcript);
#endif
        goblin.prove_merge(prover_accumulation_transcript);
    }

    num_circuits_accumulated++;
}

/**
 * @brief Add a hiding op with fully random Px, Py field elements to prevent information leakage in Translator proof.
 *
 * @details The Translator circuit builder evaluates a batched polynomial (representing the four op queue polynomials
 * in UltraOp format) at a random challenge x. This evaluation result (called accumulated_result in translator) is
 * included in the translator proof and verified against the equivalent computation performed by ECCVM (in
 * verify_translation, establishing equivalence between ECCVM and UltraOp format).
 *
 */
void Chonk::hide_op_queue_accumulation_result(ClientCircuit& circuit)
{
    // Use random Fq field elements as Px and Py.
    using Fq = curve::Grumpkin::ScalarField; // Same as BN254::BaseField
    circuit.queue_ecc_hiding_op(Fq::random_element(), Fq::random_element());
}

/**
 * @brief Adds three random non-ops to the tail kernel for zero-knowledge.
 *
 * @details See MERGE_PROTOCOL.md (ZK Considerations) for detailed analysis.
 */
void Chonk::hide_op_queue_content_in_tail(ClientCircuit& circuit)
{
    circuit.queue_ecc_random_op();
    circuit.queue_ecc_random_op();
    circuit.queue_ecc_random_op();
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
 * @brief Construct a zero-knowledge proof for the Hiding kernel, which recursively verifies the last folding,
 * merge and decider proof.
 */
HonkProof Chonk::construct_honk_proof_for_hiding_kernel(ClientCircuit& circuit,
                                                        const std::shared_ptr<MegaVerificationKey>& verification_key)
{
    auto hiding_prover_inst = std::make_shared<DeciderZKProvingKey>(circuit, bn254_commitment_key);

    // Hiding kernel is proven by a MegaZKProver
    MegaZKProver prover(hiding_prover_inst, verification_key, transcript);
    HonkProof proof = prover.construct_proof();

    return proof;
}

/**
 * @brief Construct a proof for the IVC, which, if verified, fully establishes its correctness
 *
 * @return Proof
 */
Chonk::Proof Chonk::prove()
{
    // deallocate the accumulator
    prover_accumulator = ProverAccumulator();
    auto mega_proof = verification_queue.front().proof;

    // A transcript is shared between the Hiding kernel prover and the Goblin prover
    goblin.transcript = transcript;

    // Returns a proof for the Hiding kernel and the Goblin proof. The latter consists of Translator and ECCVM proof
    // for the whole ecc op table and the merge proof for appending the subtable coming from the Hiding kernel. The
    // final merging is done via appending to facilitate creating a zero-knowledge merge proof. This enables us to add
    // randomness to the beginning of the tail kernel and the end of the hiding kernel, hiding the commitments and
    // evaluations of both the previous table and the incoming subtable.
    return { mega_proof, goblin.prove(MergeSettings::APPEND) };
};

bool Chonk::verify(const Proof& proof, const VerificationKey& vk)
{
    using TableCommitments = Goblin::TableCommitments;
    // Create a transcript to be shared by MegaZK-, Merge-, ECCVM-, and Translator- Verifiers.
    std::shared_ptr<Goblin::Transcript> chonk_verifier_transcript = std::make_shared<Goblin::Transcript>();

    // Step 1: Verify the Hiding kernel proof
    auto vk_and_hash_mega = std::make_shared<MegaZKFlavor::VKAndHash>(vk.mega);
    MegaZKVerifier verifier{ vk_and_hash_mega, chonk_verifier_transcript };
    auto [mega_verified, kernel_return_data, T_prev_commitments] = verifier.verify_proof(proof.mega_proof);
    vinfo("Mega verified: ", mega_verified);
    if (!mega_verified) {
        info("Chonk verification failed at Mega step");
        return false;
    }

    // Step 2: Perform databus consistency checks
    bool databus_consistency_verified =
        kernel_return_data == verifier.get_verifier_instance()->witness_commitments.calldata;
    vinfo("Databus consistency verified: ", databus_consistency_verified);
    if (!databus_consistency_verified) {
        info("Chonk verification failed at databus consistency check");
        return false;
    }

    // Extract the commitments to the subtable corresponding to the incoming circuit
    TableCommitments t_commitments =
        verifier.get_verifier_instance()->witness_commitments.get_ecc_op_wires().get_copy();

    // Step 3: Goblin verification (merge, eccvm, translator)
    // Reduces Goblin proof to pairing points and IPA claim. In native mode, pairing checks are performed
    // immediately for fail-fast. goblin_checks_passed includes reduction checks + pairing checks (pairing performed).
    GoblinVerifier goblin_verifier{
        chonk_verifier_transcript, proof.goblin_proof, { t_commitments, T_prev_commitments }, MergeSettings::APPEND
    };
    auto [_, ipa_claim, ipa_proof, goblin_checks_passed] = goblin_verifier.reduce_to_pairing_check_and_ipa_opening();
    if (!goblin_checks_passed) {
        info("Chonk verification failed at Goblin checks (merge/eccvm/translator reduction + pairing)");
        return false;
    }

    // Step 4: Verify IPA opening
    auto ipa_transcript = std::make_shared<Goblin::Transcript>(ipa_proof);
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, ipa_claim, ipa_transcript);
    vinfo("Goblin IPA verified: ", ipa_verified);
    if (!ipa_verified) {
        info("Chonk verification failed at IPA check");
        return false;
    }

    return true;
}

// Proof methods
size_t Chonk::Proof::size() const
{
    return mega_proof.size() + goblin_proof.size();
}

std::vector<Chonk::FF> Chonk::Proof::to_field_elements() const
{
    HonkProof proof;

    proof.insert(proof.end(), mega_proof.begin(), mega_proof.end());
    proof.insert(proof.end(), goblin_proof.merge_proof.begin(), goblin_proof.merge_proof.end());
    proof.insert(proof.end(), goblin_proof.eccvm_proof.begin(), goblin_proof.eccvm_proof.end());
    proof.insert(proof.end(), goblin_proof.ipa_proof.begin(), goblin_proof.ipa_proof.end());
    proof.insert(proof.end(), goblin_proof.translator_proof.begin(), goblin_proof.translator_proof.end());
    return proof;
};

Chonk::Proof Chonk::Proof::from_field_elements(const std::vector<Chonk::FF>& fields)
{
    HonkProof mega_proof;
    GoblinProof goblin_proof;

    size_t custom_public_inputs_size = fields.size() - Chonk::Proof::PROOF_LENGTH();

    // Mega proof
    auto start_idx = fields.begin();
    auto end_idx = start_idx + static_cast<std::ptrdiff_t>(
                                   MegaZKFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(MegaZKFlavor::VIRTUAL_LOG_N) +
                                   bb::HidingKernelIO::PUBLIC_INPUTS_SIZE + custom_public_inputs_size);
    mega_proof.insert(mega_proof.end(), start_idx, end_idx);

    // Merge proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(MERGE_PROOF_SIZE);
    goblin_proof.merge_proof.insert(goblin_proof.merge_proof.end(), start_idx, end_idx);

    // ECCVM proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
    goblin_proof.eccvm_proof.insert(goblin_proof.eccvm_proof.end(), start_idx, end_idx);

    // IPA proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(IPA_PROOF_LENGTH);
    goblin_proof.ipa_proof.insert(goblin_proof.ipa_proof.end(), start_idx, end_idx);

    // Translator proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
    goblin_proof.translator_proof.insert(goblin_proof.translator_proof.end(), start_idx, end_idx);

    return { mega_proof, goblin_proof };
};

msgpack::sbuffer Chonk::Proof::to_msgpack_buffer() const
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, *this);
    return buffer;
}

uint8_t* Chonk::Proof::to_msgpack_heap_buffer() const
{
    msgpack::sbuffer buffer = to_msgpack_buffer();

    std::vector<uint8_t> buf(buffer.data(), buffer.data() + buffer.size());
    return to_heap_buffer(buf);
}

Chonk::Proof Chonk::Proof::from_msgpack_buffer(uint8_t const*& buffer)
{
    auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);

    msgpack::sbuffer sbuf;
    sbuf.write(reinterpret_cast<char*>(uint8_buffer.data()), uint8_buffer.size());

    return from_msgpack_buffer(sbuf);
}

Chonk::Proof Chonk::Proof::from_msgpack_buffer(const msgpack::sbuffer& buffer)
{
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
    msgpack::object obj = oh.get();
    Proof proof;
    obj.convert(proof);
    return proof;
}

void Chonk::Proof::to_file_msgpack(const std::string& filename) const
{
    msgpack::sbuffer buffer = to_msgpack_buffer();
    std::ofstream ofs(filename, std::ios::binary);
    if (!ofs.is_open()) {
        throw_or_abort("Failed to open file for writing.");
    }
    ofs.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    ofs.close();
}

Chonk::Proof Chonk::Proof::from_file_msgpack(const std::string& filename)
{
    std::ifstream ifs(filename, std::ios::binary);
    if (!ifs.is_open()) {
        throw_or_abort("Failed to open file for reading.");
    }

    ifs.seekg(0, std::ios::end);
    size_t file_size = static_cast<size_t>(ifs.tellg());
    ifs.seekg(0, std::ios::beg);

    std::vector<char> buffer(file_size);
    ifs.read(buffer.data(), static_cast<std::streamsize>(file_size));
    ifs.close();
    msgpack::sbuffer msgpack_buffer;
    msgpack_buffer.write(buffer.data(), file_size);

    return Proof::from_msgpack_buffer(msgpack_buffer);
}

// VerificationKey construction
Chonk::VerificationKey Chonk::get_vk() const
{
    BB_ASSERT_EQ(verification_queue.size(), 1UL);
    BB_ASSERT_EQ(verification_queue.front().type == QUEUE_TYPE::MEGA, true);
    auto verification_key = verification_queue.front().honk_vk;
    return { verification_key,
             std::make_shared<ECCVMVerificationKey>(),
             std::make_shared<TranslatorVerificationKey>() };
}

#ifndef NDEBUG
void Chonk::update_native_verifier_accumulator(const VerifierInputs& queue_entry,
                                               const std::shared_ptr<Transcript>& verifier_transcript)
{
    info("======= DEBUGGING INFO FOR NATIVE FOLDING STEP =======");

    auto verifier_inst = std::make_shared<VerifierInstance>(queue_entry.honk_vk);

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
        native_verifier_accum_hash = native_verifier_accum.hash_with_origin_tagging("", *verifier_transcript);
        info("Chonk accumulate: hash of verifier accumulator computed natively set in previous kernel IO: ",
             native_verifier_accum_hash);
    }
    has_last_app_been_accumulated = num_circuits_accumulated + 1 == num_circuits - 4;
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
         vk->compare(*precomputed_vk) ? "true" : "false");

    info("======= END OF DEBUGGING INFO FOR INCOMING CIRCUIT =======");
}
#endif

} // namespace bb
