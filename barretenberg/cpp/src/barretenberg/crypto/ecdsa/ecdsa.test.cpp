#include "ecdsa.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa_tests_data.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::crypto;

// Templated test fixture for ECDSA operations on different curves
template <typename EcdsaTestParams> class EcdsaNativeTests : public ::testing::Test {
  public:
    using Curve = typename EcdsaTestParams::CurveType;
    using Hasher = typename EcdsaTestParams::Hasher;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using G1 = typename Curve::Group;
    using AffineElement = typename Curve::AffineElement;

    // Generate a random keypair for the curve
    static ecdsa_key_pair<Fr, G1> generate_keypair()
    {
        ecdsa_key_pair<Fr, G1> account;
        account.private_key = Fr::random_element();
        account.public_key = G1::one * account.private_key;
        return account;
    }

    // Create a valid signature for the given message and account
    static ecdsa_signature create_valid_signature(const std::string& message, const ecdsa_key_pair<Fr, G1>& account)
    {
        return ecdsa_construct_signature<Hasher, Fq, Fr, G1>(message, account);
    }

    // Verify a signature
    static bool verify_signature(const std::string& message,
                                 const AffineElement& public_key,
                                 const ecdsa_signature& sig)
    {
        return ecdsa_verify_signature<Hasher, Fq, Fr, G1>(message, public_key, sig);
    }

    // Recover public key from signature (only works for curves with recovery support)
    static AffineElement recover_public_key(const std::string& message, const ecdsa_signature& sig)
    {
        return ecdsa_recover_public_key<Hasher, Fq, Fr, G1>(message, sig);
    }

    // Fetch Wycherproof test cases for the curve
    template <typename T>
    static auto get_wycheproof_test_cases()
        requires(T::has_wycheproof_tests)
    {
        if constexpr (std::is_same_v<typename T::Type, bb::curve::SECP256K1>) {
            return secp256k1_tests;
        } else if constexpr (std::is_same_v<typename T::Type, bb::curve::SECP256R1>) {
            return secp256r1_tests;
        }
    }
};

// Define curve wrapper structs to match the pattern
struct secp256k1_curve {
    using Type = bb::curve::SECP256K1;
    using ScalarField = secp256k1::fr;
    using BaseField = secp256k1::fq;
    using Group = secp256k1::g1;
    using AffineElement = secp256k1::g1::affine_element;
    static constexpr bool supports_recovery = true;
    static constexpr bool has_wycheproof_tests = true;
};

struct secp256r1_curve {
    using Type = bb::curve::SECP256R1;
    using ScalarField = secp256r1::fr;
    using BaseField = secp256r1::fq;
    using Group = secp256r1::g1;
    using AffineElement = secp256r1::g1::affine_element;
    static constexpr bool supports_recovery = true;
    static constexpr bool has_wycheproof_tests = true;
};

struct grumpkin_curve {
    using ScalarField = grumpkin::fr;
    using BaseField = grumpkin::fq;
    using Group = grumpkin::g1;
    using AffineElement = grumpkin::g1::affine_element;
    static constexpr bool supports_recovery = false;
    static constexpr bool has_wycheproof_tests = false;
};

template <typename Curve, typename Hasher_> struct EcdsaTestParams {
  public:
    using CurveType = Curve;
    using Hasher = Hasher_;
};

// Define the list of curve types to test
using Params = ::testing::Types<EcdsaTestParams<secp256k1_curve, Sha256Hasher>,
                                EcdsaTestParams<secp256r1_curve, Sha256Hasher>,
                                EcdsaTestParams<grumpkin_curve, Sha256Hasher>,
                                EcdsaTestParams<secp256k1_curve, Blake2sHasher>,
                                EcdsaTestParams<secp256r1_curve, Blake2sHasher>,
                                EcdsaTestParams<grumpkin_curve, Blake2sHasher>,
                                EcdsaTestParams<secp256k1_curve, KeccakHasher>,
                                EcdsaTestParams<secp256r1_curve, KeccakHasher>,
                                EcdsaTestParams<grumpkin_curve, KeccakHasher>>;

// Register the test suite
TYPED_TEST_SUITE(EcdsaNativeTests, Params);

// ================================================================================
// POSITIVE TESTS: Valid signatures should pass verification
// ================================================================================

TYPED_TEST(EcdsaNativeTests, VerifyValidSignature)
{
    std::string message = "The quick brown dog jumped over the lazy fox.";

    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);
    bool result = TestFixture::verify_signature(message, account.public_key, signature);

    EXPECT_TRUE(result);
}

TYPED_TEST(EcdsaNativeTests, RecoverPublicKey)
{
    using Curve = TypeParam::CurveType;

    std::string message = "The quick brown dog jumped over the lazy fox.";

    if constexpr (Curve::supports_recovery) {
        auto account = TestFixture::generate_keypair();
        ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

        // Verify the signature is valid
        bool result = TestFixture::verify_signature(message, account.public_key, signature);
        EXPECT_TRUE(result);

        // Recover the public key and check it matches
        auto recovered_public_key = TestFixture::recover_public_key(message, signature);
        EXPECT_EQ(recovered_public_key, account.public_key);
    } else {
        GTEST_SKIP() << "Public key recovery not supported for this curve";
    }
}

// ================================================================================
// NEGATIVE TESTS: Invalid signatures should be rejected
// ================================================================================

TYPED_TEST(EcdsaNativeTests, RejectZeroR)
{
    using serialize::write;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Set r = 0
    uint256_t zero_r = 0;
    auto* r_ptr = &signature.r[0];
    write(r_ptr, zero_r);

    bool result = TestFixture::verify_signature(message, account.public_key, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, RejectROverflowModulus)
{
    using serialize::read;
    using serialize::write;
    using Fr = typename TestFixture::Fr;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Set r = 1 + Fr::modulus (overflow)
    uint256_t overflowing_r = uint256_t(1) + uint256_t(Fr::modulus);
    auto* r_write_ptr = &signature.r[0];
    write(r_write_ptr, overflowing_r);

    bool result = TestFixture::verify_signature(message, account.public_key, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, RejectZeroS)
{
    using serialize::write;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Set s = 0
    uint256_t zero_s = 0;
    auto* s_ptr = &signature.s[0];
    write(s_ptr, zero_s);

    bool result = TestFixture::verify_signature(message, account.public_key, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, RejectHighS)
{
    using serialize::read;
    using serialize::write;
    using Fr = typename TestFixture::Fr;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Set s to high s (should be rejected)
    Fr s = Fr::serialize_from_buffer(&signature.s[0]);
    Fr::serialize_to_buffer(-s, &signature.s[0]);

    bool result = TestFixture::verify_signature(message, account.public_key, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, RejectInvalidPublicKey)
{
    using Fq = typename TestFixture::Fq;
    using AffineElement = typename TestFixture::AffineElement;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Create a point not on the curve by taking a valid point and modifying y
    AffineElement invalid_pubkey = account.public_key;
    invalid_pubkey.y = invalid_pubkey.y + Fq::one();

    bool result = TestFixture::verify_signature(message, invalid_pubkey, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, RejectInfinityPublicKey)
{
    using AffineElement = typename TestFixture::AffineElement;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Use point at infinity as public key
    AffineElement infinity_pubkey = AffineElement::infinity();

    bool result = TestFixture::verify_signature(message, infinity_pubkey, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, RejectInfinityResult)
{
    using Fr = typename TestFixture::Fr;
    using G1 = typename TestFixture::G1;

    std::string message = "Test message";
    auto account = TestFixture::generate_keypair();
    ecdsa_signature signature = TestFixture::create_valid_signature(message, account);

    // Compute H(m)
    std::vector<uint8_t> buffer;
    std::ranges::copy(message, std::back_inserter(buffer));
    auto hash = Sha256Hasher::hash(buffer);

    // Override the public key: new public key is (-hash) * r^{-1} * G
    Fr fr_hash = Fr::serialize_from_buffer(hash.data());
    Fr r = Fr::serialize_from_buffer(&signature.r[0]);
    Fr r_inverse = r.invert();
    Fr modified_private_key = r_inverse * (-fr_hash);
    account.public_key = G1::one * modified_private_key;

    // Verify that the result is the point at infinity
    auto P = G1::one * fr_hash + account.public_key * r;
    BB_ASSERT_EQ(P.is_point_at_infinity(), true);

    bool result = TestFixture::verify_signature(message, account.public_key, signature);
    EXPECT_FALSE(result);
}

TYPED_TEST(EcdsaNativeTests, Wycherproof)
{
    using Curve = TypeParam::CurveType;
    using AffineElement = TestFixture::AffineElement;
    using Fr = TestFixture::Fr;

    if constexpr (Curve::has_wycheproof_tests) {
        for (const auto& test_case : TestFixture::template get_wycheproof_test_cases<Curve>()) {
            std::string message_string(test_case.message.begin(), test_case.message.end());
            std::array<uint8_t, 32> r;
            std::array<uint8_t, 32> s;
            Fr::serialize_to_buffer(test_case.r, &r[0]);
            Fr::serialize_to_buffer(test_case.s, &s[0]);
            ecdsa_signature sig = { r, s, ECDSA_RECOVERY_ID_OFFSET };

            bool is_signature_valid = ecdsa_verify_signature<Sha256Hasher,
                                                             typename Curve::BaseField,
                                                             typename Curve::ScalarField,
                                                             typename Curve::Group>(
                message_string, AffineElement(test_case.x, test_case.y), sig);

            EXPECT_EQ(is_signature_valid, test_case.is_valid_signature) << "Test case: " << test_case.comment;
        }
    } else {
        GTEST_SKIP() << "Wycheproof tests not available for this curve";
    }
}

// ================================================================================
// STANDALONE TESTS: Non-templated tests for specific scenarios
// ================================================================================

TEST(ecdsa, msgpack)
{
    auto [actual, expected] = msgpack_roundtrip(ecdsa_signature{});
    EXPECT_EQ(actual, expected);
}

TEST(ecdsa, verify_signature_secp256r1_sha256_NIST_1)
{
    /*
    Msg =
    5905238877c77421f73e43ee3da6f2d9e2ccad5fc942dcec0cbd25482935faaf416983fe165b1a045ee2bcd2e6dca3bdf46c4310a7461f9a37960ca672d3feb5473e253605fb1ddfd28065b53cb5858a8ad28175bf9bd386a5e471ea7a65c17cc934a9d791e91491eb3754d03799790fe2d308d16146d5c9b0d0debd97d79ce8
    d = 519b423d715f8b581f4fa8ee59f4771a5b44c8130b4e3eacca54a56dda72b464
    Qx = 1ccbe91c075fc7f4f033bfa248db8fccd3565de94bbfb12f3c59ff46c271bf83
    Qy = ce4014c68811f9a21a1fdb2c0e6113e06db7ca93b7404e78dc7ccd5ca89a4ca9
    k = 94a1bbb14b906a61a280f245f9e93c7f3b4a6247824f5d33b9670787642a68de
    R = f3ac8061b514795b8843e3d6629527ed2afd6b1f6a555a7acabb5e6f79c8c2ac
    S = 740887e535fa594e879389d9d408c8e2cd4f4894bda8872ab6ebf098305d9c4e
    */

    secp256r1::fq P_x = secp256r1::fq(0x3c59ff46c271bf83, 0xd3565de94bbfb12f, 0xf033bfa248db8fcc, 0x1ccbe91c075fc7f4)
                            .to_montgomery_form();
    secp256r1::fq P_y = secp256r1::fq(0xdc7ccd5ca89a4ca9, 0x6db7ca93b7404e78, 0x1a1fdb2c0e6113e0, 0xce4014c68811f9a2)
                            .to_montgomery_form();

    secp256r1::g1::affine_element public_key(P_x, P_y);
    std::array<uint8_t, 32> r{
        0xf3, 0xac, 0x80, 0x61, 0xb5, 0x14, 0x79, 0x5b, 0x88, 0x43, 0xe3, 0xd6, 0x62, 0x95, 0x27, 0xed,
        0x2a, 0xfd, 0x6b, 0x1f, 0x6a, 0x55, 0x5a, 0x7a, 0xca, 0xbb, 0x5e, 0x6f, 0x79, 0xc8, 0xc2, 0xac,
    };

    std::array<uint8_t, 32> s{
        0x74, 0x08, 0x87, 0xe5, 0x35, 0xfa, 0x59, 0x4e, 0x87, 0x93, 0x89, 0xd9, 0xd4, 0x08, 0xc8, 0xe2,
        0xcd, 0x4f, 0x48, 0x94, 0xbd, 0xa8, 0x87, 0x2a, 0xb6, 0xeb, 0xf0, 0x98, 0x30, 0x5d, 0x9c, 0x4e,
    };

    ecdsa_signature sig{ r, s, 27 };
    std::vector<uint8_t> message_vec = utils::hex_to_bytes(
        "5905238877c77421f73e43ee3da6f2d9e2ccad5fc942dcec0cbd25482935faaf416983fe165b1a045ee2bcd2e6dca3bdf46"
        "c4310a7461f9a37960ca672d3feb5473e253605fb1ddfd28065b53cb5858a8ad28175bf9bd386a5e471ea7a65c17cc934a9"
        "d791e91491eb3754d03799790fe2d308d16146d5c9b0d0debd97d79ce8");
    std::string message(message_vec.begin(), message_vec.end());

    bool result =
        ecdsa_verify_signature<Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(message, public_key, sig);
    EXPECT_EQ(result, true);
}
