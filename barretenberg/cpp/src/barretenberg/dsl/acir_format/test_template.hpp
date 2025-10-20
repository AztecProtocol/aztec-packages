// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Add a constraint element to the appropriate vector in AcirFormat
 * @details Uses constexpr if to determine the correct vector based on constraint type
 * @tparam ConstraintType The type of constraint to add
 * @param acir_format The AcirFormat object to add the constraint to
 * @param constraint The constraint to add
 */
template <typename ConstraintType>
void add_constraint_to_acir_format(AcirFormat& acir_format, const ConstraintType& constraint)
{
    if constexpr (std::is_same_v<ConstraintType, LogicConstraint>) {
        acir_format.logic_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, RangeConstraint>) {
        acir_format.range_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, AES128Constraint>) {
        acir_format.aes128_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, Sha256Compression>) {
        acir_format.sha256_compression.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, EcdsaConstraint>) {
        if (constraint.type == bb::CurveType::SECP256K1) {
            acir_format.ecdsa_k1_constraints.push_back(constraint);
        } else {
            acir_format.ecdsa_r1_constraints.push_back(constraint);
        }
    } else if constexpr (std::is_same_v<ConstraintType, Blake2sConstraint>) {
        acir_format.blake2s_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, Blake3Constraint>) {
        acir_format.blake3_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, Keccakf1600>) {
        acir_format.keccak_permutations.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, Poseidon2Constraint>) {
        acir_format.poseidon2_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, MultiScalarMul>) {
        acir_format.multi_scalar_mul_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, EcAdd>) {
        acir_format.ec_add_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, RecursionConstraint>) {
        // Note: RecursionConstraint can go into multiple vectors (honk, avm, pg, civc)
        // Default to honk_recursion_constraints, but caller should specify which one if needed
        acir_format.honk_recursion_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, BlockConstraint>) {
        acir_format.block_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, AcirFormat::PolyTripleConstraint>) {
        acir_format.poly_triple_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, bb::mul_quad_<bb::curve::BN254::ScalarField>>) {
        acir_format.quad_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, std::vector<bb::mul_quad_<bb::curve::BN254::ScalarField>>>) {
        acir_format.big_quad_constraints.push_back(constraint);
    } else {
        throw_or_abort("Unsupported constraint type");
    }
}

// Base must implement generate_valid_constraints
// Base must implement generate_constraints
template <typename Base> class TestClass {
    using Flavor = Base::Flavor;
    using Builder = Base::Builder;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    static void test_vk_independence()
    {
        auto [constraints, witness_values] = Base::generate_valid_constraints();
        AcirFormat constraint_system = {
            .varnum = static_cast<uint32_t>(witness_values.size()),
            .num_acir_opcodes = 1,
            .public_inputs = {},
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };
        add_constraint_to_acir_format__(constraint_system, constraints);
        mock_opcode_indices(constraint_system);

        std::shared_ptr<VerificationKey> vk_from_witness;
        {
            AcirProgram program{ constraint_system, witness_values };
            auto builder = create_circuit<Builder>(program);
            info("Num gates: ", builder.get_estimated_num_finalized_gates());

            auto prover_instance = std::make_shared<ProverInstance>(builder);
            vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

            // Validate the builder
            ASSERT(CircuitChecker::check(builder));
        }

        std::shared_ptr<VerificationKey> vk_from_constraint;
        {
            AcirProgram program{ constraint_system, /*witness=*/{} };
            auto builder = create_circuit<Builder>(program);
            auto prover_instance = std::make_shared<ProverInstance>(builder);
            vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        }

        BB_ASSERT_EQ(*vk_from_witness, *vk_from_constraint, "Mismatch in the vks");
    }
};

enum class PredicateTestCase : uint8_t { ConstantTrue, ConstantFalse, WitnessTrue, WitnessFalse };

template <typename WitnessOverrideCase> struct Predicate {
    PredicateTestCase test_case;
    WitnessOverrideCase witness_override;
};

/**
 * @brief Concept defining the requirements for the Base template parameter of TestClassWithPredicate
 *
 * @details Base must provide:
 * - A enum class TamperingMode, which specifies how to tamper with the witness values so to make the constraints
 * unsatisfied.
 * - A struct WitnessOverride, which specifies how to override witness values so to test cases that would generate
 *   unsatisfied constraints, but that should pass if the predicate is a witness holding the value false.
 *   WitnessOverride must specify an enum class Case, which details which witness value should be overridden, and two
 *   functions get_all() and get_labels() to iterate over all the possible override cases.
 * - Type aliase: Builder and AcirConstraint, specifying the Builder and constraint we are working with.
 * - Static methods: override_witness (to override the witness values based on the WitnessOverride case),
 *   generate_constraints (to generate valid constraints with predicate set to witness true), tampering (to tamper with
 *   the witness values to produce unsatisfied constraints).
 */
template <typename T>
concept TestBaseWithPredicate = requires {
    // Required type aliases
    typename T::Builder;
    typename T::WitnessOverride;
    typename T::WitnessOverride::Case;
    typename T::AcirConstraint;
    typename T::TamperingMode;

    // Ensure WitnessOverride::Case and TamperingMode are enums
    requires std::is_enum_v<typename T::WitnessOverride::Case>;
    requires std::is_enum_v<typename T::TamperingMode>;

    // Ensure that WitnessOverride::Case has a None value
    { T::WitnessOverride::Case::None };

    // WitnessOverride must provide static methods for test iteration
    { T::WitnessOverride::get_all() } -> std::same_as<std::vector<typename T::WitnessOverride::Case>>;
    { T::WitnessOverride::get_labels() } -> std::same_as<std::vector<std::string>>;

    // Required static constraint manipulation methods
    requires requires(typename T::AcirConstraint& constraint,
                      WitnessVector& witness_values,
                      const typename T::WitnessOverride::Case& witness_override,
                      const typename T::TamperingMode& tampering_mode) {
        /**
         * @brief Override the witness values based on the override case
         *
         * @details This function is used when the predicate is a witness set to false, in which case we need to test
         * our constraints correctly override each value which would produce an unsatisfied constraint.
         *
         */
        { T::override_witness(constraint, witness_values, witness_override) } -> std::same_as<void>;

        /**
         * @brief Generate valid constraints with predicate set to a witness holding the value true.
         *
         */
        { T::generate_constraints(constraint, witness_values) } -> std::same_as<void>;

        /**
         * @brief Tamper with the witness values to test that invalid witnesses produce unsatisfied constraints.
         *
         */
        { T::tampering(constraint, witness_values, tampering_mode) } -> std::same_as<void>;
    };
};

/**
 * @brief Test class for ACIR constraints that contain a predicate.
 */
template <TestBaseWithPredicate Base> class TestClassWithPredicate {
  public:
    using Builder = Base::Builder;
    using WitnessOverride = Base::WitnessOverride;
    using WitnessOverrideCase = WitnessOverride::Case;
    using AcirConstraint = Base::AcirConstraint;
    using TamperingMode = Base::TamperingMode;

    /**
     * @brief Update the constraint and the witness based on the predicate
     *
     * @param constraint
     * @param witness_values
     * @param mode
     */
    static void update_witness_based_on_predicate(AcirConstraint& constraint,
                                                  WitnessVector& witness_values,
                                                  const Predicate<WitnessOverrideCase>& mode)
    {
        switch (mode.test_case) {
        case PredicateTestCase::ConstantTrue:
            constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(1));
            witness_values.pop_back();
            break;
        case PredicateTestCase::ConstantFalse:
            constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(0));
            witness_values.pop_back();
            break;
        case PredicateTestCase::WitnessTrue:
            break;
        case PredicateTestCase::WitnessFalse:
            Base::override_witness(constraint, witness_values, mode.witness_override);
        }
    }

    /**
     * @brief Generate constraints and witness values based on the predicate and the tampering mode.
     */
    static std::pair<AcirConstraint, WitnessVector> generate_constraints(
        const Predicate<WitnessOverrideCase>& mode, const TamperingMode& tampering_mode = TamperingMode::None)
    {
        AcirConstraint constraint;
        WitnessVector witness_values;
        Base::generate_constraints(constraint, witness_values);
        update_witness_based_on_predicate(constraint, witness_values, mode);
        Base::tampering(constraint, witness_values, tampering_mode);

        return { constraint, witness_values };
    }

    /**
     * @brief General purpose testing function. It generates the test based on the predicate, witness override case, and
     * the tampering mode.
     */
    static std::tuple<bool, bool, std::string> test_predicate_constraints(const PredicateTestCase& test_case,
                                                                          const WitnessOverrideCase& witness_override,
                                                                          const TamperingMode& tampering_mode)
    {
        Predicate<WitnessOverrideCase> predicate = { .test_case = test_case, .witness_override = witness_override };
        auto [constraint, witness_values] = generate_constraints(predicate, tampering_mode);

        AcirFormat constraint_system = {
            .varnum = static_cast<uint32_t>(witness_values.size()),
            .num_acir_opcodes = 1,
            .public_inputs = {},
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };

        add_constraint_to_acir_format(constraint_system, constraint);

        mock_opcode_indices(constraint_system);

        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program);

        return { CircuitChecker::check(builder), builder.failed(), builder.err() };
    }

    /**
     * @brief Test all cases in which the predicate is a constant holding the value true.
     *
     * @param default_tampering_mode
     */
    static void test_constant_true(TamperingMode default_tampering_mode)
    {
        // Constant true, no tampering
        {
            auto [circuit_checker_result, builder_failed, _] = test_predicate_constraints(
                PredicateTestCase::ConstantTrue, WitnessOverrideCase::None, TamperingMode::None);
            BB_ASSERT(circuit_checker_result, "Circuit checker failed.");
            BB_ASSERT(!builder_failed, "Builder succeeded unexpectedly.");
        }

        // Constant true, default tampering
        {
            auto [circuit_checker_result, builder_failed, _] = test_predicate_constraints(
                PredicateTestCase::ConstantTrue, WitnessOverrideCase::None, default_tampering_mode);
            BB_ASSERT(!circuit_checker_result, "Circuit checker succeeded unexpectedly.");
            BB_ASSERT(builder_failed, "Builder failed unexpectedly.");
        }
    }

    /**
     * @brief Test all cases in which the predicate is a witness holding the value true.
     *
     * @param default_tampering_mode
     */
    static void test_witness_true(TamperingMode default_tampering_mode)
    {
        // Witness true, no tampering
        {
            auto [circuit_checker_result, builder_failed, _] = test_predicate_constraints(
                PredicateTestCase::WitnessTrue, WitnessOverrideCase::None, TamperingMode::None);
            BB_ASSERT(circuit_checker_result, "Circuit checker failed.");
            BB_ASSERT(!builder_failed, "Builder succeeded unexpectedly.");
        }

        // Witness true, default tampering
        {
            auto [circuit_checker_result, builder_failed, _] = test_predicate_constraints(
                PredicateTestCase::WitnessTrue, WitnessOverrideCase::None, default_tampering_mode);
            BB_ASSERT(!circuit_checker_result, "Circuit checker succeeded unexpectedly.");
            BB_ASSERT(builder_failed, "Builder failed unexpectedly.");
        }
    }

    /**
     * @brief Test all witness override cases for the witness false predicate case.
     *
     * @param default_tampering_mode
     */
    static void test_witness_false(TamperingMode default_tampering_mode)
    {
        for (auto [override_case, override_label] :
             zip_view(WitnessOverride::get_all(), WitnessOverride::get_labels())) {
            auto tampering_mode =
                override_case == WitnessOverrideCase::None ? default_tampering_mode : TamperingMode::None;
            auto [circuit_checker_result, builder_failed, _] =
                test_predicate_constraints(PredicateTestCase::WitnessFalse, override_case, tampering_mode);

            EXPECT_TRUE(circuit_checker_result) << "Check builder failed for override case " << override_label;
            EXPECT_FALSE(builder_failed) << "Builder failed for override case " << override_label;
        }
    }
};

} // namespace acir_format
