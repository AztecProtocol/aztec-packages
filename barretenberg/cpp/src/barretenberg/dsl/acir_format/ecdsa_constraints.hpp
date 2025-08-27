// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

struct EcdsaConstraint {
    // The byte representation of the hashed message.
    std::array<uint32_t, 32> hashed_message;

    // The signature
    std::array<uint32_t, 64> signature;

    // The public key against the signature must be verifid. Since Fr does not have enough bits to represent the
    // prime field in secp256k1 or secp256r1, a byte array is used.
    std::array<uint32_t, 32> pub_x_indices;
    std::array<uint32_t, 32> pub_y_indices;

    // Expected result of signature verification
    uint32_t result;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(hashed_message, signature, pub_x_indices, pub_y_indices, result);
    friend bool operator==(EcdsaConstraint const& lhs, EcdsaConstraint const& rhs) = default;
};

template <typename Curve>
void create_ecdsa_verify_constraints(typename Curve::Builder& builder,
                                     const EcdsaConstraint& input,
                                     bool has_valid_witness_assignments = true);

template <typename Curve>
void create_dummy_ecdsa_constraint(typename Curve::Builder& builder,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& hashed_message_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& r_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& s_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& pub_x_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& pub_y_fields,
                                   const stdlib::field_t<typename Curve::Builder>& result_field);

} // namespace acir_format
