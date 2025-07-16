// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1420): pass commitment keys by value
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

/**
 * @brief Populate the provided circuit with constraints for (1) recursive verification of the provided accumulation
 * proof and (2) the associated databus commitment consistency checks.
 * @details The recursive verifier will be either Oink or Protogalaxy depending on the specified proof type. In either
 * case, the verifier accumulator is updated in place via the verification algorithm. Databus commitment consistency
 * checks are performed on the witness commitments and public inputs extracted from the proof by the verifier.
 *
 * @param circuit
 * @param verifier_inputs {proof, vkey, type (Oink/PG)} A set of inputs for recursive verification
 * @param accumulation_recursive_transcript Transcript shared across recursive verification of the folding of
 * K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n} (app)
 */
ClientIVC::PairingPoints ClientIVC::perform_recursive_verification_and_databus_consistency_checks(
    ClientCircuit& circuit,
    const StdlibVerifierInputs& verifier_inputs,
    const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript)
{
    // Store the decider vk for the incoming circuit; its data is used in the databus consistency checks below
    std::shared_ptr<RecursiveDeciderVerificationKey> decider_vk;

    switch (verifier_inputs.type) {
    case QUEUE_TYPE::PG: {
        // Construct stdlib verifier accumulator from the native counterpart computed on a previous round
        auto stdlib_verifier_accum = std::make_shared<RecursiveDeciderVerificationKey>(&circuit, verifier_accumulator);

        // Perform folding recursive verification to update the verifier accumulator
        FoldingRecursiveVerifier verifier{
            &circuit, stdlib_verifier_accum, { verifier_inputs.honk_vk_and_hash }, accumulation_recursive_transcript
        };
        auto verifier_accum = verifier.verify_folding_proof(verifier_inputs.proof);

        // Extract native verifier accumulator from the stdlib accum for use on the next round
        verifier_accumulator = std::make_shared<DeciderVerificationKey>(verifier_accum->get_value());

        decider_vk = verifier.keys_to_fold[1]; // decider vk for the incoming circuit

        break;
    }
    case QUEUE_TYPE::OINK: {
        // Construct an incomplete stdlib verifier accumulator from the corresponding stdlib verification key
        auto verifier_accum =
            std::make_shared<RecursiveDeciderVerificationKey>(&circuit, verifier_inputs.honk_vk_and_hash);

        // Perform oink recursive verification to complete the initial verifier accumulator
        OinkRecursiveVerifier oink{ &circuit, verifier_accum, accumulation_recursive_transcript };
        oink.verify_proof(verifier_inputs.proof);
        verifier_accum->is_accumulator = true; // indicate to PG that it should not run oink

        // Extract native verifier accumulator from the stdlib accum for use on the next round
        verifier_accumulator = std::make_shared<DeciderVerificationKey>(verifier_accum->get_value());
        // Initialize the gate challenges to zero for use in first round of folding
        verifier_accumulator->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);

        decider_vk = verifier_accum; // decider vk for the incoming circuit

        break;
    }
    }

    // Recursively verify the corresponding merge proof
    PairingPoints pairing_points = goblin.recursively_verify_merge(
        circuit, decider_vk->witness_commitments.get_ecc_op_wires(), accumulation_recursive_transcript);

    PairingPoints nested_pairing_points; // to be extracted from public inputs of app or kernel proof just verified

    if (verifier_inputs.is_kernel) {
        // Reconstruct the input from the previous kernel from its public inputs
        KernelIO kernel_input; // pairing points, databus return data commitments
        kernel_input.reconstruct_from_public(decider_vk->public_inputs);
        nested_pairing_points = kernel_input.pairing_inputs;

        // Perform databus consistency checks
        kernel_input.kernel_return_data.assert_equal(decider_vk->witness_commitments.calldata);
        kernel_input.app_return_data.assert_equal(decider_vk->witness_commitments.secondary_calldata);

        // Set the kernel return data commitment to be propagated via the public inputs
        bus_depot.set_kernel_return_data_commitment(decider_vk->witness_commitments.return_data);
    } else {
        // Reconstruct the input from the previous app from its public inputs
        AppIO app_input; // pairing points
        app_input.reconstruct_from_public(decider_vk->public_inputs);
        nested_pairing_points = app_input.pairing_inputs;

        // Set the app return data commitment to be propagated via the public inputs
        bus_depot.set_app_return_data_commitment(decider_vk->witness_commitments.return_data);
    }

    pairing_points.aggregate(nested_pairing_points);

    return pairing_points;
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
    circuit.is_kernel = true;

    // Transcript to be shared shared across recursive verification of the folding of K_{i-1} (kernel), A_{i,1} (app),
    // .., A_{i, n} (app)
    auto accumulation_recursive_transcript = std::make_shared<RecursiveTranscript>();

    // Instantiate stdlib verifier inputs from their native counterparts
    if (stdlib_verification_queue.empty()) {
        instantiate_stdlib_verification_queue(circuit);
    }

    // Perform Oink/PG and Merge recursive verification + databus consistency checks for each entry in the queue
    PairingPoints points_accumulator;
    while (!stdlib_verification_queue.empty()) {
        const StdlibVerifierInputs& verifier_input = stdlib_verification_queue.front();
        PairingPoints pairing_points = perform_recursive_verification_and_databus_consistency_checks(
            circuit, verifier_input, accumulation_recursive_transcript);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1376): Optimize recursion aggregation - seems we
        // can use `batch_mul` here to decrease the size of the `ECCOpQueue`, but must be cautious with FS security.
        points_accumulator.aggregate(pairing_points);

        stdlib_verification_queue.pop_front();
    }

    // Set the kernel output data to be propagated via the public inputs
    KernelIO kernel_output;
    kernel_output.pairing_inputs = points_accumulator;
    kernel_output.kernel_return_data = bus_depot.get_kernel_return_data_commitment(circuit);
    kernel_output.app_return_data = bus_depot.get_app_return_data_commitment(circuit);

    kernel_output.set_public();
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
void ClientIVC::accumulate(ClientCircuit& circuit,
                           const std::shared_ptr<MegaVerificationKey>& precomputed_vk,
                           const bool mock_vk)
{
    BB_ASSERT_LT(
        num_circuits_accumulated, num_circuits, "ClientIVC: Attempting to accumulate more circuits than expected.");

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1454): Investigate whether is_kernel should be part of
    // the circuit VK
    if (circuit.is_kernel) {
        // Transcript to be shared across folding of K_{i} (kernel), A_{i+1,1} (app), .., A_{i+1, n} (app)
        accumulation_transcript = std::make_shared<Transcript>();
    }

    // Construct the proving key for circuit
    std::shared_ptr<DeciderProvingKey> proving_key = std::make_shared<DeciderProvingKey>(circuit, trace_settings);

    // If the current circuit overflows past the current size of the commitment key, reinitialize accordingly.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1319)
    if (proving_key->dyadic_size() > bn254_commitment_key.dyadic_size) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1420): pass commitment keys by value
        bn254_commitment_key = CommitmentKey<curve::BN254>(proving_key->dyadic_size());
        goblin.commitment_key = bn254_commitment_key;
    }
    proving_key->commitment_key = bn254_commitment_key;

    vinfo("getting honk vk... precomputed?: ", precomputed_vk);
    // Update the accumulator trace usage based on the present circuit
    trace_usage_tracker.update(circuit);

    // Set the verification key from precomputed if available, else compute it
    {
        PROFILE_THIS_NAME("ClientIVC::accumulate create MegaVerificationKey");
        honk_vk =
            precomputed_vk ? precomputed_vk : std::make_shared<MegaVerificationKey>(proving_key->get_precomputed());
    }
    // mock_vk is used in benchmarks to avoid any VK construction.
    if (mock_vk) {
        honk_vk->set_metadata(proving_key->get_metadata());
        vinfo("set honk vk metadata");
    }

    VerifierInputs queue_entry{ .honk_vk = honk_vk, .is_kernel = circuit.is_kernel };
    if (num_circuits_accumulated == 0) { // First circuit in the IVC
        BB_ASSERT_EQ(circuit.is_kernel, false, "First circuit accumulated is always be an app");
        // For first circuit in the IVC, use oink to complete the decider proving key and generate an oink proof
        MegaOinkProver oink_prover{ proving_key, honk_vk, accumulation_transcript };
        vinfo("computing oink proof...");
        oink_prover.prove();
        HonkProof oink_proof = oink_prover.export_proof();
        vinfo("oink proof constructed");
        proving_key->is_accumulator = true; // indicate to PG that it should not run oink on this key
        // Initialize the gate challenges to zero for use in first round of folding
        proving_key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);

        fold_output.accumulator = proving_key; // initialize the prover accum with the completed key

        queue_entry.type = QUEUE_TYPE::OINK;
        queue_entry.proof = oink_proof;
    } else { // Otherwise, fold the new key into the accumulator
        vinfo("computing folding proof");
        auto vk = std::make_shared<DeciderVerificationKey_<Flavor>>(honk_vk);
        FoldingProver folding_prover({ fold_output.accumulator, proving_key },
                                     { verifier_accumulator, vk },
                                     accumulation_transcript,
                                     trace_usage_tracker);
        fold_output = folding_prover.prove();
        vinfo("constructed folding proof");

        queue_entry.type = QUEUE_TYPE::PG;
        queue_entry.proof = fold_output.proof;
    }
    verification_queue.push_back(queue_entry);

    // Construct merge proof for the present circuit
    goblin.prove_merge(accumulation_transcript);

    num_circuits_accumulated++;
}

/**
 * @brief Add a random operation to the op queue to hide its content in Translator computation.
 *
 * @details Translator circuit builder computes the evaluation at some random challenge x of a batched polynomial
 * derived from processing the ultra_op version of op_queue. This result (referred to as accumulated_result in
 * translator) is included in the translator proof and, on the verifier side, checked against the same computation
 * performed by ECCVM (this is done in verify_translation). To prevent leaking information about the actual
 * accumulated_result (and implicitly about the ops) when the proof is sent to the rollup, a random but valid operation
 * is added to the op queue, to ensure the polynomial over Grumpkin, whose evaluation is accumulated_result, has at
 * least one random coefficient.
 */
void ClientIVC::hide_op_queue_accumulation_result(ClientCircuit& circuit)
{
    Point random_point = Point::random_element();
    FF random_scalar = FF::random_element();
    circuit.queue_ecc_mul_accum(random_point, random_scalar);
    circuit.queue_ecc_eq();
}

/**
 * @brief Construct the proving key of the hiding circuit, which recursively verifies the last folding proof and the
 * decider proof.
 */
std::shared_ptr<ClientIVC::DeciderZKProvingKey> ClientIVC::construct_hiding_circuit_key()
{
    BB_ASSERT_EQ(num_circuits_accumulated,
                 num_circuits,
                 "All circuits must be accumulated before constructing the hiding circuit.");
    trace_usage_tracker.print(); // print minimum structured sizes for each block
    BB_ASSERT_EQ(verification_queue.size(), static_cast<size_t>(1));

    FoldProof& fold_proof = verification_queue[0].proof;
    HonkProof decider_proof = decider_prove();

    fold_output.accumulator = nullptr;

    ClientCircuit builder{ goblin.op_queue };

    // Shared transcript between PG and Merge
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1453): Investigate whether Decider/PG/Merge need to
    // share a transcript
    std::shared_ptr<RecursiveTranscript> pg_merge_transcript = std::make_shared<RecursiveTranscript>();

    // Add a no-op at the beginning of the hiding circuit to ensure the wires representing the op queue in translator
    // circuit are well formed to allow correctly representing shiftable polynomials (which are
    // expected to start with 0).
    builder.queue_ecc_no_op();

    hide_op_queue_accumulation_result(builder);

    // Construct stdlib accumulator, decider vkey and folding proof
    auto stdlib_verifier_accumulator =
        std::make_shared<RecursiveDeciderVerificationKey>(&builder, verifier_accumulator);

    auto stdlib_vk_and_hash = std::make_shared<RecursiveVKAndHash>(
        std::make_shared<RecursiveVerificationKey>(&builder, verification_queue[0].honk_vk),
        ClientIVC::RecursiveFlavor::FF::from_witness(&builder, verification_queue[0].honk_vk->hash()));

    StdlibProof stdlib_proof(builder, fold_proof);

    // Propagate the public inputs of the tail kernel by converting them to public inputs of the hiding circuit.
    auto num_public_inputs = static_cast<size_t>(honk_vk->num_public_inputs);
    num_public_inputs -= KernelIO::PUBLIC_INPUTS_SIZE; // exclude fixed kernel_io public inputs
    for (size_t i = 0; i < num_public_inputs; i++) {
        stdlib_proof[i].set_public();
    }

    // Perform recursive folding verification of the last folding proof
    FoldingRecursiveVerifier folding_verifier{
        &builder, stdlib_verifier_accumulator, { stdlib_vk_and_hash }, pg_merge_transcript
    };
    auto recursive_verifier_accumulator = folding_verifier.verify_folding_proof(stdlib_proof);
    verification_queue.clear();

    // Get the completed decider verification key correspondsing to the tail kernel from the folding verifier
    const auto& tail_kernel_decider_vk = folding_verifier.keys_to_fold[1];

    // Reconstruct the KernelIO from the public inputs of the tail kernel and perform databus consistency checks
    KernelIO kernel_input; // pairing points, databus return data commitments
    kernel_input.reconstruct_from_public(tail_kernel_decider_vk->public_inputs);
    kernel_input.kernel_return_data.assert_equal(tail_kernel_decider_vk->witness_commitments.calldata);
    kernel_input.app_return_data.assert_equal(tail_kernel_decider_vk->witness_commitments.secondary_calldata);

    // Perform recursive verification of the last merge proof
    PairingPoints points_accumulator = goblin.recursively_verify_merge(
        builder, tail_kernel_decider_vk->witness_commitments.get_ecc_op_wires(), pg_merge_transcript);
    points_accumulator.aggregate(kernel_input.pairing_inputs);

    // Perform recursive decider verification
    DeciderRecursiveVerifier decider{ &builder, recursive_verifier_accumulator };
    PairingPoints decider_pairing_points = decider.verify_proof(decider_proof);
    points_accumulator.aggregate(decider_pairing_points);

    stdlib::recursion::honk::HidingKernelIO hiding_output{ points_accumulator };
    hiding_output.set_public();

    auto decider_pk = std::make_shared<DeciderZKProvingKey>(builder, TraceSettings(), bn254_commitment_key);
    honk_vk = std::make_shared<MegaZKVerificationKey>(decider_pk->get_precomputed());

    return decider_pk;
}

/**
 * @brief Construct the hiding circuit  then produce a proof of the circuit's correctness with MegaHonk.
 *
 * @return HonkProof - a Mega proof
 */
HonkProof ClientIVC::construct_and_prove_hiding_circuit()
{
    // Create a transcript to be shared by final merge prover, ECCVM, Translator, and Hiding Circuit provers.
    std::shared_ptr<DeciderZKProvingKey> hiding_decider_pk = construct_hiding_circuit_key();
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1431): Avoid computing the hiding circuit verification
    // key during proving. Precompute instead.
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
    auto mega_proof = construct_and_prove_hiding_circuit();

    // A transcript is shared between the Hiding circuit prover and the Goblin prover
    goblin.transcript = transcript;

    // Prove ECCVM and Translator
    return { mega_proof, goblin.prove() };
};

bool ClientIVC::verify(const Proof& proof, const VerificationKey& vk)
{
    // Create a transcript to be shared by MegaZK-, Merge-, ECCVM-, and Translator- Verifiers.
    std::shared_ptr<Goblin::Transcript> civc_verifier_transcript = std::make_shared<Goblin::Transcript>();
    // Verify the hiding circuit proof
    MegaZKVerifier verifer{ vk.mega, /*ipa_verification_key=*/{}, civc_verifier_transcript };
    bool mega_verified = verifer.verify_proof(proof.mega_proof);
    vinfo("Mega verified: ", mega_verified);
    // Goblin verification (final merge, eccvm, translator)
    bool goblin_verified = Goblin::verify(
        proof.goblin_proof, verifer.verification_key->witness_commitments.get_ecc_op_wires(), civc_verifier_transcript);
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
HonkProof ClientIVC::decider_prove() const
{
    vinfo("prove decider...");
    fold_output.accumulator->commitment_key = bn254_commitment_key;
    MegaDeciderProver decider_prover(fold_output.accumulator);
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

} // namespace bb
