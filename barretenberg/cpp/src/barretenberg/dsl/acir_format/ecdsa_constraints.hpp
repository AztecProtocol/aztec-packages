// === AUDIT STATUS ===
// internal:    { status: completed, auditors: [Federico], date: 2025-10-24 }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

/**
 * @brief ECDSA constraints
 *
 * @details ECDSA constraints have seven components:
 *  1. `type`, the curve type used to distinguish which curve the ECDSA constraint is over
 *  2. `hashed_message`, an array of length 32 representing the witness indices of the byte representation of the hash
 *     of the message for which the signature must be verified
 *  3. `signature`, an array of length 64 representing the witness indices of the signature \f$(r, s)\f$ which must be
 *     verified. The components are represented as big-endian, 32-byte numbers.
 *  4. `pub_x_indices`, an array of length 32 representing the witness indices of the byte representation the x
 *     coordinate of the public key against which the signature should be verified.
 *  5. `pub_y_indices`, an array of length 32 representing the witness indices of the byte representation the y
 *     coordinate of the public key against which the signature should be verified.
 *  6. `result`, an array of length 1 representing the witness index of the expected result of the signature
 *     verification.
 *  7. `predicate`, a boolean witness (or constant) indicating whether the constraint should be disabled or not. If the
 *     predicate is witness false, then the constraint is disabled, i.e it must not fail and can return whatever. When
 *     `predicate` is set to witness false, we override some values to ensure that all the circuit constraints are
 *     satisfied:
 *      - We set - r = s = H(m) = 1 (the hash is set to 1 to avoid failures in the byte_array constructor)
 *      - We set the public key to be 2 times the generator of the curve.
 */
struct EcdsaConstraint {
    bb::CurveType type;

    // The byte representation of the hashed message.
    std::array<uint32_t, 32> hashed_message;

    // The signature
    std::array<uint32_t, 64> signature;

    // The public key against which the signature must be verified.
    // Since Fr does not have enough bits to represent the prime field in
    // secp256k1 or secp256r1, a byte array is used.
    std::array<uint32_t, 32> pub_x_indices;
    std::array<uint32_t, 32> pub_y_indices;

    // Predicate indicating whether the constraint should be disabled:
    // - true: the constraint is valid
    // - false: the constraint is disabled, i.e it must not fail and can return whatever.
    WitnessOrConstant<bb::fr> predicate;

    // Expected result of signature verification
    uint32_t result;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(hashed_message, signature, pub_x_indices, pub_y_indices, predicate, result);
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
