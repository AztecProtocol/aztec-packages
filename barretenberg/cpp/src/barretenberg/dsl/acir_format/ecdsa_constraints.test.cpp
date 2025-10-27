#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"

#include <algorithm>
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace bb::crypto;
using namespace acir_format;

template <class Curve> class EcdsaTestingFunctions {
  public:
    using Builder = Curve::Builder;
    using FrNative = Curve::fr;
    using FqNative = Curve::fq;
    using G1Native = Curve::g1;
    using AcirConstraint = EcdsaConstraint;

    struct Tampering {
      public:
        enum class Mode : uint8_t {
            None,
            TamperR,
        };

        static std::vector<Mode> get_all() { return { Mode::None, Mode::TamperR }; }

        static std::vector<std::string> get_labels() { return { "None", "Tamper R" }; }
    };

    struct WitnessOverride {
      public:
        enum class Case : uint8_t { None, R, ZeroS, HighS, P, Result };

        static std::vector<Case> get_all()
        {
            return { Case::None, Case::R, Case::ZeroS, Case::HighS, Case::P, Case::Result };
        }

        static std::vector<std::string> get_labels()
        {
            return { "None", "R", "Zero S", "High S", "Public key", "Result" };
        }
    };

    // Reproducible test
    static constexpr FrNative private_key =
        FrNative("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");

    static void override_witness(EcdsaConstraint& ecdsa_constraints,
                                 WitnessVector& witness_values,
                                 const WitnessOverride::Case& witness_override)
    {
        witness_values[ecdsa_constraints.result] = bb::fr(0);
        switch (witness_override) {
        case WitnessOverride::Case::R:
            for (size_t idx = 0; idx < 32; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
            };
            break;
        case WitnessOverride::Case::ZeroS:
            for (size_t idx = 32; idx < 64; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
            };
            break;
        case WitnessOverride::Case::HighS:
            for (size_t idx = 32; idx < 64; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(255);
            };
            break;
        case WitnessOverride::Case::P:
            witness_values[ecdsa_constraints.pub_x_indices[0]] += bb::fr(1);
            break;
        case WitnessOverride::Case::Result:
            // Tamper with the signature so that signature verification fails
            witness_values[ecdsa_constraints.signature[31]] = bb::fr(0);
            // Set signature result to true
            witness_values[ecdsa_constraints.result] = bb::fr(1);
            break;
        case WitnessOverride::Case::None:
            break;
        }
    }

    static void tampering(EcdsaConstraint& ecdsa_constraints,
                          WitnessVector& witness_values,
                          const Tampering::Mode& tampering_mode)
    {
        switch (tampering_mode) {
        case (Tampering::Mode::None):
            break;
        case (Tampering::Mode::TamperR):
            // Set r = 0
            for (size_t idx = 0; idx < 32; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
            };
            break;
        }
    }

    /**
     * @brief Generate valid ECDSA constraint with witness predicate equal to true
     */
    static void generate_constraints(EcdsaConstraint& ecdsa_constraint, WitnessVector& witness_values)
    {
        std::string message_string = "Instructions unclear, ask again later.";

        // Hash the message
        std::vector<uint8_t> message_buffer(message_string.begin(), message_string.end());
        std::array<uint8_t, 32> hashed_message = Sha256Hasher::hash(message_buffer);

        // Generate ECDSA key pair
        ecdsa_key_pair<FrNative, G1Native> account;
        account.private_key = private_key;
        account.public_key = G1Native::one * account.private_key;

        // Generate signature
        ecdsa_signature signature =
            ecdsa_construct_signature<Sha256Hasher, FqNative, FrNative, G1Native>(message_string, account);

        // Serialize public key coordinates into bytes
        std::array<uint8_t, 32> buffer_x;
        std::array<uint8_t, 32> buffer_y;
        FqNative::serialize_to_buffer(account.public_key.x, &buffer_x[0]);
        FqNative::serialize_to_buffer(account.public_key.y, &buffer_y[0]);

        // Create witness indices and witnesses
        std::array<uint32_t, 32> hashed_message_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(hashed_message));

        std::array<uint32_t, 32> pub_x_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(buffer_x));

        std::array<uint32_t, 32> pub_y_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(buffer_y));

        std::array<uint32_t, 32> r_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(signature.r));

        std::array<uint32_t, 32> s_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(signature.s));

        uint32_t result_index = static_cast<uint32_t>(witness_values.size());
        bb::fr result = bb::fr::one();
        witness_values.emplace_back(result);

        uint32_t predicate_index = static_cast<uint32_t>(witness_values.size());
        bb::fr predicate = bb::fr::one();
        witness_values.emplace_back(predicate);

        // Restructure vectors into array
        std::array<uint32_t, 64> signature_indices;
        std::ranges::copy(r_indices, signature_indices.begin());
        std::ranges::copy(s_indices, signature_indices.begin() + 32);

        ecdsa_constraint = EcdsaConstraint{ .type = Curve::type,
                                            .hashed_message = hashed_message_indices,
                                            .signature = signature_indices,
                                            .pub_x_indices = pub_x_indices,
                                            .pub_y_indices = pub_y_indices,
                                            .predicate = WitnessOrConstant<bb::fr>::from_index(predicate_index),
                                            .result = result_index };
    }
};

template <class Curve>
class EcdsaConstraintsTest : public ::testing::Test, public TestClassWithPredicate<EcdsaTestingFunctions<Curve>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using CurveTypes = testing::Types<stdlib::secp256k1<UltraCircuitBuilder>,
                                  stdlib::secp256r1<UltraCircuitBuilder>,
                                  stdlib::secp256k1<MegaCircuitBuilder>,
                                  stdlib::secp256r1<MegaCircuitBuilder>>;

TYPED_TEST_SUITE(EcdsaConstraintsTest, CurveTypes);

TYPED_TEST(EcdsaConstraintsTest, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(EcdsaConstraintsTest, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_constant_true(TestFixture::TamperingMode::TamperR);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::TamperingMode::TamperR);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessFalse)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false(TestFixture::TamperingMode::TamperR);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessFalseSlow)
{
    // This test is equal to WitnessFalse but also checks that each configuration would have failed if the
    // predicate were witness true. It can be useful for debugging.
    GTEST_SKIP();
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow(TestFixture::TamperingMode::TamperR);
}

TYPED_TEST(EcdsaConstraintsTest, Tampering)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}
