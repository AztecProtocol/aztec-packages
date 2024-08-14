#include "client_ivc_accumulation_constraint.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

using namespace bb;

// WORKTODO: define this?
using Builder = MegaCircuitBuilder;
// namespace stdlib {
// using FoldingProof = std::vector<field_t<Builder>>;
// }
namespace acir_format {

/**
 * @brief Add constraints required to recursively verify an UltraPlonk proof
 *
 * @param builder
 * @param input
 * @tparam has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 * @tparam inner_proof_contains_recursive_proof. Do we expect the inner proof to also have performed recursive
 * verification? We need to know this at circuit-compile time.
 *
 * @note We currently only support RecursionConstraint where inner_proof_contains_recursive_proof = false.
 *       We would either need a separate ACIR opcode where inner_proof_contains_recursive_proof = true,
 *       or we need non-witness data to be provided as metadata in the ACIR opcode
 */
void create_client_ivc_accumulation_constraints([[maybe_unused]] Builder& builder,
                                                [[maybe_unused]] const RecursionConstraint& input,
                                                [[maybe_unused]] const ClientIVC& ivc)
{
    // // take a native folding proof and instantiate as witnesses
    // stdlib::FoldingProof proof_ct = feed_proof_to_builder(builder, ivc.proof);
    // // assert that the public inputs used in the business logic agree with the public inputs that will be consumed by
    // // the folding verifier, linking the current kernel iteration with the previous one
    // rewire_public_inputs(builder, proof_ct, input.proof, inputs.public_inputs);
    // // take a native verification key and instantiate as witnesses
    // stdlib::VerificationKey key_ct = feed_vk_to_builder(builder, ivc.key);
    // // assert that the key used in the business logic agrees with the real key
    // rewire_key(builder, key_ct, input.verification_key);
    // // append folding verifier(s), merge verifier(s) and databus consistency checks
    // ivc.complete_trace(builder, proof_ct, key_ct);
}

} // namespace acir_format
