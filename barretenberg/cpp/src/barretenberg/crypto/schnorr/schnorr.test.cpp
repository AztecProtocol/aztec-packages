#include "schnorr.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::crypto;

using Fr = grumpkin::fr;
using Fq = grumpkin::fq;
using G1 = grumpkin::g1;

TEST(schnorr, verify_signature)
{
    schnorr_key_pair<Fr, G1> account;
    account.private_key = Fr::random_element();
    account.public_key = G1::one * account.private_key;

    Fq message_field = Fq::random_element();

    auto sig = schnorr_construct_signature<Fr, G1>(message_field, account);
    bool result = schnorr_verify_signature<Fr, G1>(message_field, account.public_key, sig);

    EXPECT_TRUE(result);
}

TEST(schnorr, verify_signature_failure_wrong_message)
{
    schnorr_key_pair<Fr, G1> account;
    account.private_key = Fr::random_element();
    account.public_key = G1::one * account.private_key;

    Fq message_field = Fq::random_element();
    Fq wrong_message = Fq::random_element();

    auto sig = schnorr_construct_signature<Fr, G1>(message_field, account);
    bool result = schnorr_verify_signature<Fr, G1>(wrong_message, account.public_key, sig);

    EXPECT_FALSE(result);
}

TEST(schnorr, verify_signature_failure_wrong_key)
{
    schnorr_key_pair<Fr, G1> account;
    account.private_key = Fr::random_element();
    account.public_key = G1::one * account.private_key;

    Fq message_field = Fq::random_element();

    auto sig = schnorr_construct_signature<Fr, G1>(message_field, account);

    auto wrong_key = G1::affine_element(G1::one * Fr::random_element());
    bool result = schnorr_verify_signature<Fr, G1>(message_field, wrong_key, sig);

    EXPECT_FALSE(result);
}

TEST(schnorr, signatures_not_deterministic)
{
    schnorr_key_pair<Fr, G1> account;
    account.private_key = Fr::random_element();
    account.public_key = G1::one * account.private_key;

    Fq message_field = Fq::random_element();

    auto sig_a = schnorr_construct_signature<Fr, G1>(message_field, account);
    auto sig_b = schnorr_construct_signature<Fr, G1>(message_field, account);

    // Different nonces should produce different signatures
    EXPECT_NE(sig_a.e, sig_b.e);
    EXPECT_NE(sig_a.s, sig_b.s);

    // But both should verify
    bool result_a = schnorr_verify_signature<Fr, G1>(message_field, account.public_key, sig_a);
    EXPECT_TRUE(result_a);
    bool result_b = schnorr_verify_signature<Fr, G1>(message_field, account.public_key, sig_b);
    EXPECT_TRUE(result_b);
}

/**
 * @brief Verify the signature internals independently, without relying on construct + verify using the same code path.
 *
 * This test manually recomputes the Poseidon2 challenge and checks the Schnorr equation s = k - priv * e,
 * catching bugs like the reinterpret_cast issue where both sides had a matching bug that cancelled out.
 */
TEST(schnorr, signature_internals_consistency)
{
    // Use a fixed private key for reproducibility
    Fr private_key = Fr(12345);
    G1::affine_element public_key(G1::one * private_key);
    schnorr_key_pair<Fr, G1> account = { private_key, public_key };

    Fq message_field = Fq(67890);

    auto sig = schnorr_construct_signature<Fr, G1>(message_field, account);

    // Deserialize s and e from the signature
    Fr s = Fr::serialize_from_buffer(&sig.s[0]);
    Fr e_fr = Fr::serialize_from_buffer(&sig.e[0]);

    // Reconstruct R = g^s * pub^e (this is what the verifier does)
    G1::affine_element R(G1::element(public_key) * e_fr + G1::one * s);

    // Independently compute the Poseidon2 challenge from R, pubkey, message
    Fq expected_e_fq =
        Poseidon2<Poseidon2Bn254ScalarFieldParams>::hash({ R.x, public_key.x, public_key.y, message_field });

    // Convert to Fr via proper serialization (the same path the implementation uses)
    std::array<uint8_t, 32> expected_e_buf;
    Fq::serialize_to_buffer(expected_e_fq, expected_e_buf.data());
    Fr expected_e_fr = Fr::serialize_from_buffer(expected_e_buf.data());

    // The challenge in the signature must match the independently computed one
    EXPECT_EQ(e_fr, expected_e_fr);

    // Also verify that R is not the point at infinity (would indicate k=0)
    EXPECT_FALSE(R.is_point_at_infinity());
}

/**
 * @brief Verify that the cross-field serialization round-trip is lossless.
 *
 * Since Fr (Grumpkin scalar = BN254 Fq) has a larger modulus than Fq (Grumpkin base = BN254 Fr),
 * every Fq value should survive the Fq -> bytes -> Fr conversion without loss.
 */
TEST(schnorr, cross_field_serialization_is_lossless)
{
    for (int i = 0; i < 100; i++) {
        // Generate a random Fq element (BN254 Fr, the Poseidon2 output field)
        Fq original = Fq::random_element();

        // Serialize to bytes
        std::array<uint8_t, 32> buf;
        Fq::serialize_to_buffer(original, buf.data());

        // Deserialize as Fr (BN254 Fq, the Grumpkin scalar field)
        Fr converted = Fr::serialize_from_buffer(buf.data());

        // Serialize Fr back to bytes
        std::array<uint8_t, 32> buf2;
        Fr::serialize_to_buffer(converted, buf2.data());

        // The byte representations must be identical (no information lost in the conversion)
        EXPECT_EQ(buf, buf2);
    }
}

/**
 * @brief Verify that the bbapi byte interface produces valid signatures.
 *
 * Simulates the bbapi path: message comes as 32 bytes (a serialized field element),
 * gets deserialized to Fq, used for signing, then verified.
 */
TEST(schnorr, bbapi_byte_interface_round_trip)
{
    Fr private_key = Fr::random_element();
    G1::affine_element public_key(G1::one * private_key);
    schnorr_key_pair<Fr, G1> account = { private_key, public_key };

    // Simulate bbapi: start from a field element, serialize to bytes, then deserialize
    Fq original_message = Fq::random_element();
    std::array<uint8_t, 32> message_bytes;
    Fq::serialize_to_buffer(original_message, message_bytes.data());

    // This is what bbapi does
    Fq deserialized_message = Fq::serialize_from_buffer(message_bytes.data());
    EXPECT_EQ(original_message, deserialized_message);

    // Sign with deserialized message, verify with original — must agree
    auto sig = schnorr_construct_signature<Fr, G1>(deserialized_message, account);
    bool result = schnorr_verify_signature<Fr, G1>(original_message, public_key, sig);
    EXPECT_TRUE(result);
}
