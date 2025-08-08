#ifndef DISABLE_AZTEC_VM

#include "barretenberg/dsl/acir_format/ecdsa_secp256k1.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <cstddef>

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;

/**
 * @brief Creates a dummy vkey and proof object.
 * @details Populates the key and proof vectors with dummy values in the write_vk case when we do not have a valid
 * witness. The bulk of the logic is setting up certain values correctly like the circuit size, aggregation object, and
 * commitments.
 *
 * @param builder
 * @param proof_size Size of proof with NO public inputs
 * @param public_inputs_size Total size of public inputs including aggregation object
 * @param key_fields
 * @param proof_fields
 */
void create_dummy_vkey_and_proof(Builder& builder,
                                 [[maybe_unused]] size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<field_ct>& key_fields,
                                 const std::vector<field_ct>& proof_fields);

} // namespace acir_format
#endif // DISABLE_AZTEC_VM
