#include "acir_composer.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "barretenberg/plonk/proof_system/verification_key/sol_gen.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"

namespace acir_proofs {

AcirComposer::AcirComposer(size_t size_hint, bool verbose)
    : size_hint_(size_hint)
    , verbose_(verbose)
{}

void AcirComposer::create_circuit(acir_format::acir_format& constraint_system)
{
    // WORKTODO: this seems to have made sense for plonk but no longer makes sense for Honk? if we return early then the
    // sizes below never get set and that eventually causes too few srs points to be extracted
    if (builder_.get_num_gates() > 1) {

        info("create_circuit: early return: builder_.get_num_gates() > 1; num_gates = ", builder_.get_num_gates());
        return;
    }
    info("create_circuit: building circuit...");
    builder_ = acir_format::create_circuit(constraint_system, size_hint_); // WORKTODO
    exact_circuit_size_ = builder_.get_num_gates();
    total_circuit_size_ = builder_.get_total_circuit_size();
    circuit_subgroup_size_ = builder_.get_circuit_subgroup_size(total_circuit_size_);
    size_hint_ = circuit_subgroup_size_;
    info("create_circuit: gates: ", builder_.get_total_circuit_size());
}

// this function now populates the circuit builder and finalizes
std::shared_ptr<AcirComposer::ProvingKey> AcirComposer::init_proving_key(acir_format::acir_format& constraint_system)
{
    // populate the builder
    create_circuit(constraint_system);
    // WORKTODO: static execution if this doesn't change composer state
    // finalize the circuit
    goblin.composer.create_instance(builder_);
    return {};
}

std::vector<uint8_t> AcirComposer::create_proof(acir_format::acir_format& constraint_system,
                                                acir_format::WitnessVector& witness,
                                                bool is_recursive)
{
    info("building circuit with witness...");
    builder_ = acir_format::Builder(size_hint_);
    create_circuit_with_witness(builder_, constraint_system, witness);
    info("gates in circuit with witness: ", builder_.get_total_circuit_size());

    // // WORKTODO(NEW_CONSTRAINTS)
    // info("create_proof: ULTRA OPS SIZE = ", builder_.op_queue->ultra_ops.size());

    // // WORKTODO: accumulate creates an instance and a pk, ignoring this one.
    // goblin = [&]() {
    //     if (proving_key_) {
    //         // WORKTODO(WRAP & KEY_TYPES): constructor from proving key needed
    //         info("Proving key exists; initializing a Goblin with it");
    //         return Goblin{ proving_key_, nullptr };
    //     }

    //     // WORKTODO this becomes a Goblin
    //     Goblin goblin;
    //     info("computing proving key...");
    //     // WORKTODO(USE_GOBLIN) construct guh pk from guh builder via a proxy function in Goblin
    //     // WORKTODO(STATIC)
    //     prover_instance_ = goblin.composer.create_instance(builder_);
    //     proving_key_ = prover_instance_->proving_key;
    //     info("done.");
    //     return goblin;
    // }();

    info("creating proof...");
    std::vector<uint8_t> proof;
    if (is_recursive) {
        // WORKTODO: not dealing with this now; in the future this is a call to accumulate
        proof = goblin.construct_proof(builder_);
    } else {
        proof = goblin.construct_proof(builder_);
    }
    return proof;
}

// WORKTODO: this function is not currently being used.
std::shared_ptr<AcirComposer::VerificationKey> AcirComposer::init_verification_key()
{
    if (!proving_key_) {
        throw_or_abort("Compute proving key first.");
    }

    // verification_key_ = prover_instance_->verification_key

    return prover_instance_->verification_key;
}

void AcirComposer::load_verification_key([[maybe_unused]] proof_system::plonk::verification_key_data&& data)
{
    // WORKTODO: goblin verification involves grumpkin srs as well
    // WORKTODO(KEY_TYPES): serialization of vk data
    verification_key_ = std::make_shared<VerificationKey>();
}

bool AcirComposer::verify_proof(std::vector<uint8_t> const& proof, bool is_recursive)
{

    // goblin.composer = acir_format::Composer(proving_key_, verification_key_);

    // if (!verification_key_) {
    //     info("computing verification key...");
    //     prover_instance_ = goblin.composer.create_instance(builder_);
    //     verification_key_ = prover_instance_->verification_key;
    //     info("done computing verification key.");
    // }

    // // Hack. Shouldn't need to do this. 2144 is size with no public inputs.
    // builder_.public_inputs.resize((proof.size() - 2144) / 32);

    // WORKTODO: Ignore this for now
    if (is_recursive) {
        return goblin.verify_proof({ proof });
    } else {
        info("Verify proof.");
        return goblin.verify_proof({ proof });
        info("Verify proof complete.");
    }
}

std::string AcirComposer::get_solidity_verifier()
{
    std::ostringstream stream;
    // WORKTODO(KEY_TYPES)
    auto dummy_verification_key_ = std::make_shared<proof_system::plonk::verification_key>(); // WORKTODO
    // WORKTODO this will just not work
    output_vk_sol(stream, dummy_verification_key_, "UltraVerificationKey");
    return stream.str();
}

/**
 * @brief Takes in a proof buffer and converts into a vector of field elements.
 *        The Recursion opcode requires the proof serialized as a vector of witnesses.
 *        Use this method to get the witness values!
 *
 * @param proof
 * @param num_inner_public_inputs - number of public inputs on the proof being serialized
 */
std::vector<barretenberg::fr> AcirComposer::serialize_proof_into_fields(std::vector<uint8_t> const& proof,
                                                                        size_t num_inner_public_inputs)
{
    transcript::StandardTranscript transcript(proof,
                                              acir_format::Composer::create_manifest(num_inner_public_inputs),
                                              transcript::HashType::PedersenBlake3s,
                                              16);

    return acir_format::export_transcript_in_recursion_format(transcript);
}

/**
 * @brief Takes in a verification key buffer and converts into a vector of field elements.
 *        The Recursion opcode requires the vk serialized as a vector of witnesses.
 *        Use this method to get the witness values!
 *        The composer should already have a verification key initialized.
 */
std::vector<barretenberg::fr> AcirComposer::serialize_verification_key_into_fields()
{
    // WORKTODO: This will stay a hack(?)
    auto dummy_verification_key_ = std::make_shared<proof_system::plonk::verification_key>(); // WORKTODO
    return acir_format::export_key_in_recursion_format(dummy_verification_key_);
}

} // namespace acir_proofs
