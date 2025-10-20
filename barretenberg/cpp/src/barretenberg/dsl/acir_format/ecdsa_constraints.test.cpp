#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/dsl/acir_format/test_template.hpp"
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
    using Flavor = std::conditional_t<std::is_same_v<Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;

    using AcirConstraint = EcdsaConstraint;

    enum class TamperingMode : uint8_t {
        None,
        TamperSignature,
        NonUniquePubKeyX,
        NonUniquePubKeyY,
    };

    struct WitnessOverride {
      public:
        enum class Case : uint8_t { None, R, ZeroS, HighS, HashedMessage, P };

        static std::vector<Case> get_all()
        {
            return { Case::None, Case::R, Case::ZeroS, Case::HighS, Case::HashedMessage, Case::P };
        }

        static std::vector<std::string> get_labels()
        {
            return { "None", "R", "Zero S", "High S", "Hashed message", "Public key" };
        }
    };

    // Reproducible test
    static constexpr FrNative private_key =
        FrNative("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");

    static void override_witness(EcdsaConstraint& ecdsa_constraints,
                                 WitnessVector& witness_values,
                                 const WitnessOverride::Case& witness_override)
    {
        witness_values[ecdsa_constraints.predicate.index] = bb::fr(0);
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
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(15);
            };
            break;
        case WitnessOverride::Case::HashedMessage:
            for (size_t idx = 32; idx < 64; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(15);
            };
            break;
        case WitnessOverride::Case::P:
            witness_values[ecdsa_constraints.pub_x_indices[0]] += bb::fr(1);
            break;
        case WitnessOverride::Case::None:
        default:
            // Do nothing
            break;
        }
    }

    static void tampering(EcdsaConstraint& ecdsa_constraints,
                          WitnessVector& witness_values,
                          const TamperingMode& tampering_mode)
    {
        switch (tampering_mode) {
        case (TamperingMode::None):
            break;
        case (TamperingMode::TamperSignature):
            witness_values[ecdsa_constraints.signature[31]] = bb::fr(0);
            witness_values[ecdsa_constraints.result] = bb::fr(0);
        case (TamperingMode::NonUniquePubKeyX): {
            std::vector<uint8_t> modulus_plus_one = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                                                      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                                                      0xff, 0xff, 0xff, 0xff, 0xff, 0xfe, 0xff, 0xff, 0xfc, 0x30 };
            for (auto [byte_idx, tweaked_byte] : zip_view(ecdsa_constraints.pub_x_indices, modulus_plus_one)) {
                witness_values[byte_idx] = tweaked_byte;
            }
        }
        case (TamperingMode::NonUniquePubKeyY): {
            std::vector<uint8_t> modulus_plus_one = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                                                      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                                                      0xff, 0xff, 0xff, 0xff, 0xff, 0xfe, 0xff, 0xff, 0xfc, 0x30 };
            for (auto [byte_idx, tweaked_byte] : zip_view(ecdsa_constraints.pub_y_indices, modulus_plus_one)) {
                witness_values[byte_idx] = tweaked_byte;
            }
        }
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

template <class Curve> class EcdsaConstraintsTest : public ::testing::Test {
  public:
    using WrappedTestClass = TestClassWithPredicate<EcdsaTestingFunctions<Curve>>;
    using WitnessOverride = WrappedTestClass::WitnessOverride;
    using WitnessOverrideCase = WrappedTestClass::WitnessOverrideCase;
    using TamperingMode = WrappedTestClass::TamperingMode;

    static std::tuple<bool, bool, std::string> test(const PredicateTestCase& test_case,
                                                    const WitnessOverrideCase& witness_override,
                                                    const TamperingMode& tampering_mode)
    {
        return WrappedTestClass::test_predicate_constraints(test_case, witness_override, tampering_mode);
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using CurveTypes = testing::Types<stdlib::secp256k1<UltraCircuitBuilder>,
                                  stdlib::secp256r1<UltraCircuitBuilder>,
                                  stdlib::secp256k1<MegaCircuitBuilder>,
                                  stdlib::secp256r1<MegaCircuitBuilder>>;

TYPED_TEST_SUITE(EcdsaConstraintsTest, CurveTypes);

// TYPED_TEST(EcdsaConstraintsTest, GenerateVKFromConstraints)
// {
//     using Flavor = TestFixture::Flavor;
//     using Builder = TestFixture::Builder;
//     using ProvingKey = ProverInstance_<Flavor>;
//     using VerificationKey = Flavor::VerificationKey;
//     using Predicate = TestFixture::Predicate;

//     Predicate predicate_constant_true = { .test_case = PredicateTestCase::ConstantTrue,
//                                           .witness_override = TestFixture::WitnessOverrideCase::None };
//     Predicate predicate_witness_true = { .test_case = PredicateTestCase::WitnessTrue,
//                                          .witness_override = TestFixture::WitnessOverrideCase::None };
//     Predicate predicate_witness_false = { .test_case = PredicateTestCase::WitnessFalse,
//                                           .witness_override = TestFixture::WitnessOverrideCase::None };
//     std::vector<Predicate> predicates = { predicate_constant_true, predicate_witness_true, predicate_witness_false };
//     std::vector<std::string> predicate_labels{ "Constant True", "Witness True", "Witness False" };

//     for (auto [predicate, label] : zip_view(predicates, predicate_labels)) {
//         auto [constraint_system, witness_values] = generate_constraint_system(predicate.test_case,
//                                                                               predicate.witness_override,
//                                                                               TestFixture::TamperingMode::None,
//                                                                               TestFixture::generate_ecdsa_constraint,
//                                                                               TestFixture::override_false_witness,
//                                                                               TestFixture::tampering);

//         std::shared_ptr<VerificationKey> vk_from_witness;
//         {
//             AcirProgram program{ constraint_system, witness_values };
//             auto builder = create_circuit<Builder>(program);
//             info("Num gates: ", builder.get_estimated_num_finalized_gates());

//             auto prover_instance = std::make_shared<ProvingKey>(builder);
//             vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

//             // Validate the builder
//             EXPECT_TRUE(CircuitChecker::check(builder));
//         }

//         std::shared_ptr<VerificationKey> vk_from_constraint;
//         {
//             AcirProgram program{ constraint_system, /*witness=*/{} };
//             auto builder = create_circuit<Builder>(program);
//             auto prover_instance = std::make_shared<ProvingKey>(builder);
//             vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
//         }

//         EXPECT_EQ(*vk_from_witness, *vk_from_constraint) << "Mismatch in the vks for the case " << label;
//     }
// }

TYPED_TEST(EcdsaConstraintsTest, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::WrappedTestClass::test_constant_true(TestFixture::TamperingMode::TamperSignature);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::WrappedTestClass::test_witness_true(TestFixture::TamperingMode::TamperSignature);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessFalse)
{
    using TamperingMode = TestFixture::TamperingMode;

    BB_DISABLE_ASSERTS();
    TestFixture::WrappedTestClass::test_witness_false(TamperingMode::TamperSignature);
}

TYPED_TEST(EcdsaConstraintsTest, NonUniquePubKey)
{
    BB_DISABLE_ASSERTS();
    using TamperingMode = TestFixture::TamperingMode;

    for (size_t idx = 0; idx < 2; idx++) {
        TamperingMode tampering_mode = idx == 0 ? TamperingMode::NonUniquePubKeyX : TamperingMode::NonUniquePubKeyY;
        std::string failure_msg =
            idx == 0
                ? "ECDSA input validation: the x coordinate of the public key is larger than Fq::modulus: hi limb."
                : "ECDSA input validation: the y coordinate of the public key is larger than Fq::modulus: hi limb.";

        auto [circuit_checker_result, builder_failed, builder_error_msg] =
            TestFixture::test(PredicateTestCase::ConstantTrue, TestFixture::WitnessOverrideCase::None, tampering_mode);

        EXPECT_FALSE(circuit_checker_result);
        EXPECT_TRUE(builder_failed);
        EXPECT_EQ(builder_error_msg, failure_msg);
    }
}
