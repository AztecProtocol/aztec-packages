#include "acir_loader.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <vector>

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
