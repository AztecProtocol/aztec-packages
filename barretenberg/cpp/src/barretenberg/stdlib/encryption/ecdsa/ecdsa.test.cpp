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
        InvalidR,
        InvalidS,
        HighS,
        OutOfBoundsHash,
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

    /**
     * @brief Generate valid signature for the message Fr(1)
     *
     * @return ecdsa_signature
     */
    ecdsa_signature generate_signature_out_of_bounds_hash()
    {
        // Generate signature
        ecdsa_signature signature;

        FrNative fr_hash = FrNative::one();
        FrNative k = FrNative::random_element();
        typename G1Native::affine_element R = G1Native::one * k;
        FqNative::serialize_to_buffer(R.x, &signature.r[0]);

        FrNative r = FrNative::serialize_from_buffer(&signature.r[0]);
        FrNative k_inverse = k.invert();
        FrNative s = k_inverse * (fr_hash + r * private_key);
        bool is_s_low = (static_cast<uint256_t>(s) < (FrNative::modulus + 1) / 2);
        s = is_s_low ? s : -s;
        FrNative::serialize_to_buffer(s, &signature.s[0]);

        FqNative r_fq(R.x);
        bool is_r_finite = (uint256_t(r_fq) == uint256_t(r));
        bool y_parity = uint256_t(R.y).get_bit(0);
        bool recovery_bit = y_parity ^ is_s_low;
        constexpr uint8_t offset = 27;

        int value =
            offset + static_cast<int>(recovery_bit) + (static_cast<uint8_t>(2) * static_cast<int>(!is_r_finite));
        BB_ASSERT_LTE(value, UINT8_MAX);
        signature.v = static_cast<uint8_t>(value);

        // Natively verify signature
        FrNative s_inverse = s.invert();
        typename G1Native::affine_element Q = G1Native::one * ((fr_hash * s_inverse) + (r * s_inverse * private_key));
        BB_ASSERT_EQ(static_cast<uint512_t>(Q.x),
                     static_cast<uint512_t>(r),
                     "Signature with out of bounds message failed verification");

        return signature;
    }

    std::string tampering(std::string message_string,
                          ecdsa_key_pair<FrNative, G1Native>& account,
                          ecdsa_signature& signature,
                          TamperingMode mode)
    {
        std::string failure_msg;

        switch (mode) {
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
            failure_msg = "ECDSA input validation: the s component of the signature is bigger than Fr::modulus - s.: "
                          "hi limb."; // The second part of the message is added by the range constraint
            break;
        }
        case TamperingMode::OutOfBoundsHash: {
            // Invalidate the circuit by passing a message whose hash is bigger than n
            // (the message will be hard-coded in the circuit at a later point)
            signature = generate_signature_out_of_bounds_hash();

            failure_msg = "ECDSA input validation: the hash of the message is bigger than the order of the elliptic "
                          "curve.: hi limb."; // The second part of the message is added by the range constraint
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

        bool expected = mode == TamperingMode::None;
        BB_ASSERT_EQ(is_signature_valid,
                     expected,
                     "Signature verification returned a different result from the expected one. If the signature was "
                     "randomly generated, there is a (very) small chance this is not a bug.");

        return failure_msg;
    }

    std::pair<G1, stdlib::ecdsa_signature<Builder>> create_stdlib_ecdsa_data(
        Builder& builder, const ecdsa_key_pair<FrNative, G1Native>& account, const ecdsa_signature& signature)
    {
        // We construct the point via its x,y-coordinates to avoid the on curve check of G1::from_witness. In this way
        // we test the on curve check of the ecdsa verification function
        Fq x = Fq::from_witness(&builder, account.public_key.x);
        Fq y = Fq::from_witness(&builder, account.public_key.y);
        bool_t is_infinity(
            stdlib::witness_t<Builder>(&builder, account.public_key.is_point_at_infinity() ? fr::one() : fr::zero()),
            false);
        G1 pub_key(x, y, is_infinity);
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
                                    const bool circuit_checker_result,
                                    const std::string failure_msg)

    {
        auto [public_key, sig] = create_stdlib_ecdsa_data(builder, account, signature);

        // Verify signature
        stdlib::bool_t<Builder> signature_result =
            stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, sig);

        // Enforce verification returns the expected result
        signature_result.assert_equal(stdlib::bool_t<Builder>(signature_verification_result));

        // Check native values
        EXPECT_EQ(signature_result.get_value(), signature_verification_result);

        // Log data
        std::cerr << "num gates = " << builder.get_estimated_num_finalized_gates() << std::endl;
        benchmark_info(Builder::NAME_STRING,
                       "ECDSA",
                       "Signature Verification Test",
                       "Gate Count",
                       builder.get_estimated_num_finalized_gates());

        // Circuit checker
        bool is_circuit_satisfied = CircuitChecker::check(builder);
        EXPECT_EQ(is_circuit_satisfied, circuit_checker_result);

        // Check the error
        EXPECT_EQ(builder.err(), failure_msg);
    }

    stdlib::byte_array<Builder> construct_hashed_message(Builder& builder,
                                                         std::vector<uint8_t>& message_bytes,
                                                         TamperingMode mode)
    {
        stdlib::byte_array<Builder> message(&builder, message_bytes);
        stdlib::byte_array<Builder> hashed_message;

        if (mode == TamperingMode::OutOfBoundsHash) {
            // In this case the message is already hashed, so we mock the hashing constraints for consistency but
            // hard-code the message
            [[maybe_unused]] stdlib::byte_array<Builder> _ =
                static_cast<stdlib::byte_array<Builder>>(stdlib::SHA256<Builder>::hash(message));

            // Hard-coded witness
            std::array<uint8_t, 32> hashed_message_witness;

            // The hashed message is FrNative::modulus + 1
            FqNative fr_hash = FqNative(FrNative::modulus + 1);
            FqNative::serialize_to_buffer(fr_hash, &hashed_message_witness[0]);

            hashed_message = stdlib::byte_array<Builder>(
                &builder, std::vector<uint8_t>(hashed_message_witness.begin(), hashed_message_witness.end()));
        } else {
            hashed_message = static_cast<stdlib::byte_array<Builder>>(stdlib::SHA256<Builder>::hash(message));
        }

        return hashed_message;
    }

    void test_verify_signature(bool random_signature, TamperingMode mode)
    {
        // Map tampering mode to signature verification result
        bool signature_verification_result =
            (mode == TamperingMode::None) || (mode == TamperingMode::HighS) || (mode == TamperingMode::OutOfBoundsHash);
        // Map tampering mode to circuit checker result
        bool circuit_checker_result =
            (mode == TamperingMode::None) || (mode == TamperingMode::InvalidR) || (mode == TamperingMode::InvalidS);

        std::string message_string = "Goblin";
        std::vector<uint8_t> message_bytes(message_string.begin(), message_string.end());

        auto [account, signature] = generate_dummy_ecdsa_data(message_string, /*random_signature=*/random_signature);

        // Tamper with the signature
        std::string failure_msg = tampering(message_string, account, signature, mode);

        // Create ECDSA verification circuit
        Builder builder;

        // Compute H(m)
        stdlib::byte_array<Builder> hashed_message = construct_hashed_message(builder, message_bytes, mode);

        // ECDSA verification
        ecdsa_verification_circuit(builder,
                                   hashed_message,
                                   account,
                                   signature,
                                   signature_verification_result,
                                   circuit_checker_result,
                                   failure_msg);
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

            // Create ECDSA verification circuit
            Builder builder;

            // Compute H(m)
            stdlib::byte_array<Builder> hashed_message =
                construct_hashed_message(builder, test.message, TamperingMode::None);

            // ECDSA verification
            ecdsa_verification_circuit(builder,
                                       hashed_message,
                                       account,
                                       { r, s, v },
                                       test.is_valid_signature,
                                       test.is_circuit_satisfied,
                                       test.failure_msg);
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

TYPED_TEST(EcdsaTests, OutOfBoundsHash)
{
    TestFixture::test_verify_signature(/*random_signature=*/false, TestFixture::TamperingMode::OutOfBoundsHash);
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
