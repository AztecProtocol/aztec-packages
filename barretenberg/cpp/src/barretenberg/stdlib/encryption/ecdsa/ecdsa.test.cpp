#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "../../primitives/bigfield/bigfield.hpp"
#include "../../primitives/biggroup/biggroup.hpp"
#include "../../primitives/curves/secp256k1.hpp"
#include "../../primitives/curves/secp256r1.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "ecdsa.hpp"
#include "ecdsa_tests_data.hpp"

#include <gtest/gtest.h>

#include <algorithm>

using namespace bb;
using namespace bb::crypto;

template <class Curve> class EcdsaTests : public ::testing::Test {
  public:
    using Builder = Curve::Builder;
    using CurveType =
        std::conditional_t<Curve::type == bb::CurveType::SECP256K1, bb::curve::SECP256K1, bb::curve::SECP256R1>;

    // Native Types
    using FrNative = Curve::ScalarFieldNative;
    using FqNative = Curve::BaseFieldNative;
    using G1Native = Curve::GroupNative;

    // Stdlib types
    using Fr = Curve::ScalarField;
    using Fq = Curve::BaseField;
    using G1 = Curve::Group;
    using bool_t = stdlib::bool_t<Builder>;

    // Reproducible signature
    static constexpr FrNative private_key =
        FrNative("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");

    enum class TamperingMode : std::uint8_t {
        XCoordinateOverflow,
        YCoordinateOverflow,
        InvalidR,
        InvalidS,
        HighS,
        ZeroR,
        ZeroS,
        InfinityScalarMul,
        InvalidPubKey,
        InfinityPubKey,
        None
    };

    std::pair<ecdsa_key_pair<FrNative, G1Native>, ecdsa_signature> generate_dummy_ecdsa_data(std::string message_string,
                                                                                             bool random_signature)
    {
        ecdsa_key_pair<FrNative, G1Native> account;

        account.private_key = random_signature ? FrNative::random_element() : private_key;
        account.public_key = G1Native::one * account.private_key;

        ecdsa_signature signature =
            ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, account);

        if (random_signature) {
            // Logging in case of random signature
            info("The private key used generate this signature is: ", account.private_key);
        }

        return { account, signature };
    }

    void tampering(std::string message_string,
                   ecdsa_key_pair<FrNative, G1Native>& account,
                   ecdsa_signature& signature,
                   TamperingMode mode)
    {
        switch (mode) {
        case TamperingMode::XCoordinateOverflow: {
            // Invalidate the circuit by passing a public key with x >= q
            // Do nothing here, tampering happens in circuit
            break;
        }
        case TamperingMode::YCoordinateOverflow: {
            // Invalidate the circuit by passing a public key with y >= q
            // Do nothing here, tampering happens in circuit
            break;
        }
        case TamperingMode::InvalidR: {
            // Invalidate the signature by changing r.
            FrNative r = FrNative::serialize_from_buffer(&signature.r[0]);
            r += FrNative::one();

            FrNative::serialize_to_buffer(r, &signature.r[0]);
            break;
        }
        case TamperingMode::InvalidS: {
            // Invalidate the signature by changing s.
            FrNative s = FrNative::serialize_from_buffer(&signature.s[0]);
            s += FrNative::one();

            FrNative::serialize_to_buffer(s, &signature.s[0]);
            break;
        }
        case TamperingMode::HighS: {
            // Invalidate the signature by changing s to -s.
            FrNative s = FrNative::serialize_from_buffer(&signature.s[0]);
            s = -s;

            FrNative::serialize_to_buffer(s, &signature.s[0]);
            break;
        }
        case TamperingMode::ZeroR: {
            // Invalidate signature by setting r to 0
            signature.r = std::array<uint8_t, 32>{};
            break;
        }
        case TamperingMode::ZeroS: {
            // Invalidate signature by setting s to 0
            signature.s = std::array<uint8_t, 32>{};
            break;
        }
        case TamperingMode::InfinityScalarMul: {
            // Invalidate the signature by making making u1 * G + u2 * P return the point at infinity

            // Compute H(m)
            std::vector<uint8_t> buffer;
            std::ranges::copy(message_string, std::back_inserter(buffer));
            auto hash = Sha256Hasher::hash(buffer);

            // Override the public key: new public key is (-hash) * r^{-1} * G
            FrNative fr_hash = FrNative::serialize_from_buffer(&hash[0]);
            FrNative r = FrNative::serialize_from_buffer(&signature.r[0]);
            FrNative r_inverse = r.invert();
            FrNative modified_private_key = r_inverse * (-fr_hash);
            account.public_key = G1Native::one * modified_private_key;

            // Verify that the result is the point at infinity
            auto P = G1Native::one * fr_hash + account.public_key * r;
            BB_ASSERT_EQ(P.is_point_at_infinity(), true);
            break;
        }
        case TamperingMode::InvalidPubKey: {
            // Invalidate the circuit by passing a public key which is not on the curve
            account.public_key.x = account.public_key.y;
            BB_ASSERT_EQ(account.public_key.on_curve(), false);
            break;
        }
        case TamperingMode::InfinityPubKey: {
            // Invalidate the circuit by passing a public key which is not on the curve
            account.public_key.self_set_infinity();
            BB_ASSERT_EQ(account.public_key.is_point_at_infinity(), true);
            break;
        }
        case TamperingMode::None:
            break;
        }

        // Natively verify that the tampering was successfull
        bool is_signature_valid = ecdsa_verify_signature<Sha256Hasher, FqNative, FrNative, G1Native>(
            message_string, account.public_key, signature);
        if (mode == TamperingMode::XCoordinateOverflow || mode == TamperingMode::YCoordinateOverflow) {
            // In these tampering modes nothing has changed and the tampering happens in circuit, so we override the
            // result and set it to false
            is_signature_valid = false;
        }

        bool expected = mode == TamperingMode::None;
        BB_ASSERT_EQ(is_signature_valid,
                     expected,
                     "Signature verification returned a different result from the expected one. If the signature was "
                     "randomly generated, there is a (very) small chance this is not a bug.");
    }

    std::pair<G1, stdlib::ecdsa_signature<Builder>> create_stdlib_ecdsa_data(
        Builder& builder,
        const ecdsa_key_pair<FrNative, G1Native>& account,
        const ecdsa_signature& signature,
        const TamperingMode mode)
    {
        // We construct the point via its x,y-coordinates with an explicit infinity flag.
        // This avoids:
        // 1. The on-curve check of G1::from_witness (so we can test invalid points)
        // 2. The expensive infinity auto-detection of the 2-arg constructor
        Fq x;
        Fq y;
        if (mode == TamperingMode::XCoordinateOverflow) {
            stdlib::byte_array<Builder> x_bytes = stdlib::byte_array<Builder>::constant_padding(&builder, /*length*/ 0);
            for (size_t idx = 0; idx < 32; idx++) {
                stdlib::byte_array<Builder> to_write(stdlib::field_t<Builder>(0xff), /*length*/ 1);
                x_bytes.write(to_write);
            }
            x = Fq(x_bytes);
            y = Fq::from_witness(&builder, account.public_key.y);
        } else if (mode == TamperingMode::YCoordinateOverflow) {
            stdlib::byte_array<Builder> y_bytes = stdlib::byte_array<Builder>::constant_padding(&builder, /*length*/ 0);
            for (size_t idx = 0; idx < 32; idx++) {
                stdlib::byte_array<Builder> to_write(stdlib::field_t<Builder>(0xff), /*length*/ 1);
                y_bytes.write(to_write);
            }
            x = Fq::from_witness(&builder, account.public_key.x);
            y = Fq(y_bytes);
        } else {
            x = Fq::from_witness(&builder, account.public_key.x);
            y = Fq::from_witness(&builder, account.public_key.y);
        }

        if (mode == TamperingMode::InfinityPubKey) {
            // Override coordinates to (0, 0) for infinity
            x = Fq::from_witness(&builder, FqNative::zero());
            y = Fq::from_witness(&builder, FqNative::zero());
        }

        // Create explicit infinity flag witness from the native point's infinity status
        bool_t is_infinity(
            stdlib::witness_t<Builder>(&builder, account.public_key.is_point_at_infinity() ? fr::one() : fr::zero()),
            false);

        // Use the test accessor to create element with explicit infinity flag (avoids expensive auto-detection)
        G1 pub_key = stdlib::element_default::element_test_accessor::
            create_element_with_explicit_infinity<Builder, Fq, Fr, G1Native>(
                x, y, is_infinity, /*assert_on_curve=*/false);
        pub_key.set_free_witness_tag();
        BB_ASSERT_EQ(pub_key.is_point_at_infinity().get_value(), account.public_key.is_point_at_infinity());

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());

        stdlib::ecdsa_signature<Builder> sig{ stdlib::byte_array<Builder>(&builder, rr),
                                              stdlib::byte_array<Builder>(&builder, ss) };

        return { pub_key, sig };
    }

    void ecdsa_verification_circuit(Builder& builder,
                                    const stdlib::byte_array<Builder>& hashed_message,
                                    const ecdsa_key_pair<FrNative, G1Native>& account,
                                    const ecdsa_signature& signature,
                                    const bool signature_verification_result,
                                    const bool expected_circuit_result,
                                    const TamperingMode mode)

    {
        auto [public_key, sig] = create_stdlib_ecdsa_data(builder, account, signature, mode);

        // Verify signature
        stdlib::bool_t<Builder> signature_result =
            stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, sig);

        // Enforce verification returns the expected result
        signature_result.assert_equal(stdlib::bool_t<Builder>(signature_verification_result));

        // Check native values
        EXPECT_EQ(signature_result.get_value(), signature_verification_result);

        // Circuit checker
        bool is_circuit_satisfied = CircuitChecker::check(builder);
        EXPECT_EQ(is_circuit_satisfied, expected_circuit_result);
    }

    void test_verify_signature(bool random_signature, TamperingMode mode)
    {
        // Map tampering mode to signature verification result
        bool signature_verification_result = (mode == TamperingMode::None);

        std::string message_string = "Goblin";
        std::vector<uint8_t> message_bytes(message_string.begin(), message_string.end());
        std::array<uint8_t, 32> hashed_message_bytes_ = Sha256Hasher::hash(message_bytes);
        std::vector<uint8_t> hashed_message_bytes;
        hashed_message_bytes.reserve(32);
        for (auto byte : hashed_message_bytes_) {
            hashed_message_bytes.emplace_back(byte);
        }

        auto [account, signature] = generate_dummy_ecdsa_data(message_string, /*random_signature=*/random_signature);

        // Tamper with the signature
        tampering(message_string, account, signature, mode);

        // Create ECDSA verification circuit
        Builder builder;
        stdlib::byte_array<Builder> hashed_message(&builder, hashed_message_bytes);

        // ECDSA verification
        ecdsa_verification_circuit(
            builder, hashed_message, account, signature, signature_verification_result, true, mode);
    }

    // Test deterministic failure when P = ±G for secp256r1
    void test_signature_generator(bool is_minus_generator, bool signature_result, bool expected_circuit_result)
    {
        std::string message_string = "Goblin";
        std::vector<uint8_t> message_bytes(message_string.begin(), message_string.end());
        std::array<uint8_t, 32> hashed_message_bytes_ = Sha256Hasher::hash(message_bytes);
        std::vector<uint8_t> hashed_message_bytes;
        hashed_message_bytes.reserve(32);
        for (auto byte : hashed_message_bytes_) {
            hashed_message_bytes.emplace_back(byte);
        }

        // Generate a signature with P = ±G
        ecdsa_key_pair<FrNative, G1Native> account;

        account.private_key = is_minus_generator ? FrNative(-1) : FrNative(1);
        account.public_key = G1Native::one * account.private_key;

        ecdsa_signature signature =
            ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, account);

        // Create ECDSA verification circuit
        Builder builder;
        stdlib::byte_array<Builder> hashed_message(&builder, hashed_message_bytes);

        // ECDSA verification
        ecdsa_verification_circuit(builder,
                                   hashed_message,
                                   account,
                                   signature,
                                   signature_result,
                                   expected_circuit_result,
                                   TamperingMode::None);
    }

    // This test covers a specific behaviour of the implementation. If either the x or y coordinate of the public key
    // are bigger than the base field modulus, the ECDSA verification algorithm substitutes the public key with 2G to
    // avoid circuit failures. This means that an attacker could craft a valid signature for 2G and submit such
    // signature together with a public key with x coordinate overflowing. The ECDSA equation would then be satisfied
    // because of the internal substitution. The attack should not be succesful because the result of the ECDSA
    // verification algorithm takes into account whether either the x or y coordinate overflowed.
    void test_signature_double_generator()
    {
        std::string message_string = "Goblin";
        std::vector<uint8_t> message_bytes(message_string.begin(), message_string.end());
        std::array<uint8_t, 32> hashed_message_bytes_ = Sha256Hasher::hash(message_bytes);
        std::vector<uint8_t> hashed_message_bytes;
        hashed_message_bytes.reserve(32);
        for (auto byte : hashed_message_bytes_) {
            hashed_message_bytes.emplace_back(byte);
        }

        // Generate a signature with P = 2G
        ecdsa_key_pair<FrNative, G1Native> account;

        account.private_key = FrNative(2);
        account.public_key = G1Native::one * account.private_key;

        ecdsa_signature signature =
            ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, account);

        // Tamper with the signature by making the x coordinate overflow
        tampering(message_string, account, signature, TamperingMode::XCoordinateOverflow);

        // Create ECDSA verification circuit
        Builder builder;
        stdlib::byte_array<Builder> hashed_message(&builder, hashed_message_bytes);

        // ECDSA verification
        ecdsa_verification_circuit(
            builder, hashed_message, account, signature, false, true, TamperingMode::XCoordinateOverflow);
    }

    /**
     * @brief Construct tests based on data fetched from the Wycherproof project
     *
     * @param tests
     */
    void test_wycherproof(std::vector<stdlib::WycherproofTest<CurveType>> tests)
    {
        for (auto test : tests) {
            // Keypair
            ecdsa_key_pair<FrNative, G1Native> account;
            account.private_key = FrNative::one(); // Dummy value, unused
            account.public_key = typename G1Native::affine_element(test.x, test.y);

            // Signature
            std::array<uint8_t, 32> r;
            std::array<uint8_t, 32> s;
            uint8_t v = 0; // Dummy value, unused
            FrNative::serialize_to_buffer(test.r, &r[0]);
            FrNative::serialize_to_buffer(test.s, &s[0]);

            // Hashed message
            std::array<uint8_t, 32> hashed_message_bytes_ = Sha256Hasher::hash(test.message);
            std::vector<uint8_t> hashed_message_bytes;
            hashed_message_bytes.reserve(32);
            for (auto byte : hashed_message_bytes_) {
                hashed_message_bytes.emplace_back(byte);
            }

            // Create ECDSA verification circuit
            Builder builder;
            stdlib::byte_array<Builder> hashed_message(&builder, hashed_message_bytes);

            // ECDSA verification
            ecdsa_verification_circuit(builder,
                                       hashed_message,
                                       account,
                                       { r, s, v },
                                       test.is_valid_signature,
                                       test.is_circuit_satisfied,
                                       TamperingMode::None);
        }
    }
};

using Curves = testing::Types<stdlib::secp256k1<UltraCircuitBuilder>,
                              stdlib::secp256r1<UltraCircuitBuilder>,
                              stdlib::secp256k1<MegaCircuitBuilder>,
                              stdlib::secp256r1<MegaCircuitBuilder>>;

TYPED_TEST_SUITE(EcdsaTests, Curves);

TYPED_TEST(EcdsaTests, VerifyRandomSignature)
{
    TestFixture::test_verify_signature(/*random_signature=*/true, TestFixture::TamperingMode::None);
}

TYPED_TEST(EcdsaTests, VerifySignature)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::None);
}

TYPED_TEST(EcdsaTests, XCoordinateOverflow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::XCoordinateOverflow);
}

TYPED_TEST(EcdsaTests, YCoordinateOverflow)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::YCoordinateOverflow);
}

TYPED_TEST(EcdsaTests, InvalidR)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InvalidR);
}

TYPED_TEST(EcdsaTests, InvalidS)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InvalidS);
}

TYPED_TEST(EcdsaTests, HighS)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::HighS);
}

TYPED_TEST(EcdsaTests, ZeroR)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::ZeroR);
}

TYPED_TEST(EcdsaTests, ZeroS)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::ZeroS);
}

TYPED_TEST(EcdsaTests, InvalidPubKey)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InvalidPubKey);
}

TYPED_TEST(EcdsaTests, InfinityPubKey)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InfinityPubKey);
}

TYPED_TEST(EcdsaTests, InfinityScalarMul)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InfinityScalarMul);
}

TYPED_TEST(EcdsaTests, Wycherproof)
{
    if constexpr (TypeParam::type == bb::CurveType::SECP256K1) {
        TestFixture::test_wycherproof(stdlib::secp256k1_tests);
    } else {
        TestFixture::test_wycherproof(stdlib::secp256r1_tests);
    }
}

TYPED_TEST(EcdsaTests, SignatureDoubleGenerator)
{
    TestFixture::test_signature_double_generator();
}

TYPED_TEST(EcdsaTests, SignatureGenerator)
{
    // Both curves now verify correctly when the public key is ±G: secp256k1 via its GLV path, secp256r1 via the
    // fake-GLV two-2-MSM path (each MSM's inputs are {G, ±T₁} or {Q, ±T₂}, which only collide if u_i = ±1 -- a
    // negligible probability for honest signatures).
    bool signature_result = true;
    bool expected_circuit_result = true;

    TestFixture::test_signature_generator(false, signature_result, expected_circuit_result);
    TestFixture::test_signature_generator(true, signature_result, expected_circuit_result);
}

TEST(EcdsaTests, Secp256k1PointAtInfinityRegression)
{
    using Curve = stdlib::secp256k1<UltraCircuitBuilder>;

    using FqNative = Curve::BaseFieldNative;
    using FrNative = Curve::ScalarFieldNative;
    using G1Native = Curve::GroupNative;

    using Builder = Curve::Builder;
    using FrStdlib = Curve::ScalarField;
    using FqStdlib = Curve::BaseField;
    using G1Stdlib = Curve::Group;

    // Attack parameters for P = 5*G
    // These are crafted so that u1*G + u2*P = O (point at infinity)
    const std::array<uint8_t, 32> pub_x_bytes = { 0x2f, 0x8b, 0xde, 0x4d, 0x1a, 0x07, 0x20, 0x93, 0x55, 0xb4, 0xa7,
                                                  0x25, 0x0a, 0x5c, 0x51, 0x28, 0xe8, 0x8b, 0x84, 0xbd, 0xdc, 0x61,
                                                  0x9a, 0xb7, 0xcb, 0xa8, 0xd5, 0x69, 0xb2, 0x40, 0xef, 0xe4 };
    const std::array<uint8_t, 32> pub_y_bytes = { 0xd8, 0xac, 0x22, 0x26, 0x36, 0xe5, 0xe3, 0xd6, 0xd4, 0xdb, 0xa9,
                                                  0xdd, 0xa6, 0xc9, 0xc4, 0x26, 0xf7, 0x88, 0x27, 0x1b, 0xab, 0x0d,
                                                  0x68, 0x40, 0xdc, 0xa8, 0x7d, 0x3a, 0xa6, 0xac, 0x62, 0xd6 };
    const std::array<uint8_t, 32> r_bytes = { 0xa8, 0x41, 0x94, 0xc3, 0x71, 0xc6, 0x7b, 0xa2, 0x59, 0x2f, 0x59,
                                              0xc6, 0x20, 0xad, 0x30, 0x4c, 0xb7, 0x6d, 0x7a, 0x88, 0x25, 0x6b,
                                              0xb5, 0x0d, 0xc4, 0x1c, 0x66, 0x57, 0x44, 0xbf, 0x78, 0x61 };
    const std::array<uint8_t, 32> s_bytes = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64 };
    const std::array<uint8_t, 32> z_bytes = { 0xb6, 0xb8, 0x18, 0x2e, 0xc7, 0x1f, 0x95, 0xd4, 0x42, 0x13, 0x3f,
                                              0x21, 0x5c, 0x9e, 0x0e, 0x7b, 0x55, 0x98, 0x0e, 0xf2, 0x02, 0x07,
                                              0xf7, 0xaa, 0x2a, 0xbb, 0x7a, 0x7e, 0xe9, 0x1b, 0xab, 0x1f };

    FqNative pub_x = FqNative::serialize_from_buffer(pub_x_bytes.data());
    FqNative pub_y = FqNative::serialize_from_buffer(pub_y_bytes.data());
    typename G1Native::affine_element public_key_native(pub_x, pub_y);
    ASSERT_TRUE(public_key_native.on_curve()) << "Public key must be on curve";

    // Native verification
    const std::string message_string(z_bytes.begin(), z_bytes.end());
    ecdsa_signature sig;
    sig.r = r_bytes;
    sig.s = s_bytes;
    sig.v = 27;
    bool native_verification =
        ecdsa_verify_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, public_key_native, sig);

    bool stdlib_verification;
    {
        Builder builder;

        const G1Stdlib public_key_ct = G1Stdlib::from_witness(&builder, public_key_native);

        const std::vector<uint8_t> r_vec(r_bytes.begin(), r_bytes.end());
        const std::vector<uint8_t> s_vec(s_bytes.begin(), s_bytes.end());
        const stdlib::ecdsa_signature<Builder> sig_ct{ stdlib::byte_array<Builder>(&builder, r_vec),
                                                       stdlib::byte_array<Builder>(&builder, s_vec) };

        const std::vector<uint8_t> z_vec(z_bytes.begin(), z_bytes.end());
        const stdlib::byte_array<Builder> hashed_message_ct(&builder, z_vec);

        const stdlib::bool_t<Builder> signature_result =
            stdlib::ecdsa_verify_signature<Builder, Curve, FqStdlib, FrStdlib, G1Stdlib>(
                hashed_message_ct, public_key_ct, sig_ct);

        stdlib_verification = signature_result.get_value();

        const bool circuit_valid = CircuitChecker::check(builder);

        // Circuit should be satisfied but signature should be rejected
        ASSERT_TRUE(circuit_valid);
    }

    // Both native and stdlib should reject this invalid signature
    EXPECT_FALSE(native_verification);
    EXPECT_FALSE(stdlib_verification);
    EXPECT_EQ(native_verification, stdlib_verification);
}

TEST(EcdsaTests, Secp256r1NativeStdlibDiscrepancyRegression)
{
    using Curve = stdlib::secp256r1<UltraCircuitBuilder>;

    using FqNative = Curve::BaseFieldNative;
    using FrNative = Curve::ScalarFieldNative;
    using G1Native = Curve::GroupNative;

    using Builder = Curve::Builder;
    using FrStdlib = Curve::ScalarField;
    using FqStdlib = Curve::BaseField;
    using G1Stdlib = Curve::Group;

    const std::array<uint8_t, 32> pub_x_bytes = { 0x79, 0x9f, 0x2a, 0xba, 0xfa, 0x27, 0x16, 0x4b, 0x09, 0x50, 0xf2,
                                                  0xc8, 0x82, 0xf0, 0xd1, 0x67, 0xe1, 0xd2, 0x16, 0x74, 0x87, 0xd5,
                                                  0x2e, 0xa7, 0x23, 0x0b, 0x5d, 0x96, 0xc2, 0xa8, 0x74, 0x00 };
    const std::array<uint8_t, 32> pub_y_bytes = { 0xda, 0xa5, 0x79, 0xf4, 0xf1, 0x61, 0xe9, 0xdc, 0xa1, 0xa1, 0x34,
                                                  0x35, 0x92, 0x16, 0xb9, 0x35, 0xea, 0xd0, 0x97, 0x2d, 0x76, 0x3f,
                                                  0xe3, 0x33, 0xc7, 0x12, 0xee, 0x8d, 0x18, 0x4b, 0xd8, 0x11 };
    const std::array<uint8_t, 32> r_bytes = { 0xb1, 0x99, 0xa1, 0x62, 0x72, 0x66, 0x61, 0xba, 0x23, 0x3c, 0xd6,
                                              0xc6, 0x6e, 0x99, 0x0b, 0x01, 0x2e, 0x1e, 0x76, 0x04, 0xb1, 0x1f,
                                              0x76, 0x19, 0x3b, 0x2a, 0xf5, 0xca, 0x36, 0xc1, 0x01, 0x76 };
    const std::array<uint8_t, 32> s_bytes = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05 };
    const std::array<uint8_t, 32> z_bytes = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05 };

    const FqNative pub_x = FqNative::serialize_from_buffer(pub_x_bytes.data());
    const FqNative pub_y = FqNative::serialize_from_buffer(pub_y_bytes.data());
    const typename G1Native::affine_element public_key_native(pub_x, pub_y);
    ASSERT_TRUE(public_key_native.on_curve()) << "Public key must be on curve";

    // Native verification
    const std::string message_string(z_bytes.begin(), z_bytes.end());
    ecdsa_signature sig;
    sig.r = r_bytes;
    sig.s = s_bytes;
    sig.v = 27;
    bool native_verification =
        ecdsa_verify_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, public_key_native, sig);

    // Stdlib verification
    Builder builder;
    const G1Stdlib public_key_ct = G1Stdlib::from_witness(&builder, public_key_native);

    const std::vector<uint8_t> r_vec(r_bytes.begin(), r_bytes.end());
    const std::vector<uint8_t> s_vec(s_bytes.begin(), s_bytes.end());
    const stdlib::ecdsa_signature<Builder> sig_ct{ stdlib::byte_array<Builder>(&builder, r_vec),
                                                   stdlib::byte_array<Builder>(&builder, s_vec) };

    const std::vector<uint8_t> z_vec(z_bytes.begin(), z_bytes.end());
    const stdlib::byte_array<Builder> hashed_message_ct(&builder, z_vec);

    const stdlib::bool_t<Builder> signature_result =
        stdlib::ecdsa_verify_signature<Builder, Curve, FqStdlib, FrStdlib, G1Stdlib>(
            hashed_message_ct, public_key_ct, sig_ct);

    bool stdlib_verification = signature_result.get_value();

    const bool circuit_valid = CircuitChecker::check(builder);
    ASSERT_TRUE(circuit_valid);

    EXPECT_EQ(native_verification, stdlib_verification);
}

TEST(EcdsaTests, Secp256r1NafOverflowRegression)
{
    using Curve = stdlib::secp256r1<UltraCircuitBuilder>;

    using FqNative = Curve::BaseFieldNative;
    using G1Native = Curve::GroupNative;

    using Builder = Curve::Builder;
    using FrStdlib = Curve::ScalarField;
    using FqStdlib = Curve::BaseField;
    using G1Stdlib = Curve::Group;

    const std::array<uint8_t, 32> pub_x_bytes = { 0xbd, 0xae, 0xdd, 0xff, 0x80, 0x69, 0x8b, 0xd0, 0xb5, 0xdb, 0x79,
                                                  0x10, 0xe1, 0xc6, 0x56, 0x9d, 0xc3, 0x4e, 0x77, 0x3b, 0xda, 0x69,
                                                  0x5e, 0x61, 0x5c, 0x87, 0xf5, 0x4e, 0x6a, 0x70, 0x7e, 0xd6 };
    const std::array<uint8_t, 32> pub_y_bytes = { 0xc1, 0xb3, 0x69, 0x9c, 0x7e, 0xea, 0x97, 0xbe, 0x5e, 0x52, 0x3d,
                                                  0x47, 0x5c, 0x5f, 0x72, 0x00, 0x97, 0x2c, 0x61, 0x23, 0xf2, 0xcd,
                                                  0x3d, 0x59, 0x33, 0x54, 0xe7, 0x4d, 0x35, 0xd1, 0x85, 0x11 };
    const std::array<uint8_t, 32> r_bytes = { 0x4d, 0xc6, 0x6f, 0x06, 0x26, 0x12, 0x5d, 0x49, 0xb5, 0xa7, 0x7d,
                                              0x36, 0xc3, 0xf9, 0x7e, 0x9b, 0xb8, 0x29, 0x48, 0xf2, 0xbd, 0xdc,
                                              0xf8, 0x43, 0xe5, 0xee, 0x13, 0x3c, 0xc8, 0x96, 0xf1, 0xd8 };
    const std::array<uint8_t, 32> s_bytes = { 0x52, 0x59, 0x33, 0x34, 0x92, 0xf6, 0x68, 0x42, 0x1a, 0xe0, 0x63,
                                              0x3f, 0x2d, 0x16, 0x92, 0x4b, 0x9f, 0x3b, 0xe9, 0x36, 0xee, 0xd3,
                                              0xf1, 0x96, 0x28, 0x6e, 0x0a, 0x57, 0x5d, 0xe2, 0x9f, 0xb7 };
    const std::array<uint8_t, 32> z_bytes = { 0x93, 0xd5, 0x0c, 0x3d, 0xd6, 0xd6, 0xc3, 0xf7, 0xf7, 0x55, 0x0e,
                                              0x69, 0x76, 0x40, 0x2b, 0x89, 0xaa, 0xf2, 0xd6, 0x8a, 0x7a, 0x94,
                                              0x80, 0x44, 0x69, 0xaa, 0x69, 0x03, 0x15, 0xb8, 0x64, 0x31 };

    const FqNative pub_x = FqNative::serialize_from_buffer(pub_x_bytes.data());
    const FqNative pub_y = FqNative::serialize_from_buffer(pub_y_bytes.data());
    const typename G1Native::affine_element public_key_native(pub_x, pub_y);
    ASSERT_TRUE(public_key_native.on_curve()) << "Public key must be on curve";

    Builder builder;
    const G1Stdlib public_key_ct = G1Stdlib::from_witness(&builder, public_key_native);

    const std::vector<uint8_t> r_vec(r_bytes.begin(), r_bytes.end());
    const std::vector<uint8_t> s_vec(s_bytes.begin(), s_bytes.end());
    const stdlib::ecdsa_signature<Builder> sig_ct{ stdlib::byte_array<Builder>(&builder, r_vec),
                                                   stdlib::byte_array<Builder>(&builder, s_vec) };

    const std::vector<uint8_t> z_vec(z_bytes.begin(), z_bytes.end());
    const stdlib::byte_array<Builder> hashed_message_ct(&builder, z_vec);

    const stdlib::bool_t<Builder> signature_result =
        stdlib::ecdsa_verify_signature<Builder, Curve, FqStdlib, FrStdlib, G1Stdlib>(
            hashed_message_ct, public_key_ct, sig_ct);

    // Verification should succeed for this valid signature
    EXPECT_TRUE(signature_result.get_value());

    const bool circuit_valid = CircuitChecker::check(builder);
    ASSERT_TRUE(circuit_valid);
}

// Regression for the `is_u2_acceptable` AND-term on `ecdsa_impl.hpp`'s validity flag. The fake-GLV
// path substitutes u₂ ∈ {0, ±1} with u₂ = 2 (to avoid a ROM x-collision between Q and T₂), so the
// MSM result is wrong; rejection relies on `is_u2_acceptable` being ANDed into the validity bit.
// We construct an honest signature with s = r so u₂ ≡ 1, confirm native ECDSA accepts, and assert
// the circuit rejects. Probability of hitting this branch honestly is ≈ 1/n ≈ 2⁻²⁵⁶.
TEST(EcdsaTests, Secp256r1HonestU2EqualsOneRejected)
{
    using Curve = stdlib::secp256r1<UltraCircuitBuilder>;
    using Builder = Curve::Builder;
    using FqNative = Curve::BaseFieldNative;
    using FrNative = Curve::ScalarFieldNative;
    using G1Native = Curve::GroupNative;
    using FrStdlib = Curve::ScalarField;
    using FqStdlib = Curve::BaseField;
    using G1Stdlib = Curve::Group;
    using bool_t = stdlib::bool_t<Builder>;

    // Pick k so r = (kG).x mod n is in low-s range (so s = r passes is_s_in_range).
    const FrNative d("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");
    const G1Native::affine_element Q = G1Native::one * d;
    FrNative k;
    FrNative r;
    const uint256_t half_n_plus_one = (uint256_t(FrNative::modulus) + uint256_t(1)) / uint256_t(2);
    for (uint64_t seed = 1; seed < 100; ++seed) {
        k = FrNative(uint256_t(seed));
        const G1Native::affine_element R(G1Native::one * k);
        r = FrNative(uint256_t(R.x));
        if (r != FrNative::zero() && uint256_t(r) < half_n_plus_one) {
            break;
        }
    }
    ASSERT_NE(r, FrNative::zero());
    ASSERT_LT(uint256_t(r), half_n_plus_one);

    // s = r and z = r·(k − d) give s = k⁻¹·(z + r·d) = r, so u₂ = r/s ≡ 1.
    const FrNative s = r;
    const FrNative z = r * (k - d);
    const FrNative s_inv = s.invert();
    ASSERT_EQ(r * s_inv, FrNative::one());

    // Native ECDSA accepts (computed manually since the existing helper SHA-hashes its input).
    {
        const FrNative u1 = z * s_inv;
        const FrNative u2 = r * s_inv;
        const G1Native::affine_element R_native(G1Native::one * u1 + G1Native::element(Q) * u2);
        ASSERT_FALSE(R_native.is_point_at_infinity());
        EXPECT_EQ(FrNative(uint256_t(R_native.x)), r);
    }

    Builder builder;
    G1Stdlib public_key_ct = G1Stdlib::from_witness(&builder, Q);

    std::array<uint8_t, 32> r_bytes;
    std::array<uint8_t, 32> s_bytes;
    std::array<uint8_t, 32> z_bytes;
    FrNative::serialize_to_buffer(r, r_bytes.data());
    FrNative::serialize_to_buffer(s, s_bytes.data());
    FqNative::serialize_to_buffer(FqNative(uint256_t(z)), z_bytes.data());

    const std::vector<uint8_t> r_vec(r_bytes.begin(), r_bytes.end());
    const std::vector<uint8_t> s_vec(s_bytes.begin(), s_bytes.end());
    const std::vector<uint8_t> z_vec(z_bytes.begin(), z_bytes.end());
    stdlib::ecdsa_signature<Builder> sig_ct{ stdlib::byte_array<Builder>(&builder, r_vec),
                                             stdlib::byte_array<Builder>(&builder, s_vec) };
    stdlib::byte_array<Builder> hashed_message(&builder, z_vec);

    bool_t result = stdlib::ecdsa_verify_signature<Builder, Curve, FqStdlib, FrStdlib, G1Stdlib>(
        hashed_message, public_key_ct, sig_ct);
    EXPECT_FALSE(result.get_value()) << "circuit must reject honest u₂ ≡ 1";
    EXPECT_TRUE(CircuitChecker::check(builder));
}
