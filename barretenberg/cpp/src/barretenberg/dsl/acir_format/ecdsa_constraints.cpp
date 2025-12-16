// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Create constraints to verify an ECDSA signature
 *
 * @details Given and ECDSA constraint system, add to the builder constraints that verify the ECDSA signature. We
 * perform the following operations:
 *  1. Reconstruct byte arrays from builder variables (we enforce that each variable fits in one byte and stack them in
 *     a vector) and the boolean result from the corresponding builder variable
 *  2. Reconstruct the public key from the byte representations (big-endian, 32-byte numbers) of the \f$x\f$ and \f$y\f$
 *     coordinates.
 *  3. Enforce uniqueness of the representation of the public key by asserting \f$x < q\f$ and \f$y < q\f$, where
 * \f$q\f$ is the modulus of the base field of the elliptic curve we are working with.
 *  4. Verify the signature against the public key and the hash of the message. We return a bool_t bearing witness to
 *     whether the signature verification was successfull or not.
 *  5. Enforce that the result of the signature verification matches the expected result.
 *
 * @tparam Curve
 * @param builder
 * @param input
 * @param has_valid_witness_assignments
 */
template <typename Curve>
void create_ecdsa_verify_constraints(typename Curve::Builder& builder,
                                     const EcdsaConstraint& input,
                                     bool has_valid_witness_assignments)
{
    using Builder = Curve::Builder;

    using Fq = Curve::fq_ct;
    using Fr = Curve::bigfr_ct;
    using G1 = Curve::g1_bigfr_ct;

    using field_ct = bb::stdlib::field_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;
    using byte_array_ct = bb::stdlib::byte_array<Builder>;

    // Lambda to convert std::vector<field_ct> to byte_array_ct
    auto fields_to_bytes = [](Builder& builder, std::vector<field_ct>& fields) -> byte_array_ct {
        byte_array_ct result(&builder);
        for (auto& field : fields) {
            // Construct byte array of length 1 from the field element
            // The constructor enforces that `field` fits in one byte
            byte_array_ct byte_to_append(field, /*num_bytes=*/1);
            // Append the new byte to the result
            result.write(byte_to_append);
        }

        return result;
    };

    // Define builder variables based on the witness indices
    std::vector<field_ct> hashed_message_fields = fields_from_witnesses(builder, input.hashed_message);
    std::vector<field_ct> r_fields = fields_from_witnesses(builder, std::span(input.signature.begin(), 32));
    std::vector<field_ct> s_fields = fields_from_witnesses(builder, std::span(input.signature.begin() + 32, 32));
    std::vector<field_ct> pub_x_fields = fields_from_witnesses(builder, input.pub_x_indices);
    std::vector<field_ct> pub_y_fields = fields_from_witnesses(builder, input.pub_y_indices);
    field_ct result_field = field_ct::from_witness_index(&builder, input.result);

    if (!has_valid_witness_assignments) {
        // Fill builder variables in case of empty witness assignment
        create_dummy_ecdsa_constraint<Curve>(
            builder, hashed_message_fields, r_fields, s_fields, pub_x_fields, pub_y_fields, result_field);
    }

    // Step 1.
    // Construct inputs to signature verification from witness indices
    byte_array_ct hashed_message = fields_to_bytes(builder, hashed_message_fields);
    byte_array_ct pub_x_bytes = fields_to_bytes(builder, pub_x_fields);
    byte_array_ct pub_y_bytes = fields_to_bytes(builder, pub_y_fields);
    byte_array_ct r = fields_to_bytes(builder, r_fields);
    byte_array_ct s = fields_to_bytes(builder, s_fields);
    bool_ct result = static_cast<bool_ct>(result_field); // Constructor enforces result_field = 0 or 1

    // Step 2.
    // Reconstruct the public key from the byte representations of its coordinates
    Fq pub_x(pub_x_bytes);
    Fq pub_y(pub_y_bytes);
    G1 public_key(pub_x, pub_y);

    // Step 3.
    // Ensure uniqueness of the public key by asserting each of its coordinates is smaller than the modulus of the base
    // field
    pub_x.assert_is_in_field("ECDSA input validation: the x coordinate of the public key is larger than Fq::modulus");
    pub_y.assert_is_in_field("ECDSA input validation: the y coordinate of the public key is larger than Fq::modulus");

    // Step 4.
    bool_ct signature_result =
        stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, { r, s });

    // Step 5.
    // Assert that signature verification returned the expected result
    signature_result.assert_equal(result);
}

/**
 * @brief Generate dummy ECDSA constraints when the builder doesn't have witnesses
 *
 * @details To avoid firing asserts, the public key must be a point on the curve
 */
template <typename Curve>
void create_dummy_ecdsa_constraint(typename Curve::Builder& builder,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& hashed_message_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& r_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& s_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& pub_x_fields,
                                   const std::vector<stdlib::field_t<typename Curve::Builder>>& pub_y_fields,
                                   const stdlib::field_t<typename Curve::Builder>& result_field)
{
    using Builder = Curve::Builder;
    using FqNative = Curve::fq;
    using G1Native = Curve::g1;
    using field_ct = stdlib::field_t<Builder>;

    // Lambda to populate builder variables from vector of field values
    auto populate_fields = [&builder](const std::vector<field_ct>& fields, const std::vector<bb::fr>& values) {
        for (auto [field, value] : zip_view(fields, values)) {
            builder.set_variable(field.witness_index, value);
        }
    };

    // Vector of 32 copies of bb::fr::zero()
    std::vector<bb::fr> mock_zeros(32, bb::fr::zero());

    // Hashed message
    populate_fields(hashed_message_fields, mock_zeros);

    // Signature
    populate_fields(r_fields, mock_zeros);
    populate_fields(s_fields, mock_zeros);

    // Pub key
    std::array<uint8_t, 32> buffer_x;
    std::array<uint8_t, 32> buffer_y;
    std::vector<bb::fr> mock_pub_x;
    std::vector<bb::fr> mock_pub_y;
    FqNative::serialize_to_buffer(G1Native::one.x, &buffer_x[0]);
    FqNative::serialize_to_buffer(G1Native::one.y, &buffer_y[0]);
    for (auto [byte_x, byte_y] : zip_view(buffer_x, buffer_y)) {
        mock_pub_x.emplace_back(bb::fr(byte_x));
        mock_pub_y.emplace_back(bb::fr(byte_y));
    }
    populate_fields(pub_x_fields, mock_pub_x);
    populate_fields(pub_y_fields, mock_pub_y);

    // Result
    builder.set_variable(result_field.witness_index, bb::fr::one());
}

template void create_ecdsa_verify_constraints<stdlib::secp256k1<UltraCircuitBuilder>>(
    UltraCircuitBuilder& builder, const EcdsaConstraint& input, bool has_valid_witness_assignments);
template void create_ecdsa_verify_constraints<stdlib::secp256k1<MegaCircuitBuilder>>(
    MegaCircuitBuilder& builder, const EcdsaConstraint& input, bool has_valid_witness_assignments);
template void create_ecdsa_verify_constraints<stdlib::secp256r1<UltraCircuitBuilder>>(
    UltraCircuitBuilder& builder, const EcdsaConstraint& input, bool has_valid_witness_assignments);
template void create_ecdsa_verify_constraints<stdlib::secp256r1<MegaCircuitBuilder>>(
    MegaCircuitBuilder& builder, const EcdsaConstraint& input, bool has_valid_witness_assignments);

template void create_dummy_ecdsa_constraint<stdlib::secp256k1<UltraCircuitBuilder>>(
    UltraCircuitBuilder&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const stdlib::field_t<UltraCircuitBuilder>&);

template void create_dummy_ecdsa_constraint<stdlib::secp256r1<UltraCircuitBuilder>>(
    UltraCircuitBuilder&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>&,
    const stdlib::field_t<UltraCircuitBuilder>&);

} // namespace acir_format
