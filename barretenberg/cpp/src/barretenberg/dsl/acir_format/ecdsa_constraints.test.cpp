#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "acir_format.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <algorithm>
#include <gtest/gtest.h>
#include <memory>
#include <vector>

using namespace bb;
using namespace bb::crypto;
using namespace acir_format;

template <class Curve> class EcdsaTestingFunctions {
  public:
    using Builder = Curve::Builder;
    using FrNative = Curve::ScalarFieldNative;
    using FqNative = Curve::BaseFieldNative;
    using G1Native = Curve::GroupNative;
    using AcirConstraint = EcdsaConstraint;

    struct InvalidWitness {
      public:
        enum class Target : uint8_t {
            None,
            HashIsNotAByteArray, // Set one element of the hash > 255
            ZeroR,               // Set R=0 (tests ECDSA validation)
            ZeroS,               // Set S=0 (tests ECDSA validation)
            HighS,               // Set S=high (tests malleability protection)
            P,                   // Make public key fail the curve equation
            Result               // Invalid signature with claimed valid result
        };

        static std::vector<Target> get_all()
        {
            return { Target::None,  Target::HashIsNotAByteArray, Target::ZeroR, Target::ZeroS, Target::HighS, Target::P,
                     Target::Result };
        }

        static std::vector<std::string> get_labels()
        {
            return { "None",   "Hash is not a byte array", "Zero R", "Zero S",
                     "High S", "Public key not on curve",  "Result" };
        }
    };

    // Reproducible test
    static constexpr FrNative private_key =
        FrNative("0xd67abee717b3fc725adf59e2cc8cd916435c348b277dd814a34e3ceb279436c2");

    static ProgramMetadata generate_metadata() { return ProgramMetadata{}; }

    static std::pair<AcirConstraint, WitnessVector> generate_invalid_verification_result_constraints(
        const InvalidWitness::Target& invalid_witness_target)
    {
        AcirConstraint ecdsa_constraint;
        WitnessVector witness_values;
        generate_constraints(ecdsa_constraint, witness_values);

        auto [invalid_constraint, invalid_witness_values] =
            invalidate_witness(ecdsa_constraint, witness_values, invalid_witness_target);

        invalid_witness_values[invalid_constraint.result] = bb::fr(0);
        return { invalid_constraint, invalid_witness_values };
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint ecdsa_constraints,
        WitnessVector witness_values,
        const InvalidWitness::Target& invalid_witness_target)
    {

        // The ECDSA verification algorithm never makes the circuit fail, it just returns a boolean bearing witness to
        // whether the verification succeeded or not. The only exception is HashIsNotAByteArray, in which case the
        // byte_array constructors raises an error. To ensure that the failure mode caught by the test is specific to
        // the particular case being tested, not just simple verification failure, we set the verification result to
        // false for HashIsNotAByteArray and to true for every other case.
        if (invalid_witness_target == InvalidWitness::Target::HashIsNotAByteArray) {
            witness_values[ecdsa_constraints.result] = bb::fr(0);
        }

        switch (invalid_witness_target) {
        case InvalidWitness::Target::HashIsNotAByteArray:
            // Set all bytes of hash to 256 (invalid as it doesn't fit in one byte)
            for (size_t idx = 0; idx < 32; idx++) {
                witness_values[ecdsa_constraints.hashed_message[idx]] = bb::fr(256);
            };
            break;
        case InvalidWitness::Target::ZeroR:
            // Set r = 0 (invalid ECDSA signature component)
            for (size_t idx = 0; idx < 32; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
            };
            break;
        case InvalidWitness::Target::ZeroS:
            // Set s = 0 (tests ECDSA validation: s must be non-zero)
            for (size_t idx = 32; idx < 64; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(0);
            };
            break;
        case InvalidWitness::Target::HighS:
            // Set s = high value (tests signature malleability protection)
            for (size_t idx = 32; idx < 64; idx++) {
                witness_values[ecdsa_constraints.signature[idx]] = bb::fr(255);
            };
            break;
        case InvalidWitness::Target::P:
            // Invalidate public key so signature verification returns false.
            witness_values[ecdsa_constraints.pub_x_indices[0]] += bb::fr(1);
            break;
        case InvalidWitness::Target::Result:
            // Test enforcement of verification result: tamper signature but claim it's valid
            witness_values[ecdsa_constraints.signature[31]] = bb::fr(0);
            break;
        case InvalidWitness::Target::None:
            break;
        }

        return { ecdsa_constraints, witness_values };
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
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(hashed_message));

        std::array<uint32_t, 32> pub_x_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_x));

        std::array<uint32_t, 32> pub_y_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(buffer_y));

        std::array<uint32_t, 32> r_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(signature.r));

        std::array<uint32_t, 32> s_indices =
            add_to_witness_and_track_indices<std::span<uint8_t>, 32>(witness_values, std::span(signature.s));

        uint32_t result_index = add_to_witness_and_track_indices(witness_values, bb::fr(1));

        uint32_t predicate_index = add_to_witness_and_track_indices(witness_values, bb::fr(1));

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

template <typename Flavor> bool construct_and_verify_honk_proof(typename Flavor::CircuitBuilder& builder)
{
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, DefaultIO>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);

    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    Verifier verifier(vk_and_hash);
    return verifier.verify_proof(proof).result;
}

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
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessTrue)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::Result);
}

TYPED_TEST(EcdsaConstraintsTest, WitnessFalse)
{
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false();
}

TYPED_TEST(EcdsaConstraintsTest, WitnessFalseSlow)
{
    // This test is equal to WitnessFalse but also checks that each configuration would have failed if the
    // predicate were witness true. It can be useful for debugging.
    BB_DISABLE_ASSERTS();
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(EcdsaConstraintsTest, InvalidWitnesses)
{
    BB_DISABLE_ASSERTS();
    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_invalid_witnesses();
}

TYPED_TEST(EcdsaConstraintsTest, InvalidVerificationInputsReturnFalseAndProve)
{
    BB_DISABLE_ASSERTS();
    using Builder = typename TypeParam::Builder;
    using Flavor = std::conditional_t<std::is_same_v<Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    using InvalidWitnessTarget = typename TestFixture::InvalidWitnessTarget;

    const std::vector<InvalidWitnessTarget> invalid_targets = {
        InvalidWitnessTarget::ZeroR,
        InvalidWitnessTarget::ZeroS,
        InvalidWitnessTarget::P,
    };
    const std::vector<std::string> target_labels = { "zero r", "zero s", "public key not on curve" };

    for (auto [invalid_target, target_label] : zip_view(invalid_targets, target_labels)) {
        SCOPED_TRACE(target_label);

        auto [constraint, witness_values] =
            TestFixture::Base::generate_invalid_verification_result_constraints(invalid_target);
        ASSERT_EQ(witness_values[constraint.result], bb::fr(0));

        AcirFormat constraint_system = constraint_to_acir_format(constraint);
        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program, TestFixture::Base::generate_metadata());

        EXPECT_TRUE(CircuitChecker::check(builder));
        EXPECT_FALSE(builder.failed()) << builder.err();
        EXPECT_TRUE(construct_and_verify_honk_proof<Flavor>(builder));
    }
}
