#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "../../primitives/bigfield/bigfield.hpp"
#include "../../primitives/biggroup/biggroup.hpp"
#include "../../primitives/curves/secp256k1.hpp"
#include "../../primitives/curves/secp256r1.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "ecdsa.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace bb::crypto;

template <class Curve> class EcdsaTests : public ::testing::Test {
  public:
    using Builder = Curve::Builder;

    // Native Types
    using FrNative = Curve::fr;
    using FqNative = Curve::fq;
    using G1Native = Curve::g1;

    // Stdlib types
    using Fr = Curve::bigfr_ct;
    using Fq = Curve::fq_ct;
    using G1 = Curve::g1_bigfr_ct;

    struct StdlibEcdsaData {
        stdlib::byte_array<Builder> message;
        G1 public_key;
        stdlib::ecdsa_signature<Builder> sig;
    };

    std::pair<ecdsa_key_pair<FrNative, G1Native>, ecdsa_signature> generate_dummy_ecdsa_data(std::string message_string,
                                                                                             bool tamper_with_signature)
    {
        ecdsa_key_pair<FrNative, G1Native> account;
        account.private_key = FrNative::random_element();
        account.public_key = G1Native::one * account.private_key;

        ecdsa_signature signature =
            ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, account);

        if (tamper_with_signature) {
            signature.r[1] += 1;
        }

        return { account, signature };
    }

    StdlibEcdsaData create_stdlib_ecdsa_data(Builder& builder,
                                             std::string message_string,
                                             ecdsa_key_pair<FrNative, G1Native>& account,
                                             ecdsa_signature& signature)
    {
        stdlib::byte_array<Builder> message(&builder, message_string);

        G1 pub_key = G1::from_witness(&builder, account.public_key);

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());
        std::vector<uint8_t> vv = { signature.v };

        stdlib::ecdsa_signature<Builder> sig{ stdlib::byte_array<Builder>(&builder, rr),
                                              stdlib::byte_array<Builder>(&builder, ss) };

        return { message, pub_key, sig };
    }

    void test_verify_signature(bool tamper_with_signature)
    {
        // whaaablaghaaglerijgeriij
        std::string message_string = "Instructions unclear, ask again later.";

        auto [account, signature] =
            generate_dummy_ecdsa_data(message_string, /*tamper_with_signature=*/tamper_with_signature);

        // Natively verify the signature
        bool native_verification = ecdsa_verify_signature<Sha256Hasher, FqNative, FrNative, G1Native>(
            message_string, account.public_key, signature);
        EXPECT_EQ(native_verification, !tamper_with_signature);

        // Create ECDSA verification circuit
        Builder builder;

        auto [message, public_key, sig] = create_stdlib_ecdsa_data(builder, message_string, account, signature);

        // Compute H(m)
        stdlib::byte_array<Builder> hashed_message =
            static_cast<stdlib::byte_array<Builder>>(stdlib::SHA256<Builder>::hash(message));

        // Verify signature
        stdlib::bool_t<Builder> signature_result =
            stdlib::ecdsa_verify_signature<Builder, Curve, Fq, Fr, G1>(hashed_message, public_key, sig);

        // Enforce verification passed successfully
        signature_result.assert_equal(stdlib::bool_t<Builder>(true));

        EXPECT_EQ(signature_result.get_value(), !tamper_with_signature);

        std::cerr << "num gates = " << builder.get_estimated_num_finalized_gates() << std::endl;
        benchmark_info(Builder::NAME_STRING,
                       "ECDSA",
                       "Signature Verification Test",
                       "Gate Count",
                       builder.get_estimated_num_finalized_gates());
        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, !tamper_with_signature);
    }
};

using Curves = testing::Types<stdlib::secp256k1<UltraCircuitBuilder>,
                              stdlib::secp256r1<UltraCircuitBuilder>>; // TODO(federicobarbacovi): Is
                                                                       // UltraCircuitBuilder a valid assumption?

TYPED_TEST_SUITE(EcdsaTests, Curves);

TYPED_TEST(EcdsaTests, VerifySignature)
{
    TestFixture::test_verify_signature(/*tamper_with_signature=*/false);
}

TYPED_TEST(EcdsaTests, VerifySignatureFails)
{
    TestFixture::test_verify_signature(/*tamper_with_signature=*/true);
}
