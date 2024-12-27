/**
 * @file acir_loader.test.cpp
 * @brief Tests for verifying ACIR (Arithmetic Circuit Intermediate Representation) operations
 *
 * This test suite verifies the correctness of various arithmetic, logical, and bitwise operations
 * implemented in ACIR format. It uses SMT solvers to formally verify the operations.
 */

#include "acir_loader.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "formal_proofs.hpp"
#include "helpers.hpp"
#include <vector>

// Path to test artifacts containing ACIR programs and witness files
const std::string ARTIFACTS_PATH = "../src/barretenberg/acir_formal_proofs/artifacts/";

/**
 * @brief Saves witness data when a bug is found during verification
 * @param instruction_name Name of the instruction being tested
 * @param circuit The circuit containing the bug
 *
 * Saves witness data to a file named {instruction_name}.witness in the artifacts directory
 */
void save_buggy_witness(std::string instruction_name, smt_circuit::UltraCircuit circuit)
{
    std::vector<std::string> special_names;
    info("Saving bug for op ", instruction_name);
    default_model_single(special_names, circuit, ARTIFACTS_PATH + instruction_name + ".witness");
}

/**
 * @brief Verifies a previously saved witness file for correctness
 * @param instruction_name Name of the instruction to verify
 * @return true if witness is valid, false otherwise
 *
 * Loads a witness file and verifies it against the corresponding ACIR program
 */
bool verify_buggy_witness(std::string instruction_name)
{
    std::vector<bb::fr> witness = import_witness_single(ARTIFACTS_PATH + instruction_name + ".witness.pack");
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + instruction_name + ".acir");
    bb::UltraCircuitBuilder builder = loader.get_circuit_builder();
    for (uint i = 0; i < witness.size(); i++) {
        builder.variables[i] = witness[i];
        if (i < 100) {
            info(witness[i]);
        }
    }
    return bb::CircuitChecker::check(builder);
}

/**
 * @brief Tests 127-bit unsigned addition
 * Verifies that the ACIR implementation of addition is correct
 * Execution time: ~2.8 seconds on SMTBOX
 */
TEST(acir_formal_proofs, uint_terms_add)
{
    std::string TESTNAME = "Binary::Add_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_add(&solver, circuit);
    EXPECT_FALSE(res);

    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 127-bit unsigned bitwise AND
 * Verifies that the ACIR implementation of AND is correct
 */
TEST(acir_formal_proofs, uint_terms_and)
{
    std::string TESTNAME = "Binary::And_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_and(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 126-bit unsigned division
 * Verifies that the ACIR implementation of division is correct
 */
TEST(acir_formal_proofs, uint_terms_div)
{
    std::string TESTNAME = "Binary::Div_Unsigned_126_Unsigned_126";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_div(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 127-bit unsigned equality comparison
 * Verifies two cases:
 * 1. When operands are equal, result must be 0
 * 2. When operands are not equal, result must be 1
 * Execution time: ~22.8 seconds on SMTBOX
 */
TEST(acir_formal_proofs, uint_terms_eq)
{
    std::string TESTNAME = "Binary::Eq_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver1 = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit1 = loader.get_bitvec_smt_circuit(&solver1);

    bool res1 = verify_eq_on_equlaity(&solver1, circuit1);
    EXPECT_FALSE(res1);
    if (res1) {
        save_buggy_witness(TESTNAME, circuit1);
    }

    smt_solver::Solver solver2 = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit2 = loader.get_bitvec_smt_circuit(&solver2);

    bool res2 = verify_eq_on_inequlaity(&solver2, circuit2);
    EXPECT_FALSE(res2);
    if (res2) {
        save_buggy_witness(TESTNAME, circuit2);
    }
}

/**
 * @brief Tests 127-bit unsigned less than comparison
 * Verifies two cases:
 * 1. When a < b, result must be 0
 * 2. When a >= b, result must be 1
 * Execution time: ~56.7 seconds on SMTBOX
 */
TEST(acir_formal_proofs, uint_terms_lt)
{
    std::string TESTNAME = "Binary::Lt_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver1 = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit1 = loader.get_bitvec_smt_circuit(&solver1);

    bool res1 = verify_lt(&solver1, circuit1);
    EXPECT_FALSE(res1);
    if (res1) {
        save_buggy_witness(TESTNAME, circuit1);
    }

    smt_solver::Solver solver2 = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit2 = loader.get_bitvec_smt_circuit(&solver2);

    bool res2 = verify_gt(&solver2, circuit2);
    EXPECT_FALSE(res2);
    if (res2) {
        save_buggy_witness(TESTNAME, circuit2);
    }
}

/**
 * @brief Tests 126-bit unsigned modulo
 * Verifies that the ACIR implementation of modulo is correct
 * Execution time: ??? seconds on SMTBOX
 */
TEST(acir_formal_proofs, uint_terms_mod)
{
    std::string TESTNAME = "Binary::Mod_Unsigned_126_Unsigned_126";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_mod(&solver, circuit);
    solver.print_assertions();
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 127-bit unsigned multiplication
 * Verifies that the ACIR implementation of multiplication is correct
 * Execution time: ~10.0 seconds on SMTBOX
 */
TEST(acir_formal_proofs, uint_terms_mul)
{
    std::string TESTNAME = "Binary::Mul_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_mul(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 127-bit unsigned bitwise OR
 * Verifies that the ACIR implementation of OR is correct
 */
TEST(acir_formal_proofs, uint_terms_or)
{
    std::string TESTNAME = "Binary::Or_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_or(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 64-bit left shift
 * Verifies that the ACIR implementation of left shift is correct
 * Execution time: ~4588 seconds on SMTBOX
 * Memory usage: ~30GB RAM
 */
TEST(acir_formal_proofs, uint_terms_shl64)
{
    std::string TESTNAME = "Binary::Shl_Unsigned_32_Unsigned_8";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_shl64(&solver, circuit);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
    EXPECT_FALSE(res);
}

/**
 * @brief Tests 32-bit left shift
 * Verifies that the ACIR implementation of left shift is correct
 * Execution time: ~4574 seconds on SMTBOX
 * Memory usage: ~30GB RAM
 */
TEST(acir_formal_proofs, uint_terms_shl32)
{
    std::string TESTNAME = "Binary::Shl_Unsigned_32_Unsigned_8";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_shl32(&solver, circuit);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
    EXPECT_FALSE(res);
}

/**
 * @brief Tests right shift operation
 * Verifies that the ACIR implementation of right shift is correct
 * Execution time: ~3927.88 seconds on SMTBOX
 * Memory usage: ~10GB RAM
 */
TEST(acir_formal_proofs, uint_terms_shr)
{
    std::string TESTNAME = "Binary::Shr_Unsigned_64_Unsigned_8";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_shr(&solver, circuit);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
    EXPECT_FALSE(res);
}

/**
 * @brief Tests 127-bit unsigned subtraction
 * Verifies that the ACIR implementation of subtraction is correct
 * Execution time: ~2.6 seconds on SMTBOX
 */
TEST(acir_formal_proofs, uint_terms_sub)
{
    std::string TESTNAME = "Binary::Sub_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_sub(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 127-bit unsigned bitwise XOR
 * Verifies that the ACIR implementation of XOR is correct
 */
TEST(acir_formal_proofs, uint_terms_xor)
{
    std::string TESTNAME = "Binary::Xor_Unsigned_127_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_xor(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 127-bit unsigned bitwise NOT
 * Verifies that the ACIR implementation of NOT is correct
 */
TEST(acir_formal_proofs, uint_terms_not)
{
    std::string TESTNAME = "Not_Unsigned_127";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_bitvec_smt_circuit(&solver);
    bool res = verify_not_127(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests field addition
 * Verifies that the ACIR implementation of field addition is correct
 * Execution time: ~0.22 seconds on SMTBOX
 */
TEST(acir_formal_proofs, field_terms_add)
{
    std::string TESTNAME = "Binary::Add_Field_0_Field_0";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_field_smt_circuit(&solver);
    bool res = verify_add(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests field division
 * Verifies that the ACIR implementation of field division is correct
 * Execution time: ~0.22 seconds on SMTBOX
 */
TEST(acir_formal_proofs, field_terms_div)
{
    std::string TESTNAME = "Binary::Div_Field_0_Field_0";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_field_smt_circuit(&solver);
    bool res = verify_div_field(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests field multiplication
 * Verifies that the ACIR implementation of field multiplication is correct
 * Execution time: ~0.22 seconds on SMTBOX
 */
TEST(acir_formal_proofs, field_terms_mul)
{
    std::string TESTNAME = "Binary::Mul_Field_0_Field_0";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_field_smt_circuit(&solver);
    bool res = verify_mul(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

/**
 * @brief Tests 126-bit signed division
 * Verifies that the ACIR implementation of signed division is correct
 * Execution time: >10 DAYS on SMTBOX
 */
TEST(acir_formal_proofs, integer_terms_div)
{
    std::string TESTNAME = "Binary::Div_Signed_126_Signed_126";
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + TESTNAME + ".acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_integer_smt_circuit(&solver);
    bool res = verify_div(&solver, circuit);
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness(TESTNAME, circuit);
    }
}

TEST(acir_formal_proofs, verify_div_bug)
{
    std::string name = "Binary::Div_Unsigned_126_Unsigned_126";
    EXPECT_TRUE(verify_buggy_witness(name));
}