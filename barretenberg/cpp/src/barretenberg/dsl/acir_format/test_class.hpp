// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "gtest/gtest.h"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Add a constraint element to the appropriate vector in AcirFormat
 *
 * @details Uses constexpr if to determine the correct vector based on constraint type. RecursionConstraints are not
 * handled in this function.
 *
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
        throw_or_abort("Recursion constraints are not currently supported.");
    } else if constexpr (std::is_same_v<ConstraintType, BlockConstraint>) {
        acir_format.block_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, AcirFormat::ArithTripleConstraint>) {
        acir_format.arithmetic_triple_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, bb::mul_quad_<bb::curve::BN254::ScalarField>>) {
        acir_format.quad_constraints.push_back(constraint);
    } else if constexpr (std::is_same_v<ConstraintType, std::vector<bb::mul_quad_<bb::curve::BN254::ScalarField>>>) {
        acir_format.big_quad_constraints.push_back(constraint);
    } else {
        throw_or_abort("Unsupported constraint type");
    }
}

/**
 * @brief Concept defining the requirements for the Base template parameter of TestClass
 *
 * @details Base must provide:
 * - A class InvalidWitness, which specifies how to invalidate witness values to make the constraints
 *   unsatisfied. InvalidWitness must specify an enum class Target, which details the different invalidation targets,
 *   and two functions get_all() and get_labels() to iterate over all the possible invalidation targets.
 * - Type aliases: Builder and AcirConstraint, specifying the Builder and constraint we are working with.
 * - Static methods: generate_constraints (to generate valid constraints), invalidate_witness
 *   (to invalidate witness values to produce unsatisfied constraints).
 */
template <typename T>
concept TestBase = requires {
    // Required type aliases
    typename T::Builder;
    typename T::AcirConstraint;
    typename T::InvalidWitness;
    typename T::InvalidWitness::Target;

    // Ensure InvalidWitness::Target is enum
    requires std::is_enum_v<typename T::InvalidWitness::Target>;

    // Ensure that InvalidWitness::Target has a None value
    { T::InvalidWitness::Target::None };

    // InvalidWitness must provide static methods for test iteration
    { T::InvalidWitness::get_all() } -> std::same_as<std::vector<typename T::InvalidWitness::Target>>;
    { T::InvalidWitness::get_labels() } -> std::same_as<std::vector<std::string>>;

    // Required constraint manipulation methods (can be static or non-static)
    requires requires(T& instance,
                      typename T::AcirConstraint& constraint,
                      WitnessVector& witness_values,
                      const typename T::InvalidWitness::Target& invalid_witness_target) {
        /**
         * @brief Generate valid constraints.
         *
         */
        { instance.generate_constraints(constraint, witness_values) } -> std::same_as<void>;

        /**
         * @brief Invalidate witness values to test that invalid witnesses produce unsatisfied constraints.
         *
         */
        { instance.invalidate_witness(constraint, witness_values, invalid_witness_target) } -> std::same_as<void>;
    };
};

template <TestBase Base> class TestClass {
  public:
    using Builder = Base::Builder;
    using AcirConstraint = Base::AcirConstraint;
    using InvalidWitness = Base::InvalidWitness;
    using InvalidWitnessTarget = Base::InvalidWitness::Target;

    /**
     * @brief Generate constraints and witness values based on the invalidation target.
     */
    static std::pair<AcirConstraint, WitnessVector> generate_constraints(
        const InvalidWitnessTarget& invalid_witness_target = InvalidWitnessTarget::None)
    {
        AcirConstraint constraint;
        WitnessVector witness_values;

        // Create an instance to allow for non-static methods
        Base base_instance;
        base_instance.generate_constraints(constraint, witness_values);
        base_instance.invalidate_witness(constraint, witness_values, invalid_witness_target);

        return { constraint, witness_values };
    }

    /**
     * @brief General purpose testing function. It generates the test based on the invalidation target.
     */
    static std::tuple<bool, bool, std::string> test_constraints(const InvalidWitnessTarget& invalid_witness_target)
    {
        auto [constraint, witness_values] = generate_constraints(invalid_witness_target);

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
     * @brief Test vk generation is independent of the witness values supplied.
     *
     * @tparam Flavor
     */
    template <typename Flavor> static size_t test_vk_independence()
    {
        using ProverInstance = ProverInstance_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        size_t num_gates = 0;

        // Generate the constraint system
        auto [constraint, witness_values] = generate_constraints();

        AcirFormat constraint_system = {
            .varnum = static_cast<uint32_t>(witness_values.size()),
            .num_acir_opcodes = 1,
            .public_inputs = {},
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };

        add_constraint_to_acir_format(constraint_system, constraint);

        mock_opcode_indices(constraint_system);

        // Construct the vks
        std::shared_ptr<VerificationKey> vk_from_witness;
        {
            AcirProgram program{ constraint_system, witness_values };
            auto builder = create_circuit<Builder>(program);
            num_gates = builder.get_num_finalized_gates_inefficient();

            auto prover_instance = std::make_shared<ProverInstance>(builder);
            vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

            // Validate the builder
            EXPECT_TRUE(CircuitChecker::check(builder));
        }

        std::shared_ptr<VerificationKey> vk_from_constraint;
        {
            AcirProgram program{ constraint_system, /*witness=*/{} };
            auto builder = create_circuit<Builder>(program);
            auto prover_instance = std::make_shared<ProverInstance>(builder);
            vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        }

        EXPECT_EQ(*vk_from_witness, *vk_from_constraint) << "Mismatch in the vks";

        return num_gates;
    }

    /**
     * @brief Test all invalid witness targets.
     *
     * @return std::vector<std::string> List of error messages from the builder for each invalid witness target.
     */
    static std::vector<std::string> test_tampering()
    {
        std::vector<std::string> error_msgs;
        for (auto [target, label] : zip_view(InvalidWitness::get_all(), InvalidWitness::get_labels())) {
            auto [circuit_checker_result, builder_failed, builder_err] = test_constraints(target);
            error_msgs.emplace_back(builder_err);

            if (target != InvalidWitness::Target::None) {
                EXPECT_FALSE(circuit_checker_result && (builder_err.find("assert_eq") != std::string::npos))
                    << "Circuit checker succeeded unexpectedly and no assert_eq failure for invalid witness target " +
                           label;
                EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly for invalid witness target " + label;
            } else {
                EXPECT_TRUE(circuit_checker_result)
                    << "Circuit checker failed unexpectedly for invalid witness target " + label;
                EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for invalid witness target " + label;
            }
        }

        return error_msgs;
    }
};

} // namespace acir_format
