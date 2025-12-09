#include "honk_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/test_class_predicate.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "proof_surgeon.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

/**
 * These functions are used to generate the constraints for testing Honk recursive verification.
 *
 * We wish to test the following scenarios:
 * 1. Vanilla recursion
 * 2. Rollup circuits: Merge/Base (2 recursive verifications), Root (2 recursive verifications + full IPA)
 * 3. Recursive verification of non recursive circuit and recursive circuit
 *
 * We make the testing framework slighly more general to accomodate more cases, should we wish to test them. The
 * template parameters depict the following scenarios: write (s_1, .., s_N) for the array in the template
 * 0. s_1 <= s_2 <= .. <= s_N; instantiate an empty array (F_1, .., F_{s_1})
 * 1. Generate A_1, .., A_{s_1} circuits and set F_i := A_i
 * 2. (For s_2, .., s_N) Generate B_1, .., B_{s_i} circuits where B_i recursively verifies A_i, i <= s_i, and set
 *.   F_i = B_i for i <= s_i
 * 3. Construct a circuit that recursively verifies (F_1, .., F_{s_1}) and prove it using Flavor
 *
 * All the circuits F_1, .., F_{s_1} are constructed using the same builder and same flavor. This flavor, called
 * InnerFlavor, determines which data should be propagated (PairingPoints, IPA claims). The circuit that verifies F_1,
 * .., F_{s_N} is constructed using the builder determined by OuterFlavor, which also determines what data should be
 * propagated and what data should be finalized (full IPA verification or simple IPA aggregation).
 *
 * NOTE: The InnerFlavor and OuterFlavor must be consistent: if InnerFlavor has the IPA data, then the outer flavor must
 * either propagate this data, or verify it. To ensure that the data is correctly propagated/verified, we generate the
 * ProgramMetadata and the proof type of the recursion constraints at the top layer according to InnerFlavor and
 * OuterFlavor.
 *
 */
template <typename InnerFlavor_, typename OuterFlavor_, size_t N_, std::array<size_t, N_> LayerSizes_>
class HonkRecursionTestParams {
  public:
    using InnerFlavor = InnerFlavor_;
    using OuterFlavor = OuterFlavor_;
    static constexpr size_t N = N_;
    static constexpr std::array<size_t, N> LayerSizes = LayerSizes_;
};

template <typename InnerFlavor, typename OuterFlavor, size_t N, std::array<size_t, N> LayerSizes>
class HonkRecursionConstraintTestingFunctions {
  public:
    // Check that the array in the template parameter is in increasing order
    static_assert([]() {
        for (size_t idx = 0; idx < N - 1; idx++) {
            if (LayerSizes[idx + 1] > LayerSizes[idx]) {
                return false;
            }
        }

        return true;
    });

    using InnerBuilder = InnerFlavor::CircuitBuilder;
    using InnerIO = std::conditional_t<HasIPAAccumulator<InnerFlavor>,
                                       bb::stdlib::recursion::honk::RollupIO,
                                       bb::stdlib::recursion::honk::DefaultIO<InnerBuilder>>;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerVerificationKey = InnerFlavor::VerificationKey;
    using InnerProver = UltraProver_<InnerFlavor>;

    // Determine the proof type of the "inner" circuits, i.e., the ones up to the level below the top. The proof type is
    // determined by the flavor with which we prove the circuits.
    static constexpr uint32_t InnerProofType = []() {
        if constexpr (HasIPAAccumulator<InnerFlavor>) {
            return ROLLUP_HONK;
        } else if constexpr (InnerFlavor::HasZK) {
            return HONK_ZK;
        }

        return HONK;
    }();

    // Determine the proof type of the circuits at the top level. This proof type determines which data is propagated
    // and which is finalized: if the proof type is ROOT_ROLLUP_HONK then IPA data is verified, otherwise it is
    // propagated. PairingPoints are always propagated.
    static constexpr uint32_t TopLevelProofType = []() {
        if constexpr (HasIPAAccumulator<InnerFlavor> && !HasIPAAccumulator<OuterFlavor>) {
            return ROOT_ROLLUP_HONK;
        } else if constexpr (HasIPAAccumulator<InnerFlavor>) {
            return ROLLUP_HONK;
        } else if constexpr (InnerFlavor::HasZK) {
            return HONK_ZK;
        }

        return HONK;
    }();

    static constexpr bool IS_VANILLA_RECURSION = N == 1 && LayerSizes[0] == 1;
    using AcirConstraint =
        std::conditional_t<IS_VANILLA_RECURSION, RecursionConstraint, std::vector<RecursionConstraint>>;
    using Builder = OuterFlavor::CircuitBuilder;

    struct InvalidWitness {
      public:
        enum class Target : uint8_t { None, VKHash, VK, Proof };

        static std::vector<Target> get_all() { return { Target::None, Target::VKHash, Target::VK, Target::Proof }; }

        static std::vector<std::string> get_labels() { return { "None", "VKHash", "VK", "Proof" }; }
    };

    /**
     * @brief Create a dummy circuit
     *
     * @return InnerBuilder
     */
    static InnerBuilder create_inner_circuit()
    {
        InnerBuilder builder;

        MockCircuits::add_arithmetic_gates(builder);
        MockCircuits::add_lookup_gates(builder);

        InnerIO::add_default(builder);

        return builder;
    }

    /**
     * @brief Merge a series of recursion constraints by offsetting the relevant indices and concatenating the witness
     * vectors
     *
     * @param constraints The constraints to be merged
     * @param witness_vectors The witness vectors corresponding to each constraint
     * @param witness_values The final witness vector where all the witness values are stored
     * @return AcirConstraint
     */
    static AcirConstraint merge_recursion_constraints(std::vector<RecursionConstraint>& constraints,
                                                      std::vector<WitnessVector>& witness_vectors,
                                                      WitnessVector& witness_values)
    {
        // Lambda to offset the recursion constraint by the current size of the witness vector
        auto offset_recursion_constraint = [](RecursionConstraint& honk_recursion_constraint, const size_t offset) {
            auto shift_by_offset = [&offset](std::vector<uint32_t>& indices) {
                for (auto& witness_idx : indices) {
                    witness_idx += offset;
                }
            };

            shift_by_offset(honk_recursion_constraint.key);
            shift_by_offset(honk_recursion_constraint.proof);
            shift_by_offset(honk_recursion_constraint.public_inputs);
            honk_recursion_constraint.key_hash += offset;
            honk_recursion_constraint.predicate.index += offset;
        };

        for (auto [constraint, witnesses] : zip_view(constraints, witness_vectors)) {
            offset_recursion_constraint(constraint, witness_values.size());
            constraint.proof_type = TopLevelProofType;
            witness_values.insert(witness_values.end(), witnesses.begin(), witnesses.end());
        }

        if constexpr (IS_VANILLA_RECURSION) {
            return constraints[0];
        } else {
            return constraints;
        }
    }

    /**
     * @brief Convert a circuit into a recursion constraint: prove the circuit and add the proof, the vk and its hash to
     * a witness vector.
     *
     */
    static std::pair<RecursionConstraint, WitnessVector> circuit_to_recursion_constraint(InnerBuilder& builder)
    {
        auto prover_instance = std::make_shared<InnerProverInstance>(builder);
        auto verification_key = std::make_shared<InnerVerificationKey>(prover_instance->get_precomputed());

        InnerProver prover(prover_instance, verification_key);
        auto proof = prover.construct_proof();

        WitnessVector witness_values;
        RecursionConstraint recursion_constraint =
            recursion_data_to_recursion_constraint(witness_values,
                                                   proof,
                                                   verification_key->to_field_elements(),
                                                   verification_key->hash(),
                                                   bb::fr::one(),
                                                   builder.num_public_inputs() - InnerIO::PUBLIC_INPUTS_SIZE,
                                                   InnerProofType);

        return { recursion_constraint, witness_values };
    }

    /**
     * @brief Generate the metadata for the circuit recursively verifying the top layer circuits
     *
     */
    static ProgramMetadata generate_metadata()
    {
        return ProgramMetadata{ .has_ipa_claim = HasIPAAccumulator<OuterFlavor> };
    }

    static void invalidate_witness([[maybe_unused]] AcirConstraint& honk_recursion_constraints,
                                   [[maybe_unused]] WitnessVector& witness_values,
                                   const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::VKHash: {
            // Invalidate the circuit by modifying the vk hash
            if constexpr (IS_VANILLA_RECURSION) {
                witness_values[honk_recursion_constraints.key_hash] += fr::one();
            } else {
                witness_values[honk_recursion_constraints[0].key_hash] += fr::one();
            }
            break;
        }
        case InvalidWitness::Target::VK: {
            // Invalidate the circuit by modifying the first element of the vk (log circuit size)
            std::vector<uint32_t> vk_indices;
            if constexpr (IS_VANILLA_RECURSION) {
                witness_values[honk_recursion_constraints.key[0]] += fr::one();
            } else {
                witness_values[honk_recursion_constraints[0].key[0]] += fr::one();
            }
            break;
        }
        case InvalidWitness::Target::Proof: {
            // Invalidate the circuit by modifying the last element of the proof, which is a group element (KZG
            // commitment)
            std::vector<uint32_t> proof_indices;
            if constexpr (IS_VANILLA_RECURSION) {
                proof_indices = honk_recursion_constraints.proof;
            } else {
                proof_indices = honk_recursion_constraints[0].proof;
            }
            size_t commitment_size = FrCodec::template calc_num_fields<typename OuterFlavor::Commitment>();
            std::vector<bb::fr> mock_proof_element = FrCodec::serialize_to_fields(OuterFlavor::Commitment::one());
            for (size_t idx = 0; idx < commitment_size; idx++) {
                witness_values[proof_indices[InnerIO::PUBLIC_INPUTS_SIZE + idx]] = mock_proof_element[idx];
            }
            break;
        }
        }
    }

    static void generate_constraints(AcirConstraint& honk_recursion_constraint, WitnessVector& witness_values)
    {
        std::vector<RecursionConstraint> constraints;
        std::vector<WitnessVector> witness_vectors;

        for (size_t layer_idx = 0; layer_idx < N; layer_idx++) {
            size_t current_layer_size = LayerSizes[layer_idx];
            for (size_t idx = 0; idx < current_layer_size; idx++) {
                if (layer_idx == 0) {
                    // If we are at the bottom layer, we create the circuit and then create the recursion constraint
                    // that verify the circuit
                    auto [constraint, witnesses] = []() {
                        InnerBuilder builder = create_inner_circuit();
                        return circuit_to_recursion_constraint(builder);
                    }();
                    constraints.emplace_back(std::move(constraint));
                    witness_vectors.emplace_back(std::move(witnesses));
                } else {
                    // If we are in a layer above the bottom one, we take the recursion constraints at index idx and
                    // build a circuit the recursively verifies these recursion constraints
                    RecursionConstraint recursion_constraint = constraints[idx];
                    WitnessVector witnesses = witness_vectors[idx];

                    AcirFormat acir_format{
                        .max_witness_index = static_cast<uint32_t>(witnesses.size() - 1),
                        .num_acir_opcodes = 1,
                        .honk_recursion_constraints = { recursion_constraint },
                        .original_opcode_indices =
                            AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0 } },
                    };

                    AcirProgram acir_program{ .constraints = acir_format, .witness = witnesses };
                    ProgramMetadata metadata{ .has_ipa_claim = HasIPAAccumulator<InnerFlavor> };

                    std::tie(constraints[idx], witness_vectors[idx]) = [&]() {
                        auto builder = create_circuit<InnerBuilder>(acir_program, metadata);
                        return circuit_to_recursion_constraint(builder);
                    }();
                }
            }
        }

        // Merge the constraints by offsetting the relevant indices and concatenating the witness vectors
        honk_recursion_constraint = merge_recursion_constraints(constraints, witness_vectors, witness_values);
    }
};

template <typename Params>
class HonkRecursionTestWithPredicate
    : public ::testing::Test,
      public TestClassWithPredicate<HonkRecursionConstraintTestingFunctions<typename Params::InnerFlavor,
                                                                            typename Params::OuterFlavor,
                                                                            Params::N,
                                                                            Params::LayerSizes>> {
  public:
    using InnerFlavor = Params::InnerFlavor;
    using OuterFlavor = Params::OuterFlavor;

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// We test the predicate with vanilla recursion. This is enough as the predicate logic is a standalone component,
// there's no inter-constraint interaction due to the existence or the value of the predicate.
using HonkRecursionTypesWithPredicate =
    testing::Types<HonkRecursionTestParams<UltraFlavor, UltraFlavor, 1, { 1 }>,
                   HonkRecursionTestParams<UltraZKFlavor, UltraFlavor, 1, { 1 }>,
                   HonkRecursionTestParams<UltraRollupFlavor, UltraRollupFlavor, 1, { 1 }>,
                   HonkRecursionTestParams<UltraFlavor, MegaFlavor, 1, { 1 }>>;

TYPED_TEST_SUITE(HonkRecursionTestWithPredicate, HonkRecursionTypesWithPredicate);

TYPED_TEST(HonkRecursionTestWithPredicate, GenerateVKFromConstraints)
{
    TestFixture::template test_vk_independence<typename TypeParam::OuterFlavor>();
}

TYPED_TEST(HonkRecursionTestWithPredicate, ConstantTrue)
{
    TestFixture::test_constant_true(TestFixture::InvalidWitnessTarget::VKHash);
}

TYPED_TEST(HonkRecursionTestWithPredicate, WitnessTrue)
{
    TestFixture::test_witness_true(TestFixture::InvalidWitnessTarget::VKHash);
}

TYPED_TEST(HonkRecursionTestWithPredicate, WitnessFalseSlow)
{
    TestFixture::test_witness_false_slow();
}

TYPED_TEST(HonkRecursionTestWithPredicate, GateCountSingleHonkRecursion)
{
    using InnerFlavor = TestFixture::InnerFlavor;
    using OuterFlavor = TestFixture::OuterFlavor;
    using Builder = TestFixture::Builder;
    using InvalidWitnessTarget = TestFixture::InvalidWitnessTarget;

    for (const auto predicate_mode : Predicate<InvalidWitnessTarget>::get_all()) {
        Predicate<InvalidWitnessTarget> predicate{ .test_case = predicate_mode,
                                                   .invalid_witness = InvalidWitnessTarget::None };
        auto [constraint, witness_values] = TestFixture::generate_constraints(predicate);

        AcirFormat constraint_system = constraint_to_acir_format(
            constraint, /*max_witness_index=*/static_cast<uint32_t>(witness_values.size()) - 1);

        AcirProgram program{ constraint_system, witness_values };
        ProgramMetadata metadata = TestFixture::Base::generate_metadata();
        metadata.collect_gates_per_opcode = true;
        auto builder = create_circuit<Builder>(program, metadata);

        // Verify the gate count was recorded
        EXPECT_EQ(program.constraints.gates_per_opcode.size(), 1);

        // Get expected values from shared constants based on predicate mode
        auto [EXPECTED_GATE_COUNT, EXPECTED_ECC_ROWS, EXPECTED_ULTRA_OPS] =
            HONK_RECURSION_CONSTANTS<InnerFlavor, OuterFlavor>(predicate_mode);

        // Assert gate count
        EXPECT_EQ(program.constraints.gates_per_opcode[0], EXPECTED_GATE_COUNT);

        // For MegaBuilder, also assert ECC row count and ultra ops count
        if constexpr (IsMegaBuilder<Builder>) {
            size_t actual_ecc_rows = builder.op_queue->get_num_rows();
            EXPECT_EQ(actual_ecc_rows, EXPECTED_ECC_ROWS);
            size_t actual_ultra_ops = builder.op_queue->get_current_subtable_size();
            EXPECT_EQ(actual_ultra_ops, EXPECTED_ULTRA_OPS);
        }
    }
}

template <typename Params>
class HonkRecursionTestWithoutPredicate
    : public ::testing::Test,
      public TestClass<HonkRecursionConstraintTestingFunctions<typename Params::InnerFlavor,
                                                               typename Params::OuterFlavor,
                                                               Params::N,
                                                               Params::LayerSizes>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using HonkRecursionTypesWithoutPredicate =
    testing::Types<HonkRecursionTestParams<UltraFlavor, UltraFlavor, 1, { 2 }>,             // Merge circuit
                   HonkRecursionTestParams<UltraZKFlavor, UltraFlavor, 1, { 2 }>,           // Merge circuit
                   HonkRecursionTestParams<UltraRollupFlavor, UltraRollupFlavor, 1, { 2 }>, // Merge circuit
                   HonkRecursionTestParams<UltraRollupFlavor, UltraZKFlavor, 1, { 2 }>,     // Root circuit
                   HonkRecursionTestParams<UltraFlavor, MegaFlavor, 1, { 2 }>,              // Merge circuit
                   HonkRecursionTestParams<UltraZKFlavor, UltraFlavor, 2, { 2, 1 }>, // Double recursion on one side
                   HonkRecursionTestParams<UltraZKFlavor, MegaFlavor, 2, { 2, 2 }>,  // Merge two circuits that
                                                                                     // recursively verify two
                                                                                     // circuits
                   HonkRecursionTestParams<UltraZKFlavor, MegaFlavor, 4, { 4, 3, 1, 1 }>>; // Random complex flow

TYPED_TEST_SUITE(HonkRecursionTestWithoutPredicate, HonkRecursionTypesWithoutPredicate);

TYPED_TEST(HonkRecursionTestWithoutPredicate, GenerateVKFromConstraints)
{
    if constexpr (HasIPAAccumulator<typename TypeParam::InnerFlavor> &&
                  !HasIPAAccumulator<typename TypeParam::OuterFlavor>) {
        // We need to skip this case because the root rollup case takes too much time.
        GTEST_SKIP();
    }

    TestFixture::template test_vk_independence<typename TypeParam::OuterFlavor>();
}

TYPED_TEST(HonkRecursionTestWithoutPredicate, Tampering)
{
    if constexpr (HasIPAAccumulator<typename TypeParam::InnerFlavor> &&
                  !HasIPAAccumulator<typename TypeParam::OuterFlavor>) {
        // We need to skip this case because the root rollup case takes too much time.
        GTEST_SKIP();
    }

    [[maybe_unused]] std::vector<std::string> _ = TestFixture::test_tampering();
}
