
#pragma once
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/crypto/hashers/hashers.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa_impl.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

namespace bb {
class EcdsaCircuit {
  public:
    using Builder = bb::UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;
    using public_witness_ct = stdlib::public_witness_t<Builder>;
    using byte_array_ct = stdlib::byte_array<Builder>;
    using curve = stdlib::secp256k1<Builder>;
    using base_field = typename curve::BaseField;
    using scalar_field = typename curve::ScalarField;
    using base_field_native = typename curve::BaseFieldNative;
    using scalar_field_native = typename curve::ScalarFieldNative;
    using group_native = typename curve::GroupNative;
    using group = typename curve::Group;
    using IO = stdlib::recursion::honk::DefaultIO<Builder>;

    static constexpr size_t NUM_PUBLIC_INPUTS = 6;

    static Builder generate(uint256_t public_inputs[])
    {
        Builder builder;

        // IN CIRCUIT
        // Create an input buffer from public inputs (treating each as a single byte)
        byte_array_ct input_buffer(&builder, std::vector<uint8_t>());
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; ++i) {
            field_ct byte_value = public_witness_ct(&builder, public_inputs[i]);
            // Constrain to be a single byte and create byte_array
            byte_array_ct single_byte(byte_value, 1);
            input_buffer.write(single_byte);
        }

        // This is the message that we would like to confirm
        std::string message_string(NUM_PUBLIC_INPUTS, '\0');
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; ++i) {
            message_string[i] = static_cast<char>(static_cast<uint8_t>(public_inputs[i]));
        }
        auto message = byte_array_ct(&builder, message_string);

        // Assert that the public inputs buffer matches the message we want
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; ++i) {
            input_buffer[i].assert_equal(message[i]);
        }

        // UNCONSTRAINED: create a random keypair to sign with
        crypto::ecdsa_key_pair<scalar_field_native, group_native> account;
        account.private_key = curve::ScalarFieldNative::random_element();
        account.public_key = curve::GroupNative::one * account.private_key;

        // UNCONSTRAINED: create a sig
        crypto::ecdsa_signature signature = crypto::
            ecdsa_construct_signature<crypto::Sha256Hasher, base_field_native, scalar_field_native, group_native>(
                message_string, account);

        // UNCONSTRAINED: verify the created signature
        bool dry_run =
            crypto::ecdsa_verify_signature<crypto::Sha256Hasher, base_field_native, scalar_field_native, group_native>(
                message_string, account.public_key, signature);
        if (!dry_run) {
            throw_or_abort("[non circuit]: Sig verification failed");
        }

        // IN CIRCUIT: create a witness with the pub key in our circuit
        group public_key = group::from_witness(&builder, account.public_key);

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());

        // IN CIRCUIT: create a witness with the sig in our circuit
        stdlib::ecdsa_signature<Builder> sig{ byte_array_ct(&builder, rr), byte_array_ct(&builder, ss) };

        // Compute H(m) natively and pass as witness (mirrors ACIR which takes pre-hashed message)
        auto hash_arr = crypto::sha256(std::vector<uint8_t>(message_string.begin(), message_string.end()));
        byte_array_ct hashed_message(&builder, std::vector<uint8_t>(hash_arr.begin(), hash_arr.end()));

        // IN CIRCUIT: verify the signature
        bool_ct signature_result = stdlib::ecdsa_verify_signature<Builder, curve, base_field, scalar_field, group>(
            // hashed_message, public_key, sig);
            hashed_message,
            public_key,
            sig);

        // Assert the signature is true
        signature_result.assert_equal(bool_ct(true));

        IO::add_default(builder);

        return builder;
    }
};

} // namespace bb
