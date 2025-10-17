#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
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

template <class Curve> class EcdsaConstraintsTest : public ::testing::Test {
  public:
    using Builder = Curve::Builder;
    using FrNative = Curve::fr;
    using FqNative = Curve::fq;
    using G1Native = Curve::g1;
    using Flavor = std::conditional_t<std::is_same_v<Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;

    // Reproducible test
    static constexpr FrNative private_key =
        FrNative("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");

    enum class TamperingMode : uint8_t {
        None,
        TamperSignature,
        NonUniquePubKeyX,
        NonUniquePubKeyY,
    };

    enum class PredicateTestCase : uint8_t { ConstantTrue, ConstantFalse, WitnessTrue, WitnessFalse };

    struct WitnessOverride {
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

    struct Predicate {
        PredicateTestCase test_case;
        WitnessOverride::Case witness_override;
    };

    static void override_false_witness(EcdsaConstraint& ecdsa_constraints,
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

    static size_t update_witness_based_on_predicate(EcdsaConstraint& ecdsa_constraints,
                                                    WitnessVector& witness_values,
                                                    const Predicate& mode)
    {
        switch (mode.test_case) {
        case PredicateTestCase::ConstantTrue:
            ecdsa_constraints.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(1));
            witness_values.pop_back();
            break;
        case PredicateTestCase::ConstantFalse:
            ecdsa_constraints.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(0));
            witness_values.pop_back();
            break;
        case PredicateTestCase::WitnessTrue:
            break;
        case PredicateTestCase::WitnessFalse:
            override_false_witness(ecdsa_constraints, witness_values, mode.witness_override);
        }

        return witness_values.size();
    }

    static void tamper_with_signature(EcdsaConstraint& ecdsa_constraints,
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
    static void generate_ecdsa_constraint(EcdsaConstraint& ecdsa_constraint, WitnessVector& witness_values)
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

        ecdsa_constraint = EcdsaConstraint{ .hashed_message = hashed_message_indices,
                                            .signature = signature_indices,
                                            .pub_x_indices = pub_x_indices,
                                            .pub_y_indices = pub_y_indices,
                                            .predicate = WitnessOrConstant<bb::fr>::from_index(predicate_index),
                                            .result = result_index };
    }

    static std::pair<AcirFormat, WitnessVector> generate_constraint_system(const Predicate& mode)
    {
        EcdsaConstraint ecdsa_constraint;
        WitnessVector witness_values;
        generate_ecdsa_constraint(ecdsa_constraint, witness_values);
        size_t num_variables = update_witness_based_on_predicate(ecdsa_constraint, witness_values, mode);

        AcirFormat constraint_system = {
            .varnum = static_cast<uint32_t>(num_variables),
            .num_acir_opcodes = 1,
            .public_inputs = {},
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };

        if constexpr (Curve::type == bb::CurveType::SECP256K1) {
            constraint_system.ecdsa_k1_constraints = { ecdsa_constraint };
        } else {
            constraint_system.ecdsa_r1_constraints = { ecdsa_constraint };
        }

        mock_opcode_indices(constraint_system);

        return { constraint_system, witness_values };
    }

    static std::tuple<bool, bool, std::string> test(const PredicateTestCase& test_case,
                                                    const WitnessOverride::Case& witness_override,
                                                    const TamperingMode& tampering_mode)
    {
        Predicate predicate = { .test_case = test_case, .witness_override = witness_override };
        auto [constraint_system, witness_values] = generate_constraint_system(predicate);

        if constexpr (Curve::type == bb::CurveType::SECP256K1) {
            tamper_with_signature(constraint_system.ecdsa_k1_constraints[0], witness_values, tampering_mode);
        } else {
            tamper_with_signature(constraint_system.ecdsa_r1_constraints[0], witness_values, tampering_mode);
        }

        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program);

        return { CircuitChecker::check(builder), builder.failed(), builder.err() };
    }

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
    using Flavor = TestFixture::Flavor;
    using Builder = TestFixture::Builder;
    using ProvingKey = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using Predicate = TestFixture::Predicate;

    Predicate predicate_constant_true = { .test_case = TestFixture::PredicateTestCase::ConstantTrue,
                                          .witness_override = TestFixture::WitnessOverride::Case::None };
    Predicate predicate_witness_true = { .test_case = TestFixture::PredicateTestCase::WitnessTrue,
                                         .witness_override = TestFixture::WitnessOverride::Case::None };
    Predicate predicate_witness_false = { .test_case = TestFixture::PredicateTestCase::WitnessFalse,
                                          .witness_override = TestFixture::WitnessOverride::Case::None };
    std::vector<Predicate> predicates = { predicate_constant_true, predicate_witness_true, predicate_witness_false };
    std::vector<std::string> predicate_labels{ "Constant True", "Witness True", "Witness False" };
    for (auto [predicate, label] : zip_view(predicates, predicate_labels)) {
        auto [constraint_system, witness_values] = TestFixture::generate_constraint_system(predicate);

        std::shared_ptr<VerificationKey> vk_from_witness;
        {
            AcirProgram program{ constraint_system, witness_values };
            auto builder = create_circuit<Builder>(program);
            info("Num gates: ", builder.get_estimated_num_finalized_gates());

            auto prover_instance = std::make_shared<ProvingKey>(builder);
            vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

            // Validate the builder
            EXPECT_TRUE(CircuitChecker::check(builder));
        }

        std::shared_ptr<VerificationKey> vk_from_constraint;
        {
            AcirProgram program{ constraint_system, /*witness=*/{} };
            auto builder = create_circuit<Builder>(program);
            auto prover_instance = std::make_shared<ProvingKey>(builder);
            vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        }

        EXPECT_EQ(*vk_from_witness, *vk_from_constraint) << "Mismatch in the vks for the case " << label;
    }
}

TYPED_TEST(EcdsaConstraintsTest, ConstantTrue)
{
    BB_DISABLE_ASSERTS();
    // Constant true, no tampering
    {
        auto [circuit_checker_result, builder_failed, _] =
            TestFixture::test(TestFixture::PredicateTestCase::ConstantTrue,
                              TestFixture::WitnessOverride::Case::None,
                              TestFixture::TamperingMode::None);
        EXPECT_TRUE(circuit_checker_result);
        EXPECT_FALSE(builder_failed);
    }

    // Constant true, tampering
    {
        auto [circuit_checker_result, builder_failed, _] =
            TestFixture::test(TestFixture::PredicateTestCase::ConstantTrue,
                              TestFixture::WitnessOverride::Case::None,
                              TestFixture::TamperingMode::TamperSignature);
        EXPECT_FALSE(circuit_checker_result);
        EXPECT_TRUE(builder_failed);
    }
}

TYPED_TEST(EcdsaConstraintsTest, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    // Witness true, no tampering
    {
        auto [circuit_checker_result, builder_failed, _] =
            TestFixture::test(TestFixture::PredicateTestCase::WitnessTrue,
                              TestFixture::WitnessOverride::Case::None,
                              TestFixture::TamperingMode::None);
        EXPECT_TRUE(circuit_checker_result);
        EXPECT_FALSE(builder_failed);
    }

    // Witness true, tampering
    {
        auto [circuit_checker_result, builder_failed, _] =
            TestFixture::test(TestFixture::PredicateTestCase::WitnessTrue,
                              TestFixture::WitnessOverride::Case::None,
                              TestFixture::TamperingMode::TamperSignature);
        EXPECT_FALSE(circuit_checker_result);
        EXPECT_TRUE(builder_failed);
    }
}

TYPED_TEST(EcdsaConstraintsTest, WitnessFalse)
{
    using WitnessOverride = TestFixture::WitnessOverride;
    using TamperingMode = TestFixture::TamperingMode;

    BB_DISABLE_ASSERTS();
    for (auto [override_case, override_label] : zip_view(WitnessOverride::get_all(), WitnessOverride::get_labels())) {
        auto tampering_mode =
            override_case == WitnessOverride::Case::None ? TamperingMode::TamperSignature : TamperingMode::None;
        auto [circuit_checker_result, builder_failed, _] =
            TestFixture::test(TestFixture::PredicateTestCase::WitnessFalse, override_case, tampering_mode);

        EXPECT_TRUE(circuit_checker_result) << "Check builder failed for override case " << override_label;
        EXPECT_FALSE(builder_failed) << "Builder failed for override case " << override_label;
    }
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

        auto [circuit_checker_result, builder_failed, builder_error_msg] = TestFixture::test(
            TestFixture::PredicateTestCase::ConstantTrue, TestFixture::WitnessOverride::Case::None, tampering_mode);

        EXPECT_FALSE(circuit_checker_result);
        EXPECT_TRUE(builder_failed);
        EXPECT_EQ(builder_error_msg, failure_msg);
    }
}
