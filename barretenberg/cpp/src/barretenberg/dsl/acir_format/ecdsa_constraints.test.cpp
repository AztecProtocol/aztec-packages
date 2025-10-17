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

    enum class PredicateTestCase : uint8_t { ConstantTrue, ConstantFalse, WitnessTrue, WitnessFalse };

    enum class WitnessOverrideCase : uint8_t {
        None,
        R,
        ZeroS,
        HighS,
        HashedMessage,
        P,
    };

    struct Predicate {
        PredicateTestCase test_case;
        WitnessOverrideCase witness_override;
        bool tamper_signature;
    };

    static size_t update_constraints_based_on_witness(EcdsaConstraint& ecdsa_constraints,
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
            witness_values[ecdsa_constraints.predicate.index] = bb::fr(0);
            switch (mode.witness_override) {
            case WitnessOverrideCase::R:
                for (size_t idx = 0; idx < 32; idx++) {
                    witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
                };
                break;
            case WitnessOverrideCase::ZeroS:
                for (size_t idx = 32; idx < 64; idx++) {
                    witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
                };
                break;
            case WitnessOverrideCase::HighS:
                for (size_t idx = 32; idx < 64; idx++) {
                    witness_values[ecdsa_constraints.signature[idx]] = bb::fr(15);
                };
                break;
            case WitnessOverrideCase::HashedMessage:
                for (size_t idx = 32; idx < 64; idx++) {
                    witness_values[ecdsa_constraints.signature[idx]] = bb::fr(15);
                };
                break;
            case WitnessOverrideCase::P:
                witness_values[ecdsa_constraints.pub_x_indices[0]] += bb::fr(1);
                break;
            case WitnessOverrideCase::None:
            default:
                // Do nothing
                break;
            }
        }

        if (mode.tamper_signature) {
            witness_values[ecdsa_constraints.signature[31]] = bb::fr(0);
            witness_values[ecdsa_constraints.result] = bb::fr(0);
        }

        return witness_values.size();
    }

    /**
     * @brief Generate valid ECDSA constraint with witness predicate equal to true
     */
    static void generate_ecdsa_constraint(EcdsaConstraint& ecdsa_constraint,
                                          WitnessVector& witness_values,
                                          bool tweak_pub_key_x = false,
                                          bool tweak_pub_key_y = false)
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
        if (tweak_pub_key_x || tweak_pub_key_y) {
            std::vector<uint8_t> modulus_plus_one = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                                                      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
                                                      0xff, 0xff, 0xff, 0xff, 0xff, 0xfe, 0xff, 0xff, 0xfc, 0x30 };
            for (auto [byte, tweaked_byte] : zip_view(tweak_pub_key_x ? buffer_x : buffer_y, modulus_plus_one)) {
                byte = tweaked_byte;
            }
        }

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

    static std::pair<AcirFormat, WitnessVector> generate_constraint_system(const Predicate& mode,
                                                                           bool tweak_pub_key_x = false,
                                                                           bool tweak_pub_key_y = false)
    {
        EcdsaConstraint ecdsa_constraint;
        WitnessVector witness_values;
        generate_ecdsa_constraint(ecdsa_constraint, witness_values, tweak_pub_key_x, tweak_pub_key_y);
        size_t num_variables = update_constraints_based_on_witness(ecdsa_constraint, witness_values, mode);
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
                                          .witness_override = TestFixture::WitnessOverrideCase::None,
                                          .tamper_signature = false };
    Predicate predicate_witness_true = { .test_case = TestFixture::PredicateTestCase::WitnessTrue,
                                         .witness_override = TestFixture::WitnessOverrideCase::None,
                                         .tamper_signature = false };
    Predicate predicate_witness_false = { .test_case = TestFixture::PredicateTestCase::WitnessFalse,
                                          .witness_override = TestFixture::WitnessOverrideCase::None,
                                          .tamper_signature = false };
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

// // Validate the predicate for EcdsaConstraint
// TYPED_TEST(EcdsaConstraintsTest, EcdsaPredicate)
// {
//     using Builder = TestFixture::Builder;
//     auto [constraint_system, witness_values] = TestFixture::generate_constraint_system();
//     constraint_system.varnum += 1;

//     // Create a predicate witness or constant which takes the index of the last witness in the array
//     auto predicate = WitnessOrConstant<fr>::from_index(static_cast<uint32_t>(witness_values.size()));

//     witness_values.push_back(fr(1));
//     if (constraint_system.ecdsa_k1_constraints.size() == 1) {
//         constraint_system.ecdsa_k1_constraints[0].predicate = predicate;
//     } else if (constraint_system.ecdsa_r1_constraints.size() == 1) {
//         constraint_system.ecdsa_r1_constraints[0].predicate = predicate;
//     }

//     // Correct input AND true predicate => Valid Circuit
//     witness_values[witness_values.size() - 2] = fr(0);
//     witness_values.back() = fr(0);
//     {
//         AcirProgram program{ constraint_system, witness_values };
//         auto builder = create_circuit<Builder>(program);

//         info("Num gates: ", builder.get_estimated_num_finalized_gates());

//         // Validate the builder
//         EXPECT_TRUE(CircuitChecker::check(builder));
//         EXPECT_FALSE(builder.failed());
//     }
//     // // Correct input AND false predicate => Valid Circuit
//     // witness_values.back() = fr(0);
//     // {
//     //     AcirProgram program{ constraint_system, witness_values };
//     //     auto builder = create_circuit<Builder>(program);

//     //     info("Num gates: ", builder.get_estimated_num_finalized_gates());

//     //     // Validate the builder
//     //     EXPECT_TRUE(CircuitChecker::check(builder));
//     // }
//     // // Incorrect input AND false predicate => Valid Circuit
//     // witness_values[40] = fr(0); // change a byte in the signature
//     // {
//     //     AcirProgram program{ constraint_system, witness_values };
//     //     auto builder = create_circuit<Builder>(program);

//     //     info("Num gates: ", builder.get_estimated_num_finalized_gates());

//     //     // Validate the builder
//     //     EXPECT_TRUE(CircuitChecker::check(builder));
//     // }
//     // // Incorrect input AND true predicate => Invalid Circuit
//     // witness_values.back() = fr(1);
//     // {
//     //     AcirProgram program{ constraint_system, witness_values };
//     //     auto builder = create_circuit<Builder>(program);

//     //     info("Num gates: ", builder.get_estimated_num_finalized_gates());

//     //     EXPECT_TRUE(builder.failed());
//     // }
// }

// TYPED_TEST(EcdsaConstraintsTest, NonUniquePubKey)
// {
//     // Disable asserts otherwise the test fails because the public keys are not on the curve
//     BB_DISABLE_ASSERTS();

//     for (size_t idx = 0; idx < 2; idx++) {
//         bool tweak_x = idx == 0;
//         bool tweak_y = idx == 1;
//         std::string failure_msg =
//             idx == 0
//                 ? "ECDSA input validation: the x coordinate of the public key is larger than Fq::modulus: hi limb."
//                 : "ECDSA input validation: the y coordinate of the public key is larger than Fq::modulus: hi limb.";

//         using Builder = TestFixture::Builder;

//         auto [constraint_system, witness_values] =
//             TestFixture::generate_constraint_system(/*tweak_pub_key_x=*/tweak_x, /*tweak_pub_key_y=*/tweak_y);

//         AcirProgram program{ constraint_system, witness_values };
//         auto builder = create_circuit<Builder>(program);

//         // Validate the builder
//         EXPECT_FALSE(CircuitChecker::check(builder));

//         // Check error message
//         EXPECT_EQ(builder.err(), failure_msg);
//     }
// }
