#include "ecdsa_secp256k1.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"

namespace acir_format {

using namespace proof_system::plonk;

crypto::ecdsa::signature ecdsa_convert_signature(Composer& composer, std::vector<uint32_t> signature)
{

    crypto::ecdsa::signature signature_cr;

    // Get the witness assignment for each witness index
    // Write the witness assignment to the byte_array

    for (unsigned int i = 0; i < 32; i++) {
        auto witness_index = signature[i];

        std::vector<uint8_t> fr_bytes(sizeof(fr));

        fr value = composer.get_variable(witness_index);

        fr::serialize_to_buffer(value, &fr_bytes[0]);

        signature_cr.r[i] = fr_bytes.back();
    }

    for (unsigned int i = 32; i < 64; i++) {
        auto witness_index = signature[i];

        std::vector<uint8_t> fr_bytes(sizeof(fr));

        fr value = composer.get_variable(witness_index);

        fr::serialize_to_buffer(value, &fr_bytes[0]);

        signature_cr.s[i - 32] = fr_bytes.back();
    }

    signature_cr.v = 27;

    return signature_cr;
}

secp256k1_ct::g1_ct ecdsa_convert_inputs(Composer* ctx, const secp256k1::g1::affine_element& input)
{
    uint256_t x_u256(input.x);
    uint256_t y_u256(input.y);
    secp256k1_ct::fq_ct x(witness_ct(ctx, barretenberg::fr(x_u256.slice(0, secp256k1_ct::fq_ct::NUM_LIMB_BITS * 2))),
                          witness_ct(ctx,
                                     barretenberg::fr(x_u256.slice(secp256k1_ct::fq_ct::NUM_LIMB_BITS * 2,
                                                                   secp256k1_ct::fq_ct::NUM_LIMB_BITS * 4))));
    secp256k1_ct::fq_ct y(witness_ct(ctx, barretenberg::fr(y_u256.slice(0, secp256k1_ct::fq_ct::NUM_LIMB_BITS * 2))),
                          witness_ct(ctx,
                                     barretenberg::fr(y_u256.slice(secp256k1_ct::fq_ct::NUM_LIMB_BITS * 2,
                                                                   secp256k1_ct::fq_ct::NUM_LIMB_BITS * 4))));

    return { x, y };
}

// vector of bytes here, assumes that the witness indices point to a field element which can be represented
// with just a byte.
// notice that this function truncates each field_element to a byte
byte_array_ct ecdsa_vector_of_bytes_to_byte_array(Composer& composer, std::vector<uint32_t> vector_of_bytes)
{
    byte_array_ct arr(&composer);

    // Get the witness assignment for each witness index
    // Write the witness assignment to the byte_array
    for (const auto& witness_index : vector_of_bytes) {

        field_ct element = field_ct::from_witness_index(&composer, witness_index);
        size_t num_bytes = 1;

        byte_array_ct element_bytes(element, num_bytes);
        arr.write(element_bytes);
    }
    return arr;
}
witness_ct ecdsa_index_to_witness(Composer& composer, uint32_t index)
{
    fr value = composer.get_variable(index);
    return { &composer, value };
}

void create_ecdsa_verify_constraints(Composer& composer,
                                     const EcdsaSecp256k1Constraint& input,
                                     bool has_valid_witness_assignments)
{

    if (has_valid_witness_assignments == false) {
        dummy_ecdsa_constraint(composer, input);
    }

    auto new_sig = ecdsa_convert_signature(composer, input.signature);

    auto message = ecdsa_vector_of_bytes_to_byte_array(composer, input.hashed_message);
    auto pub_key_x_byte_arr = ecdsa_vector_of_bytes_to_byte_array(composer, input.pub_x_indices);
    auto pub_key_y_byte_arr = ecdsa_vector_of_bytes_to_byte_array(composer, input.pub_y_indices);

    auto pub_key_x_fq = secp256k1_ct::fq_ct(pub_key_x_byte_arr);
    auto pub_key_y_fq = secp256k1_ct::fq_ct(pub_key_y_byte_arr);

    std::vector<uint8_t> rr(new_sig.r.begin(), new_sig.r.end());
    std::vector<uint8_t> ss(new_sig.s.begin(), new_sig.s.end());
    uint8_t vv = new_sig.v;

    stdlib::ecdsa::signature<Composer> sig{ stdlib::byte_array<Composer>(&composer, rr),
                                            stdlib::byte_array<Composer>(&composer, ss),
                                            stdlib::uint8<Composer>(&composer, vv) };

    pub_key_x_fq.assert_is_in_field();
    pub_key_y_fq.assert_is_in_field();
    secp256k1_ct::g1_bigfr_ct public_key = secp256k1_ct::g1_bigfr_ct(pub_key_x_fq, pub_key_y_fq);
    for (size_t i = 0; i < 32; ++i) {
        sig.r[i].assert_equal(field_ct::from_witness_index(&composer, input.signature[i]));
        sig.s[i].assert_equal(field_ct::from_witness_index(&composer, input.signature[i + 32]));
        pub_key_x_byte_arr[i].assert_equal(field_ct::from_witness_index(&composer, input.pub_x_indices[i]));
        pub_key_y_byte_arr[i].assert_equal(field_ct::from_witness_index(&composer, input.pub_y_indices[i]));
    }
    for (size_t i = 0; i < input.hashed_message.size(); ++i) {
        message[i].assert_equal(field_ct::from_witness_index(&composer, input.hashed_message[i]));
    }

    bool_ct signature_result =
        stdlib::ecdsa::verify_signature_prehashed_message_noassert<Composer,
                                                                   secp256k1_ct,
                                                                   secp256k1_ct::fq_ct,
                                                                   secp256k1_ct::bigfr_ct,
                                                                   secp256k1_ct::g1_bigfr_ct>(message, public_key, sig);
    bool_ct signature_result_normalized = signature_result.normalize();
    composer.assert_equal(signature_result_normalized.witness_index, input.result);
}

// Add dummy constraints for ECDSA because when the verifier creates the
// constraint system, they usually use zeroes for witness values.
//
// This does not work for ECDSA as the signature, r, s and public key need
// to be valid.
void dummy_ecdsa_constraint(Composer& composer, EcdsaSecp256k1Constraint const& input)
{

    std::vector<uint32_t> pub_x_indices_;
    std::vector<uint32_t> pub_y_indices_;
    std::vector<uint32_t> signature_;
    signature_.resize(64);

    // Create a valid signature with a valid public key
    crypto::ecdsa::key_pair<secp256k1_ct::fr, secp256k1_ct::g1> account;
    account.private_key = 10;
    account.public_key = secp256k1_ct::g1::one * account.private_key;
    uint256_t pub_x_value = account.public_key.x;
    uint256_t pub_y_value = account.public_key.y;
    std::string message_string = "Instructions unclear, ask again later.";
    crypto::ecdsa::signature signature =
        crypto::ecdsa::construct_signature<Sha256Hasher, secp256k1_ct::fq, secp256k1_ct::fr, secp256k1_ct::g1>(
            message_string, account);

    // Create new variables which will reference the valid public key and signature.
    // We don't use them in a gate, so when we call assert_equal, they will be
    // replaced as if they never existed.
    for (size_t i = 0; i < 32; ++i) {
        uint32_t x_wit = composer.add_variable(pub_x_value.slice(248 - i * 8, 256 - i * 8));
        uint32_t y_wit = composer.add_variable(pub_y_value.slice(248 - i * 8, 256 - i * 8));
        uint32_t r_wit = composer.add_variable(signature.r[i]);
        uint32_t s_wit = composer.add_variable(signature.s[i]);
        pub_x_indices_.emplace_back(x_wit);
        pub_y_indices_.emplace_back(y_wit);
        signature_[i] = r_wit;
        signature_[i + 32] = s_wit;
    }

    // Call assert_equal(from, to) to replace the value in `to` by the value in `from`
    for (size_t i = 0; i < input.pub_x_indices.size(); ++i) {
        composer.assert_equal(pub_x_indices_[i], input.pub_x_indices[i]);
    }
    for (size_t i = 0; i < input.pub_y_indices.size(); ++i) {
        composer.assert_equal(pub_y_indices_[i], input.pub_y_indices[i]);
    }
    for (size_t i = 0; i < input.signature.size(); ++i) {
        composer.assert_equal(signature_[i], input.signature[i]);
    }
}

} // namespace acir_format
