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
    using FrNative = Curve::fr;
    using FqNative = Curve::fq;
    using G1Native = Curve::g1;

    // Stdlib types
    using Fr = Curve::bigfr_ct;
    using Fq = Curve::fq_ct;
    using G1 = Curve::g1_bigfr_ct;
    using bool_t = Curve::bool_ct;

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
            info("The private key used generate this signature is: ", private_key);
        }

        return { account, signature };
    }

    std::string tampering(std::string message_string,
                          ecdsa_key_pair<FrNative, G1Native>& account,
                          ecdsa_signature& signature,
                          TamperingMode mode)
    {
        std::string failure_msg;

        switch (mode) {
        case TamperingMode::XCoordinateOverflow: {
            // Invalidate the circuit by passing a public key with x >= q
            // Do nothing here, tampering happens in circuit
            failure_msg = "ECDSA input validation: coordinate(s) of the public key bigger than the base field modulus. "
                          "(x coordinate): hi limb.";
            break;
        }
        case TamperingMode::YCoordinateOverflow: {
            // Invalidate the circuit by passing a public key with y >= q
            // Do nothing here, tampering happens in circuit
            failure_msg = "ECDSA input validation: coordinate(s) of the public key bigger than the base field modulus. "
                          "(y coordinate): hi limb.";
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
            failure_msg =
                "ECDSA input validation: the s component of the signature is bigger than (Fr::modulus + 1)/2.: "
                "hi limb."; // The second part of the message is added by the range constraint
            break;
        }
        case TamperingMode::ZeroR: {
            // Invalidate signature by setting r to 0
            signature.r = std::array<uint8_t, 32>{};

            failure_msg = "ECDSA input validation: the r component of the signature is zero.";
            break;
        }
        case TamperingMode::ZeroS: {
            // Invalidate signature by setting s to 0
            signature.s = std::array<uint8_t, 32>{};

            failure_msg = "ECDSA input validation: the s component of the signature is zero.";
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

            failure_msg = "ECDSA validation: the result of the batch multiplication is the point at infinity.";
            break;
        }
        case TamperingMode::InvalidPubKey: {
            // Invalidate the circuit by passing a public key which is not on the curve
            account.public_key.x = account.public_key.y;
            BB_ASSERT_EQ(account.public_key.on_curve(), false);

            failure_msg = "ECDSA input validation: the public key is not a point on the elliptic curve.";
            break;
        }
        case TamperingMode::InfinityPubKey: {
            // Invalidate the circuit by passing a public key which is not on the curve
            account.public_key.self_set_infinity();
            BB_ASSERT_EQ(account.public_key.is_point_at_infinity(), true);

            failure_msg = "ECDSA input validation: the public key is the point at infinity.";
            break;
        }
        case TamperingMode::None:
            break;
        }

        // Natively verify that the tampering was successfull
        bool is_signature_valid = ecdsa_verify_signature<Sha256Hasher, FqNative, FrNative, G1Native>(
            message_string, account.public_key, signature);
        if (mode == TamperingMode::HighS || mode == TamperingMode::InfinityScalarMul) {
            // If either s >= (n+1)/2 or the result of the scalar multiplication is the point at infinity, then the
            // verification function raises an error, we treat it as an invalid signature
            is_signature_valid = false;
        }
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

        return failure_msg;
    }

    std::pair<G1, stdlib::ecdsa_signature<Builder>> create_stdlib_ecdsa_data(
        Builder& builder,
        const ecdsa_key_pair<FrNative, G1Native>& account,
        const ecdsa_signature& signature,
        const TamperingMode mode)
    {
        // We construct the point via its x,y-coordinates to avoid the on curve check of G1::from_witness. In this way
        // we test the on curve check of the ecdsa verification function
        Fq x = Fq::from_witness(&builder, account.public_key.x);
        Fq y = Fq::from_witness(&builder, account.public_key.y);
        if (mode == TamperingMode::XCoordinateOverflow || mode == TamperingMode::YCoordinateOverflow) {
            // To test the case in which one of the two coordinates is above the modulus of the base field, we need to
            // override the limbs of the coordinates
            uint256_t max_uint = (static_cast<uint256_t>(1) << 256) - 1;
            for (size_t idx = 0; idx < 4; idx++) {
                builder.set_variable(mode == TamperingMode::XCoordinateOverflow
                                         ? x.binary_basis_limbs[idx].element.get_witness_index()
                                         : y.binary_basis_limbs[idx].element.get_witness_index(),
                                     bb::fr(max_uint.slice(64 * idx, 64 * (idx + 1))));
            }
        }
        bool_t is_infinity(
            stdlib::witness_t<Builder>(&builder, account.public_key.is_point_at_infinity() ? fr::one() : fr::zero()),
            false);
        G1 pub_key(x, y, is_infinity, /*assert_on_curve=*/false);
        pub_key.set_free_witness_tag();
        BB_ASSERT_EQ(pub_key.is_point_at_infinity().get_value(), account.public_key.is_point_at_infinity());

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());

        stdlib::ecdsa_signature<Builder> sig{ stdlib::byte_array<Builder>(&builder, rr),
                                              stdlib::byte_array<Builder>(&builder, ss) };

        return { pub_key, sig };
    }

    size_t ecdsa_verification_circuit(Builder& builder,
                                      const stdlib::byte_array<Builder>& hashed_message,
                                      const ecdsa_key_pair<FrNative, G1Native>& account,
                                      const ecdsa_signature& signature,
                                      const bool signature_verification_result,
                                      const bool circuit_checker_result,
                                      const std::string failure_msg,
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

        // Log data
        size_t finalized_num_gates = builder.get_num_finalized_gates_inefficient();
        info("num gates = ", finalized_num_gates);
        benchmark_info(Builder::NAME_STRING, "ECDSA", "Signature Verification Test", "Gate Count", finalized_num_gates);

        // Circuit checker
        bool is_circuit_satisfied = CircuitChecker::check(builder);
        EXPECT_EQ(is_circuit_satisfied, circuit_checker_result);

        // Check the error
        EXPECT_EQ(builder.err(), failure_msg);

        return finalized_num_gates;
    }

    size_t test_verify_signature(bool random_signature, TamperingMode mode)
    {
        // Map tampering mode to signature verification result
        bool signature_verification_result = (mode == TamperingMode::None) || (mode == TamperingMode::HighS);
        // Map tampering mode to circuit checker result
        bool circuit_checker_result =
            (mode == TamperingMode::None) || (mode == TamperingMode::InvalidR) || (mode == TamperingMode::InvalidS);

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
        std::string failure_msg = tampering(message_string, account, signature, mode);

        // Create ECDSA verification circuit
        Builder builder;
        stdlib::byte_array<Builder> hashed_message(&builder, hashed_message_bytes);

        // ECDSA verification
        return ecdsa_verification_circuit(builder,
                                          hashed_message,
                                          account,
                                          signature,
                                          signature_verification_result,
                                          circuit_checker_result,
                                          failure_msg,
                                          mode);
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
                                       test.failure_msg,
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
    using Curve = TypeParam;

    size_t finalized_num_gates =
        TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::None);
    static constexpr size_t NUM_GATES_SECP256K1 = 41966;
    static constexpr size_t NUM_GATES_SECP256R1 = IsMegaBuilder<typename Curve::Builder> ? 72025 : 72023;
    BB_ASSERT_EQ(finalized_num_gates,
                 Curve::type == bb::CurveType::SECP256K1 ? NUM_GATES_SECP256K1 : NUM_GATES_SECP256R1,
                 "There has been a change in the number of gates for ECDSA verification");
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
    // Disable asserts because native ecdsa verification raises an error if s >= (n+1)/2
    BB_DISABLE_ASSERTS();
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
    // Disable asserts because `validate_on_curve` raises an error in the `mult_madd` function:
    // BB_ASSERT_EQ(remainder_1024.lo, uint512_t(0))
    BB_DISABLE_ASSERTS();
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InvalidPubKey);
}

TYPED_TEST(EcdsaTests, InfinityPubKey)
{
    // Disable asserts to avoid errors trying to invert zero
    BB_DISABLE_ASSERTS();
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::InfinityPubKey);
}

TYPED_TEST(EcdsaTests, InfinityScalarMul)
{
    // Disable asserts because native ecdsa verification raises an error if the result of the scalar multiplication is
    // the point at infinity
    BB_DISABLE_ASSERTS();
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

// NullHasher returns the input bytes unchanged (assumes input is exactly 32 bytes)
struct NullHasher {
    static constexpr size_t BLOCK_SIZE = 64;
    static constexpr size_t OUTPUT_SIZE = 32;
    static std::array<uint8_t, 32> hash(const std::vector<uint8_t>& message)
    {
        std::array<uint8_t, 32> result{};
        BB_ASSERT_EQ(message.size(), 32UL);
        std::copy(message.begin(), message.end(), result.begin());
        return result;
    }
};

TEST(EcdsaTests, Secp256k1NativeStdlibDiscrepancy)
{
    // Disable asserts because native ecdsa verification raises an error if the result of the scalar multiplication is
    // the point at infinity
    BB_DISABLE_ASSERTS();
    using Curve = stdlib::secp256k1<UltraCircuitBuilder>;

    using FqNative = Curve::fq;
    using G1Native = Curve::g1;

    using Builder = Curve::Builder;
    using FrStdlib = Curve::bigfr_ct;
    using FqStdlib = Curve::fq_ct;
    using G1Stdlib = Curve::g1_bigfr_ct;

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

        // Circuit should fail because the result of the scalar multiplication is the point at infinity
        ASSERT_FALSE(circuit_valid);
        EXPECT_EQ(builder.err(), "ECDSA validation: the result of the batch multiplication is the point at infinity.");
    }

    // Both native and stdlib should reject this invalid signature
    EXPECT_FALSE(stdlib_verification);
}

TEST(EcdsaTests, Secp256r1NativeStdlibDiscrepancy)
{
    using Curve = stdlib::secp256r1<UltraCircuitBuilder>;

    using FqNative = Curve::fq;
    using FrNative = Curve::fr;
    using G1Native = Curve::g1;

    using Builder = Curve::Builder;
    using FrStdlib = Curve::bigfr_ct;
    using FqStdlib = Curve::fq_ct;
    using G1Stdlib = Curve::g1_bigfr_ct;

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
        ecdsa_verify_signature<NullHasher, FqNative, FrNative, G1Native>(message_string, public_key_native, sig);

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

TEST(EcdsaTests, Secp256r1StdlibPanic)
{
    using Curve = stdlib::secp256r1<UltraCircuitBuilder>;

    using FqNative = Curve::fq;
    using G1Native = Curve::g1;

    using Builder = Curve::Builder;
    using FrStdlib = Curve::bigfr_ct;
    using FqStdlib = Curve::fq_ct;
    using G1Stdlib = Curve::g1_bigfr_ct;

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
