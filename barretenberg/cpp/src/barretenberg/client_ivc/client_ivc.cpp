// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

// Constructor
ClientIVC::ClientIVC(size_t num_circuits, TraceSettings trace_settings)
    : trace_usage_tracker(trace_settings)
    , num_circuits(num_circuits)
    , trace_settings(trace_settings)
    , goblin(bn254_commitment_key)
{
    BB_ASSERT_GT(num_circuits, 0UL, "Number of circuits must be specified and greater than 0.");
    // Allocate BN254 commitment key based on the max dyadic Mega structured trace size and translator circuit size.
    // https://github.com/AztecProtocol/barretenberg/issues/1319): Account for Translator only when it's necessary
    size_t commitment_key_size =
        std::max(trace_settings.dyadic_size(), 1UL << TranslatorFlavor::CONST_TRANSLATOR_LOG_N);
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
void ClientIVC::instantiate_stdlib_verification_queue(
    ClientCircuit& circuit, const std::vector<std::shared_ptr<RecursiveVKAndHash>>& input_keys)
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

std::shared_ptr<ClientIVC::RecursiveDeciderVerificationKey> ClientIVC::perform_oink_recursive_verification(
    ClientCircuit& circuit,
    const std::shared_ptr<RecursiveDeciderVerificationKey>& verifier_instance,
    const std::shared_ptr<RecursiveTranscript>& transcript,
    const StdlibProof& proof)
{
    OinkRecursiveVerifier verifier{ &circuit, verifier_instance, transcript };
    verifier.verify_proof(proof);

    verifier_instance->target_sum = StdlibFF::from_witness_index(&circuit, circuit.zero_idx);
    // Get the gate challenges for sumcheck/combiner computation
    verifier_instance->gate_challenges =
        transcript->template get_powers_of_challenge<StdlibFF>("gate_challenge", CONST_PG_LOG_N);

    return verifier_instance;
}

std::shared_ptr<ClientIVC::RecursiveDeciderVerificationKey> ClientIVC::perform_pg_recursive_verification(
    ClientCircuit& circuit,
    const std::shared_ptr<RecursiveDeciderVerificationKey>& verifier_accumulator,
    const std::shared_ptr<RecursiveDeciderVerificationKey>& verifier_instance,
    const std::shared_ptr<RecursiveTranscript>& transcript,
    const StdlibProof& proof,
    std::optional<StdlibFF>& prev_accum_hash,
    bool is_kernel)
{
    BB_ASSERT_NEQ(verifier_accumulator, nullptr, "verifier_accumulator cannot be null in PG recursive verification");

    // Fiat-Shamir the accumulator. (Only needs to be performed on the first in a series of recursive PG verifications
    // within a given kernel and by convention the kernel proof is always verified first).
    if (is_kernel) {
        prev_accum_hash = verifier_accumulator->hash_through_transcript("", *transcript);
        transcript->add_to_hash_buffer("accum_hash", *prev_accum_hash);
        info("Previous accumulator hash in PG rec verifier: ", *prev_accum_hash);
    }
    // Perform folding recursive verification to update the verifier accumulator
    FoldingRecursiveVerifier verifier{ &circuit, verifier_accumulator, verifier_instance, transcript };
    auto updated_verifier_accumulator = verifier.verify_folding_proof(proof);

    return updated_verifier_accumulator;
}

/**
 * @brief Populate the provided circuit with constraints for (1) recursive verification of the provided accumulation
 * proof and (2) the associated databus commitment consistency checks.
 * @details The recursive verifier will be either Oink or Protogalaxy depending on the specified proof type. In either
 * case, the verifier accumulator is updated in place via the verification algorithm. Databus commitment consistency
 * checks are performed on the witness commitments and public inputs extracted from the proof by the verifier. Merge
 * verification is performed with commitments to the subtable t_j extracted from the PG verifier. The computed
 * commitment T is propagated to the next step of recursive verification.
 *
 * @param circuit
 * @param verifier_inputs {proof, vkey, type (Oink/PG)} A set of inputs for recursive verification
 * @param merge_commitments Container for the commitments for the Merge recursive verification to be performed
 * @param accumulation_recursive_transcript Transcript shared across recursive verification of the folding of
 * K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app)
 *
 * @return Triple of output verifier accumulator, PairingPoints for final verification and commitments to the merged
 * tables as read from the proof by the Merge verifier
 */
std::tuple<std::shared_ptr<ClientIVC::RecursiveDeciderVerificationKey>,
           ClientIVC::PairingPoints,
           ClientIVC::TableCommitments>
ClientIVC::perform_recursive_verification_and_databus_consistency_checks(
    ClientCircuit& circuit,
    const StdlibVerifierInputs& verifier_inputs,
    const std::shared_ptr<ClientIVC::RecursiveDeciderVerificationKey>& input_verifier_accumulator,
    const TableCommitments& T_prev_commitments,
    const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript)
{
    using MergeCommitments = Goblin::MergeRecursiveVerifier::InputCommitments;

    // The pairing points produced by the verification of the decider proof
    PairingPoints decider_pairing_points;

    // Input commitments to be passed to the merge recursive verification
    MergeCommitments merge_commitments{ .T_prev_commitments = T_prev_commitments };

    auto verifier_instance =
        std::make_shared<RecursiveDeciderVerificationKey>(&circuit, verifier_inputs.honk_vk_and_hash);

    std::shared_ptr<ClientIVC::RecursiveDeciderVerificationKey> output_verifier_accumulator;
    std::optional<StdlibFF> prev_accum_hash = std::nullopt;
    // The decider proof exists if the tail kernel has been accumulated
    bool is_hiding_kernel = !decider_proof.empty();

    switch (verifier_inputs.type) {
    case QUEUE_TYPE::OINK: {
        BB_ASSERT_EQ(input_verifier_accumulator, nullptr);

        output_verifier_accumulator = perform_oink_recursive_verification(
            circuit, verifier_instance, accumulation_recursive_transcript, verifier_inputs.proof);

        // T_prev = 0 in the first recursive verification
        merge_commitments.T_prev_commitments = stdlib::recursion::honk::empty_ecc_op_tables(circuit);
        break;
    }
    case QUEUE_TYPE::PG:
    case QUEUE_TYPE::PG_TAIL: {
        BB_ASSERT_NEQ(input_verifier_accumulator, nullptr);

        output_verifier_accumulator = perform_pg_recursive_verification(circuit,
                                                                        input_verifier_accumulator,
                                                                        verifier_instance,
                                                                        accumulation_recursive_transcript,
                                                                        verifier_inputs.proof,
                                                                        prev_accum_hash,
                                                                        verifier_inputs.is_kernel);
        break;
    }
    case QUEUE_TYPE::PG_FINAL: {
        BB_ASSERT_NEQ(input_verifier_accumulator, nullptr);
        BB_ASSERT_EQ(stdlib_verification_queue.size(), size_t(1));

        hide_op_queue_accumulation_result(circuit);

        // Propagate the public inputs of the tail kernel by converting them to public inputs of the hiding circuit.
        auto num_public_inputs = static_cast<size_t>(honk_vk->num_public_inputs);
        num_public_inputs -= KernelIO::PUBLIC_INPUTS_SIZE; // exclude fixed kernel_io public inputs
        for (size_t i = 0; i < num_public_inputs; i++) {
            verifier_inputs.proof[i].set_public();
        }

        auto final_verifier_accumulator = perform_pg_recursive_verification(circuit,
                                                                            input_verifier_accumulator,
                                                                            verifier_instance,
                                                                            accumulation_recursive_transcript,
                                                                            verifier_inputs.proof,
                                                                            prev_accum_hash,
                                                                            verifier_inputs.is_kernel);
        // Perform recursive decider verification
        DeciderRecursiveVerifier decider{ &circuit, final_verifier_accumulator, accumulation_recursive_transcript };
        decider_pairing_points = decider.verify_proof(decider_proof);

        BB_ASSERT_EQ(output_verifier_accumulator, nullptr);
        break;
    }
    default: {
        throw_or_abort("Invalid queue type! Only OINK, PG, PG_TAIL and PG_FINAL are supported");
    }
    }

    // Extract the witness commitments and public inputs from the incoming verifier instance
    WitnessCommitments witness_commitments = std::move(verifier_instance->witness_commitments);
    std::vector<StdlibFF> public_inputs = std::move(verifier_instance->public_inputs);

    PairingPoints nested_pairing_points; // to be extracted from public inputs of app or kernel proof just verified

    if (verifier_inputs.is_kernel) {
        // Reconstruct the input from the previous kernel from its public inputs
        KernelIO kernel_input; // pairing points, databus return data commitments
        kernel_input.reconstruct_from_public(public_inputs);
        nested_pairing_points = kernel_input.pairing_inputs;
        // Perform databus consistency checks
        kernel_input.kernel_return_data.assert_equal(witness_commitments.calldata);
        kernel_input.app_return_data.assert_equal(witness_commitments.secondary_calldata);

        // T_prev is read by the public input of the previous kernel K_{i-1} at the beginning of the recursive
        // verification of of the folding of K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app). This verification
        // happens in K_{i}
        merge_commitments.T_prev_commitments = std::move(kernel_input.ecc_op_tables);

        BB_ASSERT_EQ(verifier_inputs.type == QUEUE_TYPE::PG || verifier_inputs.type == QUEUE_TYPE::PG_TAIL ||
                         verifier_inputs.type == QUEUE_TYPE::PG_FINAL,
                     true,
                     "Kernel circuits should be folded.");
        // Get the previous accum hash
        info("PG accum hash from IO: ", kernel_input.output_pg_accum_hash);
        ASSERT(prev_accum_hash.has_value());
        kernel_input.output_pg_accum_hash.assert_equal(*prev_accum_hash);

        if (!is_hiding_kernel) {
            // The hiding kernel has no return data but uses the traditional public-inputs mechanism
            bus_depot.set_kernel_return_data_commitment(witness_commitments.return_data);
        }
    } else {
        // Reconstruct the input from the previous app from its public inputs
        AppIO app_input; // pairing points
        app_input.reconstruct_from_public(public_inputs);
        nested_pairing_points = app_input.pairing_inputs;

        // Set the app return data commitment to be propagated via the public inputs
        bus_depot.set_app_return_data_commitment(witness_commitments.return_data);
    }

    // Extract the commitments to the subtable corresponding to the incoming circuit
    merge_commitments.t_commitments = witness_commitments.get_ecc_op_wires().get_copy();

    // Recursively verify the corresponding merge proof
    auto [pairing_points, merged_table_commitments] =
        goblin.recursively_verify_merge(circuit, merge_commitments, accumulation_recursive_transcript);

    pairing_points.aggregate(nested_pairing_points);
    if (is_hiding_kernel) {
        pairing_points.aggregate(decider_pairing_points);
    }

    return { output_verifier_accumulator, pairing_points, merged_table_commitments };
}

/**
 * @brief Append logic to complete a kernel circuit
 * @details A kernel circuit may contain some combination of PG recursive verification, merge recursive
 * verification, and databus commitment consistency checks. This method appends this logic to a provided kernel
 * circuit.
 *
 * @param circuit
 */
void ClientIVC::complete_kernel_circuit_logic(ClientCircuit& circuit)
{

    // Transcript to be shared shared across recursive verification of the folding of K_{i-1} (kernel), A_{i,1} (app),
    // .., A_{i, n} (app) (all circuits accumulated between the previous kernel and current one)
    auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();

    // Commitment to the previous state of the op_queue in the recursive verification
    TableCommitments T_prev_commitments;

    // Instantiate stdlib verifier inputs from their native counterparts
    if (stdlib_verification_queue.empty()) {
        instantiate_stdlib_verification_queue(circuit);
    }

    bool is_init_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::OINK);

    bool is_tail_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::PG_TAIL);

    bool is_hiding_kernel =
        stdlib_verification_queue.size() == 1 && (stdlib_verification_queue.front().type == QUEUE_TYPE::PG_FINAL);

    // The ECC-op subtable for a kernel begins with an eq-and-reset to ensure that the preceeding circuit's subtable
    // cannot affect the ECC-op accumulator for the kernel. For the tail kernel, we additionally add a preceeding no-op
    // to ensure the op queue wires in translator are shiftable, i.e. their 0th coefficient is 0. (The tail kernel
    // subtable is at the top of the final aggregate table since it is the last to be prepended).
    if (is_tail_kernel) {
        circuit.queue_ecc_no_op();
    }
    circuit.queue_ecc_eq();

    // Perform Oink/PG and Merge recursive verification + databus consistency checks for each entry in the queue
    PairingPoints points_accumulator;
    std::shared_ptr<RecursiveDeciderVerificationKey> current_stdlib_verifier_accumulator = nullptr;
    if (!is_init_kernel) {
        current_stdlib_verifier_accumulator =
            std::make_shared<RecursiveDeciderVerificationKey>(&circuit, recursive_verifier_native_accum);
    }
    while (!stdlib_verification_queue.empty()) {
        const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();

        auto [output_stdlib_verifier_accumulator, pairing_points, merged_table_commitments] =
            perform_recursive_verification_and_databus_consistency_checks(circuit,
                                                                          verifier_input,
                                                                          current_stdlib_verifier_accumulator,
                                                                          T_prev_commitments,
                                                                          accumulation_recursive_transcript);
        points_accumulator.aggregate(pairing_points);
        // Update commitment to the status of the op_queue
        T_prev_commitments = merged_table_commitments;
        // Update the output verifier accumulator
        current_stdlib_verifier_accumulator = output_stdlib_verifier_accumulator;

        stdlib_verification_queue.pop_front();
    }
    // Set the kernel output data to be propagated via the public inputs
    if (is_hiding_kernel) {
        BB_ASSERT_EQ(current_stdlib_verifier_accumulator, nullptr);
        HidingKernelIO hiding_output{ points_accumulator, T_prev_commitments };
        hiding_output.set_public();
    } else {
        BB_ASSERT_NEQ(current_stdlib_verifier_accumulator, nullptr);
        // Extract native verifier accumulator from the stdlib accum for use on the next round
        recursive_verifier_native_accum =
            std::make_shared<DeciderVerificationKey>(current_stdlib_verifier_accumulator->get_value());

        KernelIO kernel_output;
        kernel_output.pairing_inputs = points_accumulator;
        kernel_output.kernel_return_data = bus_depot.get_kernel_return_data_commitment(circuit);
        kernel_output.app_return_data = bus_depot.get_app_return_data_commitment(circuit);
        kernel_output.ecc_op_tables = T_prev_commitments;
        RecursiveTranscript hash_transcript;
        kernel_output.output_pg_accum_hash =
            current_stdlib_verifier_accumulator->hash_through_transcript("", hash_transcript);
        info("kernel output pg hash: ", kernel_output.output_pg_accum_hash);
        kernel_output.set_public();
    }
}

HonkProof ClientIVC::construct_oink_proof(const std::shared_ptr<DeciderProvingKey>& proving_key,
                                          const std::shared_ptr<MegaVerificationKey>& honk_vk,
                                          const std::shared_ptr<Transcript>& transcript)
{
    vinfo("computing oink proof...");
    MegaOinkProver oink_prover{ proving_key, honk_vk, transcript };
    oink_prover.prove();

    proving_key->target_sum = 0;
    // Get the gate challenges for sumcheck/combiner computation
    proving_key->gate_challenges =
        prover_accumulation_transcript->template get_powers_of_challenge<FF>("gate_challenge", CONST_PG_LOG_N);

    fold_output.accumulator = proving_key; // initialize the prover accum with the completed key

    HonkProof oink_proof = oink_prover.export_proof();
    vinfo("oink proof constructed");
    return oink_proof;
}

HonkProof ClientIVC::construct_pg_proof(const std::shared_ptr<DeciderProvingKey>& proving_key,
                                        const std::shared_ptr<MegaVerificationKey>& honk_vk,
                                        const std::shared_ptr<Transcript>& transcript,
                                        bool is_kernel)
{
    vinfo("computing pg proof...");
    // Only fiat shamir if this is a kernel with the assumption that kernels are always the first being recursively
    // verified.
    if (is_kernel) {
        // Fiat-Shamir the verifier accumulator
        FF accum_hash = native_verifier_accum->hash_through_transcript("", *prover_accumulation_transcript);
        prover_accumulation_transcript->add_to_hash_buffer("accum_hash", accum_hash);
        info("Accumulator hash in PG prover: ", accum_hash);
    }
    auto verifier_instance = std::make_shared<DeciderVerificationKey_<Flavor>>(honk_vk);
    FoldingProver folding_prover({ fold_output.accumulator, proving_key },
                                 { native_verifier_accum, verifier_instance },
                                 transcript,
                                 trace_usage_tracker);
    fold_output = folding_prover.prove();
    vinfo("pg proof constructed");
    return fold_output.proof;
}

/**
 * @brief Get queue type for the proof of a circuit about to be accumulated based on num circuits accumulated so far.
 */
ClientIVC::QUEUE_TYPE ClientIVC::get_queue_type() const
{
    // first app
    if (num_circuits_accumulated == 0) {
        return QUEUE_TYPE::OINK;
    }
    // app (excluding first) or kernel (inner or reset)
    if ((num_circuits_accumulated > 0 && num_circuits_accumulated < num_circuits - 3)) {
        return QUEUE_TYPE::PG;
    }
    // last kernel prior to tail kernel
    if ((num_circuits_accumulated == num_circuits - 3)) {
        return QUEUE_TYPE::PG_TAIL;
    }
    // tail kernel
    if ((num_circuits_accumulated == num_circuits - 2)) {
        return QUEUE_TYPE::PG_FINAL;
    }
    // hiding kernel
    if ((num_circuits_accumulated == num_circuits - 1)) {
        return QUEUE_TYPE::MEGA;
    }
    return QUEUE_TYPE{};
}

/**
 * @brief Execute prover work for accumulation
 * @details Construct an proving key for the provided circuit. If this is the first step in the IVC, simply initialize
 * the folding accumulator. Otherwise, execute the PG prover to fold the proving key into the accumulator and produce a
 * folding proof. Also execute the merge protocol to produce a merge proof.
 *
 * @param circuit
 * this case, just produce a Honk proof for that circuit and do no folding.
 * @param precomputed_vk
 */
void ClientIVC::accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk)
{
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "ClientIVC: Attempting to accumulate more circuits than expected.");

    ASSERT(precomputed_vk != nullptr, "ClientIVC::accumulate - VK expected for the provided circuit");

    // Construct the proving key for circuit
    std::shared_ptr<DeciderProvingKey> proving_key = std::make_shared<DeciderProvingKey>(circuit, trace_settings);

    // If the current circuit overflows past the current size of the commitment key, reinitialize accordingly.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1319)
    if (proving_key->dyadic_size() > bn254_commitment_key.dyadic_size) {
        bn254_commitment_key = CommitmentKey<curve::BN254>(proving_key->dyadic_size());
        goblin.commitment_key = bn254_commitment_key;
    }
    proving_key->commitment_key = bn254_commitment_key;
    trace_usage_tracker.update(circuit);

    honk_vk = precomputed_vk;

    // We're accumulating a kernel if the verification queue is empty (because the kernel circuit contains recursive
    // verifiers for all the entries previously present in the verification queue) and if it's not the first accumulate
    // call (which will always be for an app circuit).
    bool is_kernel = verification_queue.empty() && num_circuits_accumulated > 0;

    // Transcript to be shared across folding of K_{i} (kernel) (the current kernel), A_{i+1,1} (app), .., A_{i+1,
    // n} (app)
    if (is_kernel) {
        prover_accumulation_transcript = std::make_shared<Transcript>();
    }

    // make a copy of the prover_accumulation_transcript for the verifier to use
    auto verifier_transcript =
        Transcript::convert_prover_transcript_to_verifier_transcript(prover_accumulation_transcript);

    QUEUE_TYPE queue_type = get_queue_type();
    HonkProof proof;
    switch (queue_type) {
    case QUEUE_TYPE::OINK:
        vinfo("Accumulating first app circuit with OINK");
        BB_ASSERT_EQ(is_kernel, false, "First circuit accumulated must always be an app");
        proof = construct_oink_proof(proving_key, honk_vk, prover_accumulation_transcript);
        break;
    case QUEUE_TYPE::PG:
    case QUEUE_TYPE::PG_TAIL:
        proof = construct_pg_proof(proving_key, honk_vk, prover_accumulation_transcript, is_kernel);
        break;
    case QUEUE_TYPE::PG_FINAL:
        proof = construct_pg_proof(proving_key, honk_vk, prover_accumulation_transcript, is_kernel);
        decider_proof = construct_decider_proof(prover_accumulation_transcript);
        break;
    case QUEUE_TYPE::MEGA:
        proof = construct_mega_proof_for_hiding_kernel(circuit);
        break;
    }

    VerifierInputs queue_entry{ std::move(proof), honk_vk, queue_type, is_kernel };
    verification_queue.push_back(queue_entry);

    // Update native verifier accumulator and construct merge proof (excluded for hiding kernel since PG terminates with
    // tail kernel and hiding merge proof is constructed as part of goblin proving)
    if (queue_entry.type != QUEUE_TYPE::MEGA) {
        update_native_verifier_accumulator(queue_entry, verifier_transcript);
        goblin.prove_merge(prover_accumulation_transcript);
    }

    num_circuits_accumulated++;
}

/**
 * @brief Add a random operation to the op queue to hide its content in Translator computation.
 *
 * @details Translator circuit builder computes the evaluation at some random challenge x of a batched polynomial
 * derived from processing the ultra_op version of op_queue. This result (referred to as accumulated_result in
 * translator) is included in the translator proof and, on the verifier side, checked against the same computation
 * performed by ECCVM (this is done in verify_translation). To prevent leaking information about the actual
 * accumulated_result (and implicitly about the ops) when the proof is sent to the rollup, a random but valid
 * operation is added to the op queue, to ensure the polynomial over Grumpkin, whose evaluation is
 * accumulated_result, has at least one random coefficient.
 */
void ClientIVC::hide_op_queue_accumulation_result(ClientCircuit& circuit)
{
    Point random_point = Point::random_element();
    FF random_scalar = FF::random_element();
    circuit.queue_ecc_mul_accum(random_point, random_scalar);
    circuit.queue_ecc_eq();
}

/**
 * @brief Construct a zero-knowledge proof for the hiding circuit, which recursively verifies the last folding,
 * merge and decider proof.
 *
 * @return HonkProof - a ZK Mega proof
 */
HonkProof ClientIVC::construct_mega_proof_for_hiding_kernel(ClientCircuit& circuit)
{
    // Note: a structured trace is not used for the hiding kernel
    auto hiding_decider_pk = std::make_shared<DeciderZKProvingKey>(circuit, TraceSettings(), bn254_commitment_key);
    honk_vk = std::make_shared<MegaZKVerificationKey>(hiding_decider_pk->get_precomputed());
    auto& hiding_circuit_vk = honk_vk;
    // Hiding circuit is proven by a MegaZKProver
    MegaZKProver prover(hiding_decider_pk, hiding_circuit_vk, transcript);
    HonkProof proof = prover.construct_proof();

    return proof;
}

/**
 * @brief Construct a proof for the IVC, which, if verified, fully establishes its correctness
 *
 * @return Proof
 */
ClientIVC::Proof ClientIVC::prove()
{
    // deallocate the protogalaxy accumulator
    fold_output.accumulator = nullptr;
    auto mega_proof = verification_queue.front().proof;

    // A transcript is shared between the Hiding circuit prover and the Goblin prover
    goblin.transcript = transcript;

    // Returns a proof for the hiding circuit and the Goblin proof. The latter consists of Translator and ECCVM proof
    // for the whole ecc op table and the merge proof for appending the subtable coming from the hiding circuit. The
    // final merging is done via appending to facilitate creating a zero-knowledge merge proof. This enables us to add
    // randomness to the beginning of the tail kernel and the end of the hiding kernel, hiding the commitments and
    // evaluations of both the previous table and the incoming subtable.
    // https://github.com/AztecProtocol/barretenberg/issues/1360
    return { mega_proof, goblin.prove(MergeSettings::APPEND) };
};

bool ClientIVC::verify(const Proof& proof, const VerificationKey& vk)
{
    using TableCommitments = Goblin::TableCommitments;
    // Create a transcript to be shared by MegaZK-, Merge-, ECCVM-, and Translator- Verifiers.
    std::shared_ptr<Goblin::Transcript> civc_verifier_transcript = std::make_shared<Goblin::Transcript>();
    // Verify the hiding circuit proof
    MegaZKVerifier verifier{ vk.mega, /*ipa_verification_key=*/{}, civc_verifier_transcript };
    auto [mega_verified, T_prev_commitments] = verifier.template verify_proof<bb::HidingKernelIO>(proof.mega_proof);
    vinfo("Mega verified: ", mega_verified);
    // Extract the commitments to the subtable corresponding to the incoming circuit
    TableCommitments t_commitments = verifier.verification_key->witness_commitments.get_ecc_op_wires().get_copy();

    // Goblin verification (final merge, eccvm, translator)
    bool goblin_verified = Goblin::verify(
        proof.goblin_proof, { t_commitments, T_prev_commitments }, civc_verifier_transcript, MergeSettings::APPEND);
    vinfo("Goblin verified: ", goblin_verified);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1396): State tracking in CIVC verifiers.
    return goblin_verified && mega_verified;
}

/**
 * @brief Verify a full proof of the IVC
 *
 * @param proof
 * @return bool
 */
bool ClientIVC::verify(const Proof& proof) const
{
    return verify(proof, get_vk());
}

/**
 * @brief Internal method for constructing a decider proof
 *
 * @return HonkProof
 */
HonkProof ClientIVC::construct_decider_proof(const std::shared_ptr<Transcript>& transcript)
{
    vinfo("prove decider...");
    fold_output.accumulator->commitment_key = bn254_commitment_key;
    MegaDeciderProver decider_prover(fold_output.accumulator, transcript);
    decider_prover.construct_proof();
    return decider_prover.export_proof();
}

/**
 * @brief Construct and verify a proof for the IVC
 * @note Use of this method only makes sense when the prover and verifier are the same entity, e.g. in
 * development/testing.
 *
 */
bool ClientIVC::prove_and_verify()
{
    auto start = std::chrono::steady_clock::now();
    const auto proof = prove();
    auto end = std::chrono::steady_clock::now();
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to call ClientIVC::prove: ", diff.count(), " ms.");

    start = end;
    const bool verified = verify(proof);
    end = std::chrono::steady_clock::now();

    diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    vinfo("time to verify ClientIVC proof: ", diff.count(), " ms.");

    return verified;
}

// Proof methods
size_t ClientIVC::Proof::size() const
{
    return mega_proof.size() + goblin_proof.size();
}

std::vector<ClientIVC::FF> ClientIVC::Proof::to_field_elements() const
{
    HonkProof proof;

    proof.insert(proof.end(), mega_proof.begin(), mega_proof.end());
    proof.insert(proof.end(), goblin_proof.merge_proof.begin(), goblin_proof.merge_proof.end());
    proof.insert(
        proof.end(), goblin_proof.eccvm_proof.pre_ipa_proof.begin(), goblin_proof.eccvm_proof.pre_ipa_proof.end());
    proof.insert(proof.end(), goblin_proof.eccvm_proof.ipa_proof.begin(), goblin_proof.eccvm_proof.ipa_proof.end());
    proof.insert(proof.end(), goblin_proof.translator_proof.begin(), goblin_proof.translator_proof.end());
    return proof;
};

msgpack::sbuffer ClientIVC::Proof::to_msgpack_buffer() const
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, *this);
    return buffer;
}

uint8_t* ClientIVC::Proof::to_msgpack_heap_buffer() const
{
    msgpack::sbuffer buffer = to_msgpack_buffer();

    std::vector<uint8_t> buf(buffer.data(), buffer.data() + buffer.size());
    return to_heap_buffer(buf);
}

ClientIVC::Proof ClientIVC::Proof::from_msgpack_buffer(uint8_t const*& buffer)
{
    auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);

    msgpack::sbuffer sbuf;
    sbuf.write(reinterpret_cast<char*>(uint8_buffer.data()), uint8_buffer.size());

    return from_msgpack_buffer(sbuf);
}

ClientIVC::Proof ClientIVC::Proof::from_msgpack_buffer(const msgpack::sbuffer& buffer)
{
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
    msgpack::object obj = oh.get();
    Proof proof;
    obj.convert(proof);
    return proof;
}

void ClientIVC::Proof::to_file_msgpack(const std::string& filename) const
{
    msgpack::sbuffer buffer = to_msgpack_buffer();
    std::ofstream ofs(filename, std::ios::binary);
    if (!ofs.is_open()) {
        throw_or_abort("Failed to open file for writing.");
    }
    ofs.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    ofs.close();
}

ClientIVC::Proof ClientIVC::Proof::from_file_msgpack(const std::string& filename)
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
ClientIVC::VerificationKey ClientIVC::get_vk() const
{
    return { honk_vk, std::make_shared<ECCVMVerificationKey>(), std::make_shared<TranslatorVerificationKey>() };
}

void ClientIVC::update_native_verifier_accumulator(const VerifierInputs& queue_entry,
                                                   const std::shared_ptr<Transcript>& verifier_transcript)
{
    auto decider_vk = std::make_shared<DeciderVerificationKey>(queue_entry.honk_vk);
    if (queue_entry.type == QUEUE_TYPE::OINK) {
        verifier_transcript->load_proof(queue_entry.proof);
        OinkVerifier<Flavor> oink_verifier{ decider_vk, verifier_transcript };
        oink_verifier.verify();
        native_verifier_accum = decider_vk;
        native_verifier_accum->target_sum = 0;
        // Get the gate challenges for sumcheck/combiner computation
        native_verifier_accum->gate_challenges =
            verifier_transcript->template get_powers_of_challenge<FF>("gate_challenge", CONST_PG_LOG_N);
    } else {
        if (queue_entry.is_kernel) {
            // Fiat-Shamir the verifier accumulator
            FF accum_hash = native_verifier_accum->hash_through_transcript("", *verifier_transcript);
            verifier_transcript->add_to_hash_buffer("accum_hash", accum_hash);
            info("Accumulator hash in PG verifier: ", accum_hash);
        }
        FoldingVerifier folding_verifier({ native_verifier_accum, decider_vk }, verifier_transcript);
        native_verifier_accum = folding_verifier.verify_folding_proof(queue_entry.proof);
    }
}

} // namespace bb
