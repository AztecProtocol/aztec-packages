#include "schnorr.hpp"
#include "barretenberg/common/log.hpp"
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

    // Reconstruct R = g^s * pub^e (this is what the verifier does)
    G1::affine_element R(G1::element(public_key) * sig.e + G1::one * sig.s);

    // Independently compute the Poseidon2 challenge from DST, R, pubkey, message
    Fq expected_e_base = Poseidon2<Poseidon2Bn254ScalarFieldParams>::hash(
        { compute_schnorr_challenge_dst<Fq>(), R.x, public_key.x, public_key.y, message_field });

    // Convert to the grumpkin scalar field via byte round-trip (the same path the implementation uses)
    std::array<uint8_t, 32> expected_e_buf;
    Fq::serialize_to_buffer(expected_e_base, expected_e_buf.data());
    Fr expected_e_scalar = Fr::serialize_from_buffer(expected_e_buf.data());

    // The challenge in the signature must match the independently computed one
    EXPECT_EQ(sig.e, expected_e_scalar);

    // Also verify that R is not the point at infinity (would indicate k=0)
    EXPECT_FALSE(R.is_point_at_infinity());
}

/**
 * @brief Pin the schnorr challenge domain separator.
 *
 * Cross-implementation regression: the value here must match `SCHNORR_CHALLENGE_DST` in
 * noir-lang/schnorr (`src/lib.nr`). Both sides derive the same constant from
 * `poseidon2_hash_bytes("schnorr_grumpkin_poseidon2")`; if either side drifts, every signature
 * stops verifying across the cpp signer / noir verifier boundary.
 */
TEST(schnorr, challenge_dst_pinned)
{
    Fq derived = compute_schnorr_challenge_dst<Fq>();
    EXPECT_EQ(derived, Fq(std::string("0x024c76938ed06b8ec1d9094b1013d190baa4011372f0604643bda812a63b832e")));
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

namespace {

/**
 * @brief Build a fully-deterministic Schnorr signature with a caller-supplied nonce k. Mirrors
 * schnorr_construct_signature exactly but exposes (R, e_base, e_scalar, s) for pinning.
 *
 * Used to produce hardcoded test vectors that the noir circuit can match against.
 */
struct DeterministicSig {
    G1::affine_element public_key;
    G1::affine_element R;
    Fq e_base;   // raw Poseidon2 output, lives in the grumpkin base field (bb::fr)
    Fr e_scalar; // re-encoded into the grumpkin scalar field (bb::fq) for the signature equation
    Fr s;        // s = k - priv * e_scalar
    schnorr_signature sig;
};

DeterministicSig build_deterministic_sig(const Fr& private_key, const Fr& nonce_k, const Fq& message_field)
{
    DeterministicSig out;
    out.public_key = G1::affine_element(G1::one * private_key);
    out.R = G1::affine_element(G1::one * nonce_k);
    out.e_base = schnorr_generate_challenge<G1>(message_field, out.public_key, out.R);
    std::array<uint8_t, 32> e_buf;
    Fq::serialize_to_buffer(out.e_base, e_buf.data());
    out.e_scalar = Fr::serialize_from_buffer(e_buf.data());
    out.s = nonce_k - private_key * out.e_scalar;
    out.sig.s = out.s;
    out.sig.e = out.e_scalar;
    return out;
}

void dump_vector(const char* label, const Fr& private_key, const Fr& nonce_k, const Fq& message_field)
{
    auto v = build_deterministic_sig(private_key, nonce_k, message_field);
    info("=== ", label, " ===");
    info("  private_key  = ", private_key);
    info("  nonce_k      = ", nonce_k);
    info("  message      = ", message_field);
    info("  public_key.x = ", v.public_key.x);
    info("  public_key.y = ", v.public_key.y);
    info("  R.x          = ", v.R.x);
    info("  R.y          = ", v.R.y);
    info("  s            = ", v.s);
    info("  e            = ", v.e_scalar);
}

} // namespace

/**
 * @brief Pinned test vector #1: small inputs.
 *
 * Hardcoded (private_key, nonce_k, message) -> (public_key, signature). The expected outputs are
 * pinned; any change to the schnorr scheme (e.g. hash function, challenge ordering) will break this.
 * Round-trip verification ensures the recomputed values still satisfy the verifier.
 */
TEST(schnorr, pinned_test_vector_small)
{
    Fr private_key(std::string("0x000000000000000000000000000000000000000000000000000000000000007b"));   // 123
    Fr nonce_k(std::string("0x00000000000000000000000000000000000000000000000000000000000001c8"));       // 456
    Fq message_field(std::string("0x00000000000000000000000000000000000000000000000000000000000002bc")); // 700

    auto v = build_deterministic_sig(private_key, nonce_k, message_field);
    dump_vector("pinned_test_vector_small", private_key, nonce_k, message_field);

    bool ok = schnorr_verify_signature<Fr, G1>(message_field, v.public_key, v.sig);
    EXPECT_TRUE(ok);

    EXPECT_EQ(v.public_key.x, Fq(std::string("0x2c39bbbde2d0ffcb5c4317dcbfa1771cf554a2f33c647446632fa707a5bf5f3f")));
    EXPECT_EQ(v.public_key.y, Fq(std::string("0x2b9c81935298af5ebe22f1a7279bb76781e6cadba3fb6c5c41ed942392dc687c")));
    EXPECT_EQ(v.R.x, Fq(std::string("0x2f410c5089a00d9a4664f262272dbc091b121acf58abdf919c1bc8b974fb720e")));
    EXPECT_EQ(v.s, Fr(std::string("0x281906862cdb4e0efec7226d757fe8035fd1ac0ad411110674830c54cb506212")));
    EXPECT_EQ(v.e_scalar, Fr(std::string("0x013f6a902c6c0efafdadbd4de409690d6c368959f958e525d761d06c47fd2ad6")));
}

/**
 * @brief Pinned test vector #2: random-looking large inputs.
 */
TEST(schnorr, pinned_test_vector_large)
{
    Fr private_key(std::string("0x1f2e3d4c5b6a79880f1e2d3c4b5a69788f9e0d1c2b3a4958e7f6d5c4b3a29180"));
    Fr nonce_k(std::string("0x2a1b3c4d5e6f78890a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071"));
    Fq message_field(std::string("0x0123456789abcdef0fedcba9876543210123456789abcdef0fedcba987654321"));

    auto v = build_deterministic_sig(private_key, nonce_k, message_field);
    dump_vector("pinned_test_vector_large", private_key, nonce_k, message_field);

    bool ok = schnorr_verify_signature<Fr, G1>(message_field, v.public_key, v.sig);
    EXPECT_TRUE(ok);

    EXPECT_EQ(v.public_key.x, Fq(std::string("0x065812e335a97c2108ea8cf4ccfe2f9dd6b117a0714f5e18461575be93f61da6")));
    EXPECT_EQ(v.public_key.y, Fq(std::string("0x1a915003e8ec534f9a15d926a7ded478e178468ccc4f28e236e67450a55ac622")));
    EXPECT_EQ(v.R.x, Fq(std::string("0x04e780bc3d2b86b5f41f3b8d2820c1f2c3164cd5efc607cd48c428495a8f47b7")));
    EXPECT_EQ(v.s, Fr(std::string("0x08599f379f0301dfefdbd0272554454df3bc3b7147acb9c621fd9f72dbf15ffa")));
    EXPECT_EQ(v.e_scalar, Fr(std::string("0x2ceaee87f45b7a417f0ffb05451a8c9297065383ebbbd76620398792bd259bc2")));
}
