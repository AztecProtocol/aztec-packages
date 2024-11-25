#include "acir_loader.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
<<<<<<< HEAD
#include "barretenberg/smt_verification/solver/solver.hpp"
=======
>>>>>>> 56559cf7fce08564b1b28ebe20726ba486af2379
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <vector>

<<<<<<< HEAD
TEST(acir_formal_proofs, uint_terms_add)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Add.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a + b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_mul)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Mul.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a * b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_and)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::And.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a & b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_div)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Div.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a / b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

/*TEST(acir_formal_proofs, uint_terms_eq)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Eq.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a == b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}*/

/* TEST(acir_formal_proofs, uint_terms_lt)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Lt.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a < b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
} */

/* TEST(acir_formal_proofs, uint_terms_mod)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Mod.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a % b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
} */

TEST(acir_formal_proofs, uint_terms_or)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Or.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a | b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

/*TEST(acir_formal_proofs, uint_terms_shl)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Shl.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a << b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_shr)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Shr.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a >> b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
} */

TEST(acir_formal_proofs, uint_terms_sub)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Sub.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a - b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_xor)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Xor.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a ^ b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}
=======
TEST(acir_formal_proofs, slow)
{
    AcirInstructionLoader add =
        AcirInstructionLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Add.acir");
    auto system = add.get_constraint_systems().at(0);
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(system, false);
    info(builder.public_inputs);
    // info(builder.variables);
    builder.set_variable_name(0, "a");
    builder.set_variable_name(1, "b");
    builder.set_variable_name(2, "c");
    builder.set_variable_name(3, "d");
    builder.set_variable_name(4, "e");
    EXPECT_TRUE(bb::CircuitChecker::check(builder));

    auto buf = builder.export_circuit();
    smt_circuit::CircuitSchema circuit_info = smt_circuit_schema::unpack_from_buffer(buf);
    smt_solver::Solver s(circuit_info.modulus);
    smt_circuit::UltraCircuit circuit(circuit_info, &s, smt_terms::TermType::FFTerm);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    info(c);
    auto cr = a + b;
    c != cr;
    bool res = s.check();
    EXPECT_TRUE(false);
    s.print_assertions();
    info(s.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_add)
{
    AcirInstructionLoader add =
        AcirInstructionLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Add.acir");
    auto system = add.get_constraint_systems().at(0);
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(system, false);
    info(builder.public_inputs);
    // info(builder.variables);
    builder.set_variable_name(0, "a");
    builder.set_variable_name(1, "b");
    builder.set_variable_name(2, "c");
    builder.set_variable_name(3, "d");
    builder.set_variable_name(4, "e");
    EXPECT_TRUE(bb::CircuitChecker::check(builder));

    auto buf = builder.export_circuit();
    smt_circuit::CircuitSchema circuit_info = smt_circuit_schema::unpack_from_buffer(buf);
    smt_solver::Solver s(circuit_info.modulus);
    smt_circuit::UltraCircuit circuit(circuit_info, &s, smt_terms::TermType::BVTerm);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    info(c);
    auto cr = a + b;
    c != cr;
    bool res = s.check();
    EXPECT_TRUE(false);
    s.print_assertions();
    info(s.getResult());
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, public_inputs)
{
    AcirInstructionLoader add =
        AcirInstructionLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Add.public.acir");
    auto system = add.get_constraint_systems().at(0);
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(system, false);
    // builder.zero_idx = 4;
    info(builder.zero_idx);
    info("Public inputs in builder", builder.public_inputs);
    info(builder.real_variable_index[2]);
    info(builder.real_variable_index[3]);
    builder.variables[0] = 10;
    builder.variables[1] = 10;
    // if we set second variable check circuit throws error :(, so output in third???
    builder.variables[3] = 20;
    EXPECT_TRUE(bb::CircuitChecker::check(builder));

    builder.set_variable_name(0, "a");
    builder.set_variable_name(1, "b");
    builder.set_variable_name(2, "c");
    builder.set_variable_name(3, "d");
    builder.set_variable_name(4, "e");
    EXPECT_TRUE(bb::CircuitChecker::check(builder));

    auto buf = builder.export_circuit();
    smt_circuit::CircuitSchema circuit_info = smt_circuit_schema::unpack_from_buffer(buf);
    info("Circuit info public inputs", circuit_info.public_inps);
    smt_solver::Solver s(circuit_info.modulus);
    smt_circuit::UltraCircuit circuit(circuit_info, &s, smt_terms::TermType::BVTerm);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    info(c);
    auto cr = a + b;
    c != cr;
    bool res = s.check();
    EXPECT_TRUE(false);
    s.print_assertions();
    info(s.getResult());
    EXPECT_FALSE(res);
}
>>>>>>> 56559cf7fce08564b1b28ebe20726ba486af2379
