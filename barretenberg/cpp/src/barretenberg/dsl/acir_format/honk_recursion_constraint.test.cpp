#include "honk_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "proof_surgeon.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

template <typename RecursiveFlavor> class AcirHonkRecursionConstraint : public ::testing::Test {

  public:
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerProver = bb::UltraProver_<InnerFlavor>;
    using InnerVerificationKey = typename InnerFlavor::VerificationKey;
    using InnerDeciderVerificationKey = DeciderVerificationKey_<InnerFlavor>;
    using InnerVerifier = bb::UltraVerifier_<InnerFlavor>;
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor =
        std::conditional_t<IsMegaBuilder<OuterBuilder>,
                           MegaFlavor,
                           std::conditional_t<HasIPAAccumulator<InnerFlavor>, UltraRollupFlavor, UltraFlavor>>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;
    using OuterProver = bb::UltraProver_<OuterFlavor>;
    using OuterVerificationKey = typename OuterFlavor::VerificationKey;
    using OuterDeciderVerificationKey = DeciderVerificationKey_<OuterFlavor>;
    using OuterVerifier = bb::UltraVerifier_<OuterFlavor>;

    InnerBuilder create_inner_circuit()
    {
        /**
         * constraints produced by Noir program:
         * fn main(x : u32, y : pub u32) {
         * let z = x ^ y;
         *
         * constrain z != 10;
         * }
         **/
        RangeConstraint range_a{
            .witness = 0,
            .num_bits = 32,
        };
        RangeConstraint range_b{
            .witness = 1,
            .num_bits = 32,
        };

        LogicConstraint logic_constraint{
            .a = WitnessOrConstant<bb::fr>::from_index(0),
            .b = WitnessOrConstant<bb::fr>::from_index(1),
            .result = 2,
            .num_bits = 32,
            .is_xor_gate = 1,
        };
        poly_triple expr_a{
            .a = 2,
            .b = 3,
            .c = 0,
            .q_m = 0,
            .q_l = 1,
            .q_r = -1,
            .q_o = 0,
            .q_c = -10,
        };
        poly_triple expr_b{
            .a = 3,
            .b = 4,
            .c = 5,
            .q_m = 1,
            .q_l = 0,
            .q_r = 0,
            .q_o = -1,
            .q_c = 0,
        };
        poly_triple expr_c{
            .a = 3,
            .b = 5,
            .c = 3,
            .q_m = 1,
            .q_l = 0,
            .q_r = 0,
            .q_o = -1,
            .q_c = 0,

        };
        poly_triple expr_d{
            .a = 5,
            .b = 0,
            .c = 0,
            .q_m = 0,
            .q_l = -1,
            .q_r = 0,
            .q_o = 0,
            .q_c = 1,
        };

        AcirFormat constraint_system{
            .varnum = 6,
            .num_acir_opcodes = 7,
            .public_inputs = { 1, 2 },
            .logic_constraints = { logic_constraint },
            .range_constraints = { range_a, range_b },
            .aes128_constraints = {},
            .sha256_compression = {},

            .ecdsa_k1_constraints = {},
            .ecdsa_r1_constraints = {},
            .blake2s_constraints = {},
            .blake3_constraints = {},
            .keccak_permutations = {},
            .poseidon2_constraints = {},
            .multi_scalar_mul_constraints = {},
            .ec_add_constraints = {},
            .recursion_constraints = {},
            .honk_recursion_constraints = {},
            .avm_recursion_constraints = {},
            .ivc_recursion_constraints = {},
            .bigint_from_le_bytes_constraints = {},
            .bigint_to_le_bytes_constraints = {},
            .bigint_operations = {},
            .assert_equalities = {},
            .poly_triple_constraints = { expr_a, expr_b, expr_c, expr_d },
            .quad_constraints = {},
            .big_quad_constraints = {},
            .block_constraints = {},
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };
        mock_opcode_indices(constraint_system);

        uint256_t inverse_of_five = fr(5).invert();
        WitnessVector witness{
            5, 10, 15, 5, inverse_of_five, 1,
        };
        uint32_t honk_recursion = 0;
        if constexpr (IsAnyOf<InnerFlavor, UltraFlavor, UltraZKFlavor>) {
            honk_recursion = 1;
        } else if constexpr (IsAnyOf<InnerFlavor, UltraRollupFlavor>) {
            honk_recursion = 2;
        }
        auto builder = create_circuit(
            constraint_system, /*recursive*/ true, /*size_hint*/ 0, witness, /*honk recursion*/ honk_recursion);
        return builder;
    }

    /**
     * @brief Create a circuit that recursively verifies one or more circuits
     * @details This function is parametized by BuilderType because we want to use this function to produce
     * Ultra/UltraRollup circuits sometimes and also Mega circuits other times.
     * @tparam BuilderType
     * @param inner_circuits
     * @return Composer
     */
    template <typename BuilderType>
    BuilderType create_outer_circuit(std::vector<InnerBuilder>& inner_circuits, bool dummy_witnesses = false)
    {
        std::vector<RecursionConstraint> honk_recursion_constraints;

        SlabVector<fr> witness;

        for (auto& inner_circuit : inner_circuits) {

            auto proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
            auto verification_key = std::make_shared<InnerVerificationKey>(proving_key->proving_key);
            auto decider_vk = std::make_shared<InnerDeciderVerificationKey>(verification_key);
            InnerProver prover(proving_key, verification_key);
            InnerVerifier verifier(decider_vk);
            auto inner_proof = prover.construct_proof();

            std::vector<bb::fr> key_witnesses = verification_key->to_field_elements();
            std::vector<fr> proof_witnesses = inner_proof;
            size_t num_public_inputs_to_extract = inner_circuit.get_public_inputs().size() - bb::PAIRING_POINTS_SIZE;
            acir_format::PROOF_TYPE proof_type = acir_format::HONK;
            if constexpr (HasIPAAccumulator<InnerFlavor>) {
                num_public_inputs_to_extract -= IPA_CLAIM_SIZE;
                proof_type = ROLLUP_HONK;
            } else if constexpr (InnerFlavor::HasZK) {
                proof_type = HONK_ZK;
            }

            auto [key_indices, proof_indices, inner_public_inputs] = ProofSurgeon::populate_recursion_witness_data(
                witness, proof_witnesses, key_witnesses, num_public_inputs_to_extract);

            RecursionConstraint honk_recursion_constraint{
                .key = key_indices,
                .proof = proof_indices,
                .public_inputs = inner_public_inputs,
                .key_hash = 0, // not used
                .proof_type = proof_type,
            };
            honk_recursion_constraints.push_back(honk_recursion_constraint);
        }

        AcirFormat constraint_system{};
        constraint_system.varnum = static_cast<uint32_t>(witness.size());
        constraint_system.num_acir_opcodes = static_cast<uint32_t>(honk_recursion_constraints.size());
        constraint_system.honk_recursion_constraints = honk_recursion_constraints;
        constraint_system.original_opcode_indices = create_empty_original_opcode_indices();

        mock_opcode_indices(constraint_system);
        uint32_t honk_recursion = 0;
        if constexpr (IsAnyOf<InnerFlavor, UltraFlavor, UltraZKFlavor>) {
            honk_recursion = 1;
        } else if constexpr (IsAnyOf<InnerFlavor, UltraRollupFlavor>) {
            honk_recursion = 2;
        }
        ProgramMetadata metadata{ .honk_recursion = honk_recursion };
        if (dummy_witnesses) {
            witness = {}; // set it all to 0
        }
        AcirProgram program{ constraint_system, witness };
        BuilderType outer_circuit = create_circuit<BuilderType>(program, metadata);

        return outer_circuit;
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using Flavors = testing::Types<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraZKRecursiveFlavor_<MegaCircuitBuilder>>;

TYPED_TEST_SUITE(AcirHonkRecursionConstraint, Flavors);

TYPED_TEST(AcirHonkRecursionConstraint, TestHonkRecursionConstraintVKGeneration)
{
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    auto layer_2_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits);

    auto layer_2_circuit_with_dummy_witnesses =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits,
                                                                                       /*dummy_witnesses=*/true);

    auto proving_key = std::make_shared<typename TestFixture::OuterDeciderProvingKey>(layer_2_circuit);
    auto verification_key = std::make_shared<typename TestFixture::OuterVerificationKey>(proving_key->proving_key);

    auto proving_key_dummy =
        std::make_shared<typename TestFixture::OuterDeciderProvingKey>(layer_2_circuit_with_dummy_witnesses);
    auto verification_key_dummy =
        std::make_shared<typename TestFixture::OuterVerificationKey>(proving_key_dummy->proving_key);

    // Compare the two vks
    EXPECT_EQ(*verification_key_dummy, *verification_key);
}

TYPED_TEST(AcirHonkRecursionConstraint, TestBasicSingleHonkRecursionConstraint)
{
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    auto layer_2_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits);

    info("estimate finalized circuit gates = ", layer_2_circuit.get_estimated_num_finalized_gates());

    auto proving_key = std::make_shared<typename TestFixture::OuterDeciderProvingKey>(layer_2_circuit);
    auto verification_key = std::make_shared<typename TestFixture::OuterVerificationKey>(proving_key->proving_key);
    auto decider_vk = std::make_shared<typename TestFixture::OuterDeciderVerificationKey>(verification_key);
    typename TestFixture::OuterProver prover(proving_key, verification_key);
    info("prover gates = ", proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();

    if constexpr (HasIPAAccumulator<TypeParam>) {
        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
        typename TestFixture::OuterVerifier verifier(decider_vk, ipa_verification_key);
        EXPECT_EQ(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof), true);
    } else {
        typename TestFixture::OuterVerifier verifier(decider_vk);
        EXPECT_EQ(verifier.verify_proof(proof), true);
    }
}

TYPED_TEST(AcirHonkRecursionConstraint, TestBasicDoubleHonkRecursionConstraints)
{
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    auto layer_2_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits);

    info("circuit gates = ", layer_2_circuit.get_estimated_num_finalized_gates());

    auto proving_key = std::make_shared<typename TestFixture::OuterDeciderProvingKey>(layer_2_circuit);
    auto verification_key = std::make_shared<typename TestFixture::OuterVerificationKey>(proving_key->proving_key);
    auto decider_vk = std::make_shared<typename TestFixture::OuterDeciderVerificationKey>(verification_key);
    typename TestFixture::OuterProver prover(proving_key, verification_key);
    info("prover gates = ", proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();
    if constexpr (HasIPAAccumulator<TypeParam>) {
        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
        typename TestFixture::OuterVerifier verifier(decider_vk, ipa_verification_key);
        EXPECT_EQ(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof), true);
    } else {
        typename TestFixture::OuterVerifier verifier(decider_vk);
        EXPECT_EQ(verifier.verify_proof(proof), true);
    }
}

TYPED_TEST(AcirHonkRecursionConstraint, TestOneOuterRecursiveCircuit)
{
    /**
     * We want to test the following:
     * 1. circuit that verifies a proof of another circuit
     * 2. the above, but the inner circuit contains a recursive proof output that we have to aggregate
     * 3. the above, but the outer circuit verifies 2 proofs, the aggregation outputs from the 2 proofs (+ the
     recursive
     * proof output from 2) are aggregated together
     *
     * A = basic circuit
     * B = circuit that verifies proof of A
     * C = circuit that verifies proof of B and a proof of A
     *
     * Layer 1 = proof of A
     * Layer 2 = verifies proof of A and proof of B
     * Layer 3 = verifies proof of C
     *
     * Attempt at a visual graphic
     * ===========================
     *
     *     C
     *     ^
     *     |
     *     | - B
     *     ^   ^
     *     |   |
     *     |    -A
     *     |
     *      - A
     *
     * ===========================
     *
     * Final aggregation object contains aggregated proofs for 2 instances of A and 1 instance of B
     */
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());
    info("created first inner circuit");

    std::vector<typename TestFixture::InnerBuilder> layer_2_circuits;
    layer_2_circuits.push_back(TestFixture::create_inner_circuit());
    info("created second inner circuit");

    layer_2_circuits.push_back(
        TestFixture::template create_outer_circuit<typename TestFixture::InnerBuilder>(layer_1_circuits));
    info("created first outer circuit");

    auto layer_3_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_2_circuits);
    info("created second outer circuit");
    info("number of gates in layer 3 = ", layer_3_circuit.get_estimated_num_finalized_gates());

    auto proving_key = std::make_shared<typename TestFixture::OuterDeciderProvingKey>(layer_3_circuit);
    auto verification_key = std::make_shared<typename TestFixture::OuterVerificationKey>(proving_key->proving_key);
    auto decider_vk = std::make_shared<typename TestFixture::OuterDeciderVerificationKey>(verification_key);
    typename TestFixture::OuterProver prover(proving_key, verification_key);
    info("prover gates = ", proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();
    if constexpr (HasIPAAccumulator<TypeParam>) {
        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
        typename TestFixture::OuterVerifier verifier(decider_vk, ipa_verification_key);
        EXPECT_EQ(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof), true);
    } else {
        typename TestFixture::OuterVerifier verifier(decider_vk);
        EXPECT_EQ(verifier.verify_proof(proof), true);
    }
}

/**
 * @brief Similar to previous test but one extra node in tree of recursion.
 * @details Layer 1 is two separate circuits, layer 2 is two circuits, each which verify one circuit of layer 1. The
 * layer 3 circuit verifies both circuits of layer 2.
 *
 * ===========================
 *
 *       C
 *       ^
 *       |
 *     B - B
 *     ^   ^
 *     |   |
 *     A   A
 *
 * ===========================
 */
TYPED_TEST(AcirHonkRecursionConstraint, TestFullRecursiveComposition)
{
    std::vector<typename TestFixture::InnerBuilder> layer_b_1_circuits;
    layer_b_1_circuits.push_back(TestFixture::create_inner_circuit());
    info("created first inner circuit");

    std::vector<typename TestFixture::InnerBuilder> layer_b_2_circuits;
    layer_b_2_circuits.push_back(TestFixture::create_inner_circuit());
    info("created second inner circuit");

    std::vector<Builder> layer_2_circuits;
    layer_2_circuits.push_back(
        TestFixture::template create_outer_circuit<typename TestFixture::InnerBuilder>(layer_b_1_circuits));
    info("created first outer circuit");

    layer_2_circuits.push_back(
        TestFixture::template create_outer_circuit<typename TestFixture::InnerBuilder>(layer_b_2_circuits));
    info("created second outer circuit");

    auto layer_3_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_2_circuits);
    info("created third outer circuit");
    info("number of gates in layer 3 circuit = ", layer_3_circuit.get_estimated_num_finalized_gates());

    auto proving_key = std::make_shared<typename TestFixture::OuterDeciderProvingKey>(layer_3_circuit);
    auto verification_key = std::make_shared<typename TestFixture::OuterVerificationKey>(proving_key->proving_key);
    auto decider_vk = std::make_shared<typename TestFixture::OuterDeciderVerificationKey>(verification_key);
    typename TestFixture::OuterProver prover(proving_key, verification_key);
    info("prover gates = ", proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();
    if constexpr (HasIPAAccumulator<TypeParam>) {
        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
        typename TestFixture::OuterVerifier verifier(decider_vk, ipa_verification_key);
        EXPECT_EQ(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof), true);
    } else {
        typename TestFixture::OuterVerifier verifier(decider_vk);
        EXPECT_EQ(verifier.verify_proof(proof), true);
    }
}
