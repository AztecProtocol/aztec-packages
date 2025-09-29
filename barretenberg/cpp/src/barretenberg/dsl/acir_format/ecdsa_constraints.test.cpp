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

    static size_t generate_ecdsa_constraint(EcdsaConstraint& ecdsa_constraint,
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
        size_t num_variables = 0;

        std::array<uint32_t, 32> hashed_message_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(hashed_message));
        num_variables += hashed_message_indices.size();

        std::array<uint32_t, 32> pub_x_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(buffer_x));
        num_variables += pub_x_indices.size();

        std::array<uint32_t, 32> pub_y_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(buffer_y));
        num_variables += pub_y_indices.size();

        std::array<uint32_t, 32> r_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(signature.r));
        num_variables += r_indices.size();

        std::array<uint32_t, 32> s_indices =
            add_to_witness_and_track_indices<uint8_t, 32>(witness_values, std::span(signature.s));
        num_variables += s_indices.size();

        uint32_t result_index = static_cast<uint32_t>(num_variables);
        bb::fr result = bb::fr::one();
        witness_values.emplace_back(result);
        num_variables += 1;

        // Restructure vectors into array
        std::array<uint32_t, 64> signature_indices;
        std::ranges::copy(r_indices, signature_indices.begin());
        std::ranges::copy(s_indices, signature_indices.begin() + 32);

        ecdsa_constraint = EcdsaConstraint{ .hashed_message = hashed_message_indices,
                                            .signature = signature_indices,
                                            .pub_x_indices = pub_x_indices,
                                            .pub_y_indices = pub_y_indices,
                                            .predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr::one()),
                                            .result = result_index };

        return num_variables;
    }

    static std::pair<AcirFormat, WitnessVector> generate_constraint_system(bool tweak_pub_key_x = false,
                                                                           bool tweak_pub_key_y = false)
    {
        EcdsaConstraint ecdsa_constraint;
        WitnessVector witness_values;
        size_t num_variables =
            generate_ecdsa_constraint(ecdsa_constraint, witness_values, tweak_pub_key_x, tweak_pub_key_y);
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

using CurveTypes = testing::Types<stdlib::secp256k1<MegaCircuitBuilder>,
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

    auto [constraint_system, witness_values] = TestFixture::generate_constraint_system();

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

    EXPECT_EQ(*vk_from_witness, *vk_from_constraint);
}

TYPED_TEST(EcdsaConstraintsTest, NonUniquePubKey)
{
    // Disable asserts otherwise the test fails because the public keys are not on the curve
    BB_DISABLE_ASSERTS();

    for (size_t idx = 0; idx < 2; idx++) {
        bool tweak_x = idx == 0;
        bool tweak_y = idx == 1;
        std::string failure_msg =
            idx == 0
                ? "ECDSA input validation: the x coordinate of the public key is larger than Fq::modulus: hi limb."
                : "ECDSA input validation: the y coordinate of the public key is larger than Fq::modulus: hi limb.";

        using Builder = TestFixture::Builder;

        auto [constraint_system, witness_values] =
            TestFixture::generate_constraint_system(/*tweak_pub_key_x=*/tweak_x, /*tweak_pub_key_y=*/tweak_y);

        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program);

        // Validate the builder
        EXPECT_FALSE(CircuitChecker::check(builder));

        // Check error message
        EXPECT_EQ(builder.err(), failure_msg);
    }
}
