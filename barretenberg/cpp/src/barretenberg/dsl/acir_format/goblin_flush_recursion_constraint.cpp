#include "goblin_flush_recursion_constraint.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/goblin_flush_circuit.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;

namespace {

/**
 * @brief Generate a real Goblin proof from mock circuits for testing/VK generation
 */
std::pair<GoblinProof, MergeVerifier::TableCommitments> create_mock_goblin_proof_and_commitments()
{
    Goblin goblin;
    GoblinMockCircuits::construct_and_merge_mock_circuits(goblin, 3);
    goblin.prove_merge(goblin.transcript, MergeSettings::APPEND);

    // Reset the transcript as the goblin verification starts a new transcript
    goblin.transcript = std::make_shared<NativeTranscript>();
    goblin.prove_eccvm();
    goblin.prove_translator();

    // Extract merge commitments from op_queue
    typename MergeVerifier::TableCommitments table_commitments;
    auto merged_table = goblin.op_queue->construct_ultra_ops_table_columns();
    CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        table_commitments[idx] = pcs_commitment_key.commit(merged_table[idx]);
    }

    return { goblin.goblin_proof, table_commitments };
}

/**
 * @brief Build Circuit containing the Goblin Recursive Verifier, prove it with Ultra Honk, and return the proof + VK
 */
std::pair<HonkProof, std::shared_ptr<UltraFlavor::VerificationKey>> prove_inner_circuit(
    const GoblinProof& goblin_proof, const MergeVerifier::TableCommitments& merged_table)
{
    auto builder = build_goblin_flush_circuit(goblin_proof, merged_table);
    info("BUILDER IS VALID: ", CircuitChecker::check(builder));

    using Flavor = UltraFlavor;
    using ProverInstance = ProverInstance_<Flavor>;
    using Prover = UltraProver_<Flavor>;

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<Flavor::VerificationKey>(prover_instance->get_precomputed());
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    return { std::move(proof), verification_key };
}

} // anonymous namespace

HonkRecursionConstraintOutput<MegaCircuitBuilder> create_goblin_flush_recursion_constraints(
    MegaCircuitBuilder& builder,
    const RecursionConstraint& input,
    [[maybe_unused]] const std::shared_ptr<IVCBase>& ivc_base)
{
    using Builder = MegaCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using RecursiveFlavor = UltraRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using RecursiveVKAndHash = RecursiveFlavor::VKAndHash;
    using IO = bb::stdlib::recursion::honk::GoblinFlushIO<Builder>;
    using RecursiveVerifier = UltraVerifier_<RecursiveFlavor, IO>;

    BB_ASSERT(input.proof_type == ULTRA_GOBLIN,
              "create_goblin_flush_recursion_constraints: expected ULTRA_GOBLIN proof type");

    GoblinProof goblin_proof;
    MergeVerifier::TableCommitments merged_table;
    MergeVerifier::TableCommitments merged_table_for_verification;

    // Step 1: Generate a Goblin proof and build+prove Inner Circuit on-the-fly
    if (builder.is_write_vk_mode()) {
        std::tie(goblin_proof, merged_table) = create_mock_goblin_proof_and_commitments();
        merged_table_for_verification = merged_table;
    } else {
        Goblin goblin = ivc_base->get_goblin();

        // Get the UltraOpsTable from the ivc
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
        auto merged_poly = goblin.op_queue->construct_ultra_ops_table_columns();

        for (auto [table, poly] : zip_view(merged_table, merged_poly)) {
            table = pcs_commitment_key.commit(poly);
        }

        // Add missing parts
        using Fq = curve::BN254::BaseField;
        goblin.op_queue->no_op_ultra_only();
        goblin.op_queue->random_op_ultra_only();
        goblin.op_queue->random_op_ultra_only();
        goblin.op_queue->random_op_ultra_only();
        goblin.op_queue->append_hiding_op(Fq(0), Fq(0));
        goblin.op_queue->merge();

        // Construct merged table for verification
        auto merged_poly_for_verification = goblin.op_queue->construct_ultra_ops_table_columns();

        for (auto [table, poly] : zip_view(merged_table_for_verification, merged_poly_for_verification)) {
            table = pcs_commitment_key.commit(poly);
        }

        // Prove goblin with AVM_MODE = true
        goblin.set_avm_mode(true);

        goblin.prove_eccvm();
        goblin.prove_translator();

        // Reset goblin
        goblin.set_avm_mode(false);

        goblin_proof = goblin.goblin_proof;
    }

    auto [inner_circuit_proof, inner_circuit_vk] = prove_inner_circuit(goblin_proof, merged_table_for_verification);

    // Step 2: Create witnesses for Inner Circuit's VK and proof directly in the Mega builder
    // (ULTRA_GOBLIN constraints from Noir have empty proof/key - BB constructs everything on-the-fly)
    std::vector<field_ct> vk_fields;
    for (const auto& vk_element : inner_circuit_vk->to_field_elements()) {
        vk_fields.emplace_back(field_ct::from_witness(&builder, vk_element));
    }
    field_ct vk_hash = field_ct::from_witness(&builder, inner_circuit_vk->hash());

    std::vector<field_ct> proof_fields;
    for (const auto& proof_element : inner_circuit_proof) {
        proof_fields.emplace_back(field_ct::from_witness(&builder, proof_element));
    }

    // Step 3: Recursively verify Inner Circuit's proof inside the Mega circuit
    auto vkey = std::make_shared<RecursiveVerificationKey>(vk_fields);
    auto vk_and_hash = std::make_shared<RecursiveVKAndHash>(vkey, vk_hash);

    // Fix vk and its hash as a constant of the circuit
    vkey->fix_witness();
    vk_hash.fix_witness();

    // Recursive verification
    RecursiveVerifier verifier(vk_and_hash);
    auto verifier_output = verifier.verify_proof(proof_fields);

    info("Goblin flush recursion constraint: Inner circuit VK hash = ", inner_circuit_vk->hash());

    return verifier_output;
}

} // namespace acir_format
