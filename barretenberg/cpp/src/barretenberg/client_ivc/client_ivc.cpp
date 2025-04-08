#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

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
    ClientCircuit& circuit, const std::vector<std::shared_ptr<RecursiveVerificationKey>>& input_keys)
{
    bool vkeys_provided = !input_keys.empty();
    if (vkeys_provided && verification_queue.size() != input_keys.size()) {
        info("Warning: Incorrect number of verification keys provided in stdlib verification queue instantiation.");
        ASSERT(false);
    }

    size_t key_idx = 0;
    for (auto& [proof, merge_proof, vkey, type] : verification_queue) {
        // Construct stdlib proof directly from the internal native queue data
        auto stdlib_proof = bb::convert_native_proof_to_stdlib(&circuit, proof);
        auto stdlib_merge_proof = bb::convert_native_proof_to_stdlib(&circuit, merge_proof);

        // Use the provided stdlib vkey if present, otherwise construct one from the internal native queue
        auto stdlib_vkey =
            vkeys_provided ? input_keys[key_idx++] : std::make_shared<RecursiveVerificationKey>(&circuit, vkey);

        stdlib_verification_queue.push_back({ stdlib_proof, stdlib_merge_proof, stdlib_vkey, type });
    }
    verification_queue.clear(); // the native data is not needed beyond this point
}

/**
 * @brief Populate the provided circuit with constraints for (1) recursive verification of the provided accumulation
 * proof and (2) the associated databus commitment consistency checks.
 * @details The recursive verifier will be either Oink or Protogalaxy depending on the specified proof type. In either
 * case, the verifier accumulator is updated in place via the verification algorithm. Databus commitment consistency
 * checks are performed on the witness commitments and public inputs extracted from the proof by the verifier.
 *
 * @param circuit
 * @param verifier_inputs {proof, merge_proof, vkey, type (Oink/PG)} A set of inputs for recursive verification
 */
void ClientIVC::perform_recursive_verification_and_databus_consistency_checks(
    ClientCircuit& circuit, const StdlibVerifierInputs& verifier_inputs)
{
    // Store the decider vk for the incoming circuit; its data is used in the databus consistency checks below
    std::shared_ptr<RecursiveDeciderVerificationKey> decider_vk;

    switch (verifier_inputs.type) {
    case QUEUE_TYPE::PG: {
        // Construct stdlib verifier accumulator from the native counterpart computed on a previous round
        auto stdlib_verifier_accum = std::make_shared<RecursiveDeciderVerificationKey>(&circuit, verifier_accumulator);

        // Perform folding recursive verification to update the verifier accumulator
        FoldingRecursiveVerifier verifier{ &circuit, stdlib_verifier_accum, { verifier_inputs.honk_verification_key } };
        auto verifier_accum = verifier.verify_folding_proof(verifier_inputs.proof);

        // Extract native verifier accumulator from the stdlib accum for use on the next round
        verifier_accumulator = std::make_shared<DeciderVerificationKey>(verifier_accum->get_value());

        decider_vk = verifier.keys_to_fold[1]; // decider vk for the incoming circuit

        break;
    }
    case QUEUE_TYPE::OINK: {
        // Construct an incomplete stdlib verifier accumulator from the corresponding stdlib verification key
        auto verifier_accum =
            std::make_shared<RecursiveDeciderVerificationKey>(&circuit, verifier_inputs.honk_verification_key);

        // Perform oink recursive verification to complete the initial verifier accumulator
        OinkRecursiveVerifier oink{ &circuit, verifier_accum };
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

    // Recursively verify the merge proof for the circuit being recursively verified
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/950): handle pairing point accumulation
    [[maybe_unused]] AggregationObject pairing_points =
        GoblinVerifier::recursive_verify_merge(circuit, verifier_inputs.merge_proof);

    // Set the return data commitment to be propagated on the public inputs of the present kernel and perform
    // consistency checks between the calldata commitments and the return data commitments contained within the public
    // inputs
    bus_depot.set_return_data_to_be_propagated_and_perform_consistency_checks(
        decider_vk->witness_commitments.return_data,
        decider_vk->witness_commitments.calldata,
        decider_vk->witness_commitments.secondary_calldata,
        decider_vk->public_inputs,
        decider_vk->verification_key->databus_propagation_data);
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
    circuit.databus_propagation_data.is_kernel = true;

    // Instantiate stdlib verifier inputs from their native counterparts
    if (stdlib_verification_queue.empty()) {
        instantiate_stdlib_verification_queue(circuit);
    }

    // Perform recursive verification and databus consistency checks for each entry in the verification queue
    for (auto& verifier_input : stdlib_verification_queue) {
        perform_recursive_verification_and_databus_consistency_checks(circuit, verifier_input);
    }
    stdlib_verification_queue.clear();

    // Propagate return data commitments via the public inputs for use in databus consistency checks
    bus_depot.propagate_return_data_commitments(circuit);
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
    // Construct merge proof for the present circuit and add to merge verification queue
    MergeProof merge_proof = goblin.prove_merge(circuit);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): Do proper aggregation with merge recursive
    // verifier.
    AggregationObject::add_default_pairing_points_to_public_inputs(circuit);

    // Construct the proving key for circuit
    std::shared_ptr<DeciderProvingKey> proving_key = std::make_shared<DeciderProvingKey>(circuit, trace_settings);

    // If the current circuit overflows past the current size of the commitment key, reinitialize accordingly.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1319)
    if (proving_key->proving_key.circuit_size > bn254_commitment_key->dyadic_size) {
        bn254_commitment_key = std::make_shared<CommitmentKey<curve::BN254>>(proving_key->proving_key.circuit_size);
        goblin.commitment_key = bn254_commitment_key;
    }
    proving_key->proving_key.commitment_key = bn254_commitment_key;

    vinfo("getting honk vk... precomputed?: ", precomputed_vk);
    // Update the accumulator trace usage based on the present circuit
    trace_usage_tracker.update(circuit);

    // Set the verification key from precomputed if available, else compute it
    honk_vk = precomputed_vk ? precomputed_vk : std::make_shared<MegaVerificationKey>(proving_key->proving_key);
    if (mock_vk) {
        honk_vk->set_metadata(proving_key->proving_key);
        vinfo("set honk vk metadata");
    }

    if (!initialized) {
        // If this is the first circuit in the IVC, use oink to complete the decider proving key and generate an oink
        // proof
        MegaOinkProver oink_prover{ proving_key };
        vinfo("computing oink proof...");
        HonkProof oink_proof = oink_prover.prove();
        vinfo("oink proof constructed");
        proving_key->is_accumulator = true; // indicate to PG that it should not run oink on this key
        // Initialize the gate challenges to zero for use in first round of folding
        proving_key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);

        fold_output.accumulator = proving_key; // initialize the prover accum with the completed key

        // Add oink proof and corresponding verification key to the verification queue
        verification_queue.push_back(VerifierInputs{ oink_proof, merge_proof, honk_vk, QUEUE_TYPE::OINK });

        initialized = true;
    } else { // Otherwise, fold the new key into the accumulator
        vinfo("computing folding proof");
        FoldingProver folding_prover({ fold_output.accumulator, proving_key }, trace_usage_tracker);
        fold_output = folding_prover.prove();
        vinfo("constructed folding proof");

        // Add fold proof and corresponding verification key to the verification queue
        verification_queue.push_back(VerifierInputs{ fold_output.proof, merge_proof, honk_vk, QUEUE_TYPE::PG });
    }
}

/**
 * @brief Construct the proving key of the hiding circuit, which recursively verifies the last folding proof and the
 * decider proof.
 */
std::pair<std::shared_ptr<ClientIVC::DeciderZKProvingKey>, ClientIVC::MergeProof> ClientIVC::
    construct_hiding_circuit_key()
{
    trace_usage_tracker.print(); // print minimum structured sizes for each block
    ASSERT(verification_queue.size() == 1);

    FoldProof& fold_proof = verification_queue[0].proof;
    HonkProof decider_proof = decider_prove();

    fold_output.accumulator = nullptr;

    ClientCircuit builder{ goblin.op_queue };
    // The last circuit being folded is a kernel circuit whose public inputs need to be passed to the base rollup
    // circuit. So, these have to be preserved as public inputs to the hiding circuit (and, subsequently, as public
    // inputs to the tube circuit) which are intermediate stages.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1048): link these properly, likely insecure
    auto num_public_inputs = static_cast<uint32_t>(static_cast<uint256_t>(honk_vk->num_public_inputs));
    num_public_inputs -= bb::PAIRING_POINT_ACCUMULATOR_SIZE;      // exclude aggregation object
    num_public_inputs -= bb::PROPAGATED_DATABUS_COMMITMENTS_SIZE; // exclude propagated databus commitments
    for (size_t i = 0; i < num_public_inputs; i++) {
        builder.add_public_variable(fold_proof[i]);
    }

    const StdlibProof<ClientCircuit> stdlib_merge_proof =
        bb::convert_native_proof_to_stdlib(&builder, verification_queue[0].merge_proof);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/950): handle pairing point accumulation
    [[maybe_unused]] auto pairing_points = GoblinVerifier::recursive_verify_merge(builder, stdlib_merge_proof);

    // Construct stdlib accumulator, decider vkey and folding proof
    auto stdlib_verifier_accumulator =
        std::make_shared<RecursiveDeciderVerificationKey>(&builder, verifier_accumulator);

    auto stdlib_decider_vk =
        std::make_shared<RecursiveVerificationKey>(&builder, verification_queue[0].honk_verification_key);

    auto stdlib_proof = bb::convert_native_proof_to_stdlib(&builder, fold_proof);

    // Perform recursive folding verification of the last folding proof
    FoldingRecursiveVerifier folding_verifier{ &builder, stdlib_verifier_accumulator, { stdlib_decider_vk } };
    auto recursive_verifier_accumulator = folding_verifier.verify_folding_proof(stdlib_proof);
    verification_queue.clear();

    // Perform recursive decider verification
    DeciderRecursiveVerifier decider{ &builder, recursive_verifier_accumulator };
    decider.verify_proof(decider_proof);

    AggregationObject::add_default_pairing_points_to_public_inputs(builder);

    // Construct the last merge proof for the present circuit and add to merge verification queue
    MergeProof merge_proof = goblin.prove_merge(builder);

    auto decider_pk = std::make_shared<DeciderZKProvingKey>(builder, TraceSettings(), bn254_commitment_key);
    honk_vk = std::make_shared<MegaZKVerificationKey>(decider_pk->proving_key);

    return { decider_pk, merge_proof };
}

/**
 * @brief Construct the hiding circuit  then produce a proof of the circuit's correctness with MegaHonk.
 *
 * @return HonkProof - a Mega proof
 */
std::pair<HonkProof, ClientIVC::MergeProof> ClientIVC::construct_and_prove_hiding_circuit()
{
    auto [decider_pk, merge_proof] = construct_hiding_circuit_key();
    // FoldingRecursiveVerifier circuit is proven by a MegaZKProver
    MegaZKProver prover(decider_pk);
    HonkProof proof = prover.construct_proof();

    return { proof, merge_proof };
}

void ClientIVC::construct_vk()
{
    construct_hiding_circuit_key();
    goblin.construct_vks();
};

/**
 * @brief Construct a proof for the IVC, which, if verified, fully establishes its correctness
 *
 * @return Proof
 */
ClientIVC::Proof ClientIVC::prove()
{
    auto [mega_proof, merge_proof] = construct_and_prove_hiding_circuit();
    return { mega_proof, goblin.prove(merge_proof) };
};

bool ClientIVC::verify(const Proof& proof, const VerificationKey& vk)
{

    // Verify the hiding circuit proof
    MegaZKVerifier verifer{ vk.mega };
    bool mega_verified = verifer.verify_proof(proof.mega_proof);
    vinfo("Mega verified: ", mega_verified);
    // Goblin verification (final merge, eccvm, translator)
    GoblinVerifier goblin_verifier{ vk.eccvm, vk.translator };
    bool goblin_verified = goblin_verifier.verify(proof.goblin_proof);
    vinfo("Goblin verified: ", goblin_verified);
    return goblin_verified && mega_verified;
}

/**
 * @brief Verify a full proof of the IVC
 *
 * @param proof
 * @return bool
 */
bool ClientIVC::verify(const Proof& proof)
{
    auto eccvm_vk = std::make_shared<ECCVMVerificationKey>(goblin.get_eccvm_proving_key());
    auto translator_vk = std::make_shared<TranslatorVerificationKey>(goblin.get_translator_proving_key());
    return verify(proof, { honk_vk, eccvm_vk, translator_vk });
}

/**
 * @brief Internal method for constructing a decider proof
 *
 * @return HonkProof
 */
HonkProof ClientIVC::decider_prove() const
{
    vinfo("prove decider...");
    fold_output.accumulator->proving_key.commitment_key = bn254_commitment_key;
    MegaDeciderProver decider_prover(fold_output.accumulator);
    vinfo("finished decider proving.");
    return decider_prover.construct_proof();
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

/**
 * @brief Given a set of circuits, compute the verification keys that will be required by the IVC scheme
 * @details The verification keys computed here are in general not the same as the verification keys for the
 * raw input circuits because recursive verifier circuits (merge and/or folding) may be appended to the incoming
 * circuits as part accumulation.
 * @note This method exists for convenience and is not not meant to be used in practice for IVC. Given a set of
 * circuits, it could be run once and for all to compute then save the required VKs. It also provides a convenient
 * (albeit innefficient) way of separating out the cost of computing VKs from a benchmark.
 *
 * @param circuits A copy of the circuits to be accumulated (passing by reference would alter the original circuits)
 * @return std::vector<std::shared_ptr<MegaFlavor::VerificationKey>>
 */
std::vector<std::shared_ptr<MegaFlavor::VerificationKey>> ClientIVC::precompute_folding_verification_keys(
    std::vector<ClientCircuit> circuits)
{
    std::vector<std::shared_ptr<MegaVerificationKey>> vkeys;

    for (auto& circuit : circuits) {
        accumulate(circuit);
        vkeys.emplace_back(honk_vk);
    }

    // Reset the scheme so it can be reused for actual accumulation, maintaining the trace structure setting as is
    TraceSettings settings = trace_settings;
    *this = ClientIVC();
    this->trace_settings = settings;

    return vkeys;
}

} // namespace bb
