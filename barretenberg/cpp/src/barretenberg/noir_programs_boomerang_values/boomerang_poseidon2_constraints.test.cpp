#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

// Helper to create WitnessOrConstant from index
WitnessOrConstant<fr> witness_from_index(uint32_t idx)
{
    return WitnessOrConstant<fr>::from_index(idx);
}

// Helper to build AcirFormat from individual constraints through the full ACIR serde flow
template <typename... Constraints>
AcirFormat build_acir_format(const Constraints&... constraints)
{
    std::vector<Acir::Opcode> opcodes;
    auto collect = [&opcodes](const auto& constraint) {
        auto ops = constraint_to_acir_opcode(constraint);
        opcodes.insert(opcodes.end(), ops.begin(), ops.end());
    };
    (collect(constraints), ...);
    return circuit_serde_to_acir_format(build_acir_circuit(opcodes));
}

} // namespace

/**
 * @brief Test suite for Poseidon2 constraint processing in StaticAnalyzerAcir
 * @details Tests validate the analyzer's ability to verify Poseidon2 permutation circuits,
 *          including the matrix multiplication layer (6 arithmetic gates), external rounds,
 *          and internal rounds. Corruption tests verify detection of tampered circuits.
 */
class BoomerangPoseidon2ConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Test basic Poseidon2 constraint processing
 * @details Creates a valid Poseidon2 constraint and verifies the analyzer processes it correctly
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, BasicPoseidon2Constraint)
{
    // Create Poseidon2 constraint with 4 input witnesses and 4 output witnesses
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    // Build circuit with sample witness values
    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Create analyzer and verify no incorrect opcodes
    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test Poseidon2 with zero inputs
 * @details Verifies Poseidon2 works correctly when all inputs are zero
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2ZeroInputs)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(0), fr(0), fr(0), fr(0), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test Poseidon2 with large field element inputs
 * @details Verifies Poseidon2 works correctly with large values near field modulus
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2LargeInputs)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    // Use large values
    WitnessVector witness = { fr::random_element(),
                              fr::random_element(),
                              fr::random_element(),
                              fr::random_element(),
                              fr(0),
                              fr(0),
                              fr(0),
                              fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that corrupting matrix layer q_1 selector is detected
 * @details The matrix layer uses exact selector values; corrupting q_1 should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_q1)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find and corrupt a matrix layer gate's q_1 selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        // Look for gate 0 pattern: q_1=1, q_2=1, q_3=2, q_4=-1
        if (arith_block.q_1()[i] == fr(1) && arith_block.q_2()[i] == fr(1) && arith_block.q_3()[i] == fr(2) &&
            arith_block.q_4()[i] == fr(-1)) {
            arith_block.q_1().set(i, fr(2)); // Corrupt q_1 from 1 to 2
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting matrix layer q_4 selector is detected
 * @details Gates 0,1,2,4 have q_4=-1; corrupting this should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_q4)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find and corrupt a matrix layer gate's q_4 selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        // Look for gate with q_4=-1 pattern (gates 0,1,2,4)
        if (arith_block.q_4()[i] == fr(-1) && arith_block.q_arith()[i] == fr(1)) {
            arith_block.q_4().set(i, fr(-2)); // Corrupt q_4 from -1 to -2
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_poseidon2_external selector is detected
 * @details External rounds require q_poseidon2_external=1; disabling it should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRound_qSelector)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt q_poseidon2_external selector
    auto& ext_block = builder.blocks.poseidon2_external;
    ASSERT_GT(ext_block.size(), 0u) << "No external round gates found";

    // Find first enabled external gate and disable it
    bool found_gate = false;
    for (size_t i = 0; i < ext_block.size() && !found_gate; i++) {
        if (ext_block.q_poseidon2_external()[i] == fr::one()) {
            ext_block.q_poseidon2_external().set(i, fr::zero());
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find external round gate to corrupt";

    // Note: CircuitChecker may not detect disabled poseidon2 selector
    // The analyzer should still detect it via round validation

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_poseidon2_internal selector is detected
 * @details Internal rounds require q_poseidon2_internal=1; disabling it should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedInternalRound_qSelector)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt q_poseidon2_internal selector
    auto& int_block = builder.blocks.poseidon2_internal;
    ASSERT_GT(int_block.size(), 0u) << "No internal round gates found";

    // Find first enabled internal gate and disable it
    bool found_gate = false;
    for (size_t i = 0; i < int_block.size() && !found_gate; i++) {
        if (int_block.q_poseidon2_internal()[i] == fr::one()) {
            int_block.q_poseidon2_internal().set(i, fr::zero());
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find internal round gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting external round constant is detected
 * @details Round constants are fixed by the Poseidon2 algorithm; changing them should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRound_RoundConstant)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt round constant q_1 in external block
    auto& ext_block = builder.blocks.poseidon2_external;
    ASSERT_GT(ext_block.size(), 0u) << "No external round gates found";

    // Find first external gate with enabled selector and corrupt q_1 (round constant)
    bool found_gate = false;
    for (size_t i = 0; i < ext_block.size() && !found_gate; i++) {
        if (ext_block.q_poseidon2_external()[i] == fr::one()) {
            fr original = ext_block.q_1()[i];
            ext_block.q_1().set(i, original + fr(1)); // Corrupt round constant
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find external round gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting internal round constant is detected
 * @details Internal rounds use only q_1 for round constant; changing it should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedInternalRound_RoundConstant)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt round constant q_1 in internal block
    auto& int_block = builder.blocks.poseidon2_internal;
    ASSERT_GT(int_block.size(), 0u) << "No internal round gates found";

    bool found_gate = false;
    for (size_t i = 0; i < int_block.size() && !found_gate; i++) {
        if (int_block.q_poseidon2_internal()[i] == fr::one()) {
            fr original = int_block.q_1()[i];
            int_block.q_1().set(i, original + fr(1)); // Corrupt round constant
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find internal round gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_m in matrix layer is detected
 * @details Matrix layer gates should have q_m=0; setting it non-zero should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_qm)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find matrix layer gate and corrupt q_m
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        // Look for gate 0 pattern: q_1=1, q_2=1, q_3=2, q_4=-1, q_m=0
        if (arith_block.q_1()[i] == fr(1) && arith_block.q_2()[i] == fr(1) && arith_block.q_3()[i] == fr(2) &&
            arith_block.q_4()[i] == fr(-1) && arith_block.q_m()[i] == fr::zero()) {
            arith_block.q_m().set(i, fr(1)); // Corrupt q_m from 0 to 1
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_arith in matrix layer is detected
 * @details Matrix layer gates should have q_arith=1; changing it should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_qArith)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find matrix layer gate and corrupt q_arith
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        // Look for gate 0 pattern
        if (arith_block.q_1()[i] == fr(1) && arith_block.q_2()[i] == fr(1) && arith_block.q_3()[i] == fr(2) &&
            arith_block.q_4()[i] == fr(-1) && arith_block.q_arith()[i] == fr(1)) {
            arith_block.q_arith().set(i, fr(0)); // Disable the gate
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer gate to corrupt";
    // Note: CircuitChecker may not detect q_arith=0 as the gate is simply disabled

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting matrix layer q_2 selector is detected
 * @details Gate 0 has q_2=1, gate 1 has q_2=2; corrupting should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_q2)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find and corrupt a matrix layer gate's q_2 selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        // Look for gate 0 pattern: q_1=1, q_2=1, q_3=2, q_4=-1
        if (arith_block.q_1()[i] == fr(1) && arith_block.q_2()[i] == fr(1) && arith_block.q_3()[i] == fr(2) &&
            arith_block.q_4()[i] == fr(-1)) {
            arith_block.q_2().set(i, fr(3)); // Corrupt q_2 from 1 to 3
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting matrix layer q_3 selector is detected
 * @details Gate 0 has q_3=2; corrupting should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_q3)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find and corrupt a matrix layer gate's q_3 selector
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        // Look for gate 0 pattern: q_1=1, q_2=1, q_3=2, q_4=-1
        if (arith_block.q_1()[i] == fr(1) && arith_block.q_2()[i] == fr(1) && arith_block.q_3()[i] == fr(2) &&
            arith_block.q_4()[i] == fr(-1)) {
            arith_block.q_3().set(i, fr(5)); // Corrupt q_3 from 2 to 5
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting matrix layer q_c selector is detected for operator+ gates
 * @details Gates 3 and 5 (created by operator+) have q_c=0; corrupting should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayer_qc)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find gate 3 pattern (operator+ gate): q_1=1, q_2=1, q_3=-1, q_4=0
    auto& arith_block = builder.blocks.arithmetic;
    bool found_gate = false;
    for (size_t i = 0; i < arith_block.size() && !found_gate; i++) {
        if (arith_block.q_1()[i] == fr(1) && arith_block.q_2()[i] == fr(1) && arith_block.q_3()[i] == fr(-1) &&
            arith_block.q_4()[i] == fr(0) && arith_block.q_c()[i] == fr(0)) {
            arith_block.q_c().set(i, fr(1)); // Corrupt q_c from 0 to 1
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find matrix layer operator+ gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting external round q_2 (round constant) is detected
 * @details External rounds use q_2 for second round constant element
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRound_q2)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt round constant q_2 in external block
    auto& ext_block = builder.blocks.poseidon2_external;
    ASSERT_GT(ext_block.size(), 0u) << "No external round gates found";

    bool found_gate = false;
    for (size_t i = 0; i < ext_block.size() && !found_gate; i++) {
        if (ext_block.q_poseidon2_external()[i] == fr::one()) {
            fr original = ext_block.q_2()[i];
            ext_block.q_2().set(i, original + fr(1)); // Corrupt round constant
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find external round gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting external round q_3 (round constant) is detected
 * @details External rounds use q_3 for third round constant element
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRound_q3)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt round constant q_3 in external block
    auto& ext_block = builder.blocks.poseidon2_external;
    ASSERT_GT(ext_block.size(), 0u) << "No external round gates found";

    bool found_gate = false;
    for (size_t i = 0; i < ext_block.size() && !found_gate; i++) {
        if (ext_block.q_poseidon2_external()[i] == fr::one()) {
            fr original = ext_block.q_3()[i];
            ext_block.q_3().set(i, original + fr(1)); // Corrupt round constant
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find external round gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting external round q_4 (round constant) is detected
 * @details External rounds use q_4 for fourth round constant element
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRound_q4)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt round constant q_4 in external block
    auto& ext_block = builder.blocks.poseidon2_external;
    ASSERT_GT(ext_block.size(), 0u) << "No external round gates found";

    bool found_gate = false;
    for (size_t i = 0; i < ext_block.size() && !found_gate; i++) {
        if (ext_block.q_poseidon2_external()[i] == fr::one()) {
            fr original = ext_block.q_4()[i];
            ext_block.q_4().set(i, original + fr(1)); // Corrupt round constant
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find external round gate to corrupt";

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test multiple Poseidon2 constraints in sequence
 * @details Verifies analyzer handles multiple independent Poseidon2 operations.
 *          Uses completely independent witness sets to avoid copy constraint interference.
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, MultiplePoseidon2Constraints)
{
    // First Poseidon2: inputs 0-3, outputs 4-7
    Poseidon2Constraint poseidon_constraint1{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };
    // Second Poseidon2: inputs 8-11, outputs 12-15 (completely independent)
    Poseidon2Constraint poseidon_constraint2{
        .state = { witness_from_index(8), witness_from_index(9), witness_from_index(10), witness_from_index(11) },
        .result = { 12, 13, 14, 15 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint1, poseidon_constraint2);

    WitnessVector witness = { fr(1),  fr(2),  fr(3),  fr(4),  fr(0), fr(0), fr(0), fr(0),
                              fr(10), fr(20), fr(30), fr(40), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test Poseidon2 mixed with other constraint types
 * @details Verifies analyzer handles Poseidon2 alongside range constraints
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithRangeConstraints)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    auto constraint_system = build_acir_format(poseidon_constraint, range_0, range_1);

    WitnessVector witness = { fr(100), fr(200), fr(300), fr(400), fr(0), fr(0), fr(0), fr(0) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test Poseidon2 mixed with QUAD constraint
 * @details Verifies analyzer handles Poseidon2 alongside a standalone QUAD constraint
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithQuadConstraint)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    // QUAD constraint: a*b*mul + a*a_sc + b*b_sc + c*c_sc + d*d_sc + const = 0
    // With a=2, b=3, c=4: 2*3*1 + 2*1 + 3*1 + 4*1 = 6+2+3+4 = 15, so d=15 with d_scaling=-1
    QuadConstraint quad_constraint{
        .a = 8,
        .b = 9,
        .c = 10,
        .d = 11,
        .mul_scaling = fr(1),
        .a_scaling = fr(1),
        .b_scaling = fr(1),
        .c_scaling = fr(1),
        .d_scaling = fr(-1),
        .const_scaling = fr(0),
    };

    auto constraint_system = build_acir_format(poseidon_constraint, quad_constraint);

    // Witness: poseidon inputs (0-3), poseidon outputs (4-7), quad wires (8-11)
    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0), fr(2), fr(3), fr(4), fr(15) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test Poseidon2 mixed with BIG_QUAD constraint
 * @details Verifies analyzer handles Poseidon2 alongside a BigQuadConstraint (chain of gates).
 *          Note: BIG_QUAD requires using program.constraints (mutated by create_circuit).
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithBigQuadConstraint)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    // BigQuadConstraint with 2 gates
    // Gate 0: a*b + a + b + c + d*0 => intermediate stored in next gate's w_4
    // Gate 1: a*b + a + b + c - d + intermediate = 0
    BigQuadConstraint big_quad_constraint = {
        QuadConstraint{
            .a = 8,
            .b = 9,
            .c = 10,
            .d = 11,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(0), // Will be set by create_big_quad_constraint
            .const_scaling = fr(0),
        },
        QuadConstraint{
            .a = 12,
            .b = 13,
            .c = 14,
            .d = 15,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(-1),
            .const_scaling = fr(0),
        },
    };

    auto constraint_system = build_acir_format(poseidon_constraint, big_quad_constraint);

    // Witness values:
    // Poseidon: inputs 0-3, outputs 4-7
    // BigQuad gate 0: a=2, b=3, c=4, d=5 => intermediate = 2*3 + 2 + 3 + 4 + 5*0 = 15
    // BigQuad gate 1: a=1, b=2, c=3, d=? => 1*2 + 1 + 2 + 3 - d + 15 = 0 => d = 23
    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(0), fr(0), fr(0), fr(0),
                              fr(2), fr(3), fr(4), fr(5), fr(1), fr(2), fr(3), fr(23) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Use program.constraints (mutated by create_circuit) for BIG_QUAD
    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test Poseidon2 mixed with both QUAD and BIG_QUAD constraints
 * @details Verifies analyzer handles all three constraint types together.
 *          Note: BIG_QUAD requires using program.constraints (mutated by create_circuit).
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithQuadAndBigQuad)
{
    Poseidon2Constraint poseidon_constraint{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };

    // Simple QUAD: a*b + a + b + c - d = 0
    QuadConstraint quad_constraint{
        .a = 8,
        .b = 9,
        .c = 10,
        .d = 11,
        .mul_scaling = fr(1),
        .a_scaling = fr(1),
        .b_scaling = fr(1),
        .c_scaling = fr(1),
        .d_scaling = fr(-1),
        .const_scaling = fr(0),
    };

    // BigQuadConstraint with 2 gates
    BigQuadConstraint big_quad_constraint = {
        QuadConstraint{
            .a = 12,
            .b = 13,
            .c = 14,
            .d = 15,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(0),
            .const_scaling = fr(0),
        },
        QuadConstraint{
            .a = 16,
            .b = 17,
            .c = 18,
            .d = 19,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(-1),
            .const_scaling = fr(0),
        },
    };

    auto constraint_system = build_acir_format(poseidon_constraint, quad_constraint, big_quad_constraint);

    // Witness:
    // Poseidon: 0-7
    // QUAD (8-11): a=2, b=3, c=4, d = 2*3 + 2 + 3 + 4 = 15
    // BigQuad gate 0 (12-15): a=2, b=3, c=4, d=5 => intermediate = 15
    // BigQuad gate 1 (16-19): a=1, b=2, c=3, d = 2 + 1 + 2 + 3 + 15 = 23
    WitnessVector witness = { fr(1),  fr(2),  fr(3),  fr(4), fr(0), fr(0), fr(0), fr(0), fr(2), fr(3),
                              fr(4),  fr(15), fr(2),  fr(3), fr(4), fr(5), fr(1), fr(2), fr(3), fr(23) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Use program.constraints (mutated by create_circuit) for BIG_QUAD
    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.empty());
}
