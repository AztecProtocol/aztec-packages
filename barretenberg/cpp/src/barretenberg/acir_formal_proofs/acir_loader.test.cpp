#include "acir_loader.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
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

    std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
    std::unordered_map<std::string, std::string> vals = solver.model(terms);
    info("a = ", vals["a"]);
    info("b = ", vals["b"]);
    info("c = ", vals["c"]);
    info("c_res = ", vals["cr"]);

}

/*TEST(acir_formal_proofs, uint_terms_div)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Div.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    // c = a // b
    // a = b * c + k where k < b 
    // k = a - b * c
    // 
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a - c * b;
    cr < b;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
    std::unordered_map<std::string, std::string> vals = solver.model(terms);
    info("a = ", vals["a"]);
    info("b = ", vals["b"]);
    info("c = ", vals["c"]);
    info("c_res = ", vals["cr"]);

    EXPECT_FALSE(res);
}*/

/* TEST(acir_formal_proofs, uint_terms_eq)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Eq.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    // c is bool var  = (a == b)
    // so if c is True a - b == 0
    // if c is False a - b == k
    // so if circuit is correct
    // ( a - b ) * (c ^ 1) == 0
    // if a - b != 0 and c is True k * (a - b) = 0, circuit is incorrect
    // if a - b == 0 
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a == b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
} */

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

TEST(acir_formal_proofs, uint_terms_mod)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Mod.acir");
    smt_solver::Solver solver = loader.get_solver();
    smt_circuit::UltraCircuit circuit = loader.get_circuit(&solver);
    // c = a mod b
    // k * b + c = a
    // k = (a - c) / b
    // (a - c) * b + c * b == a * b
    smt_circuit::STerm a = circuit["a"];
    smt_circuit::STerm b = circuit["b"];
    smt_circuit::STerm c = circuit["c"];
    smt_circuit::STerm c1 = (a - c) * b + c * b;
    smt_circuit::STerm c2 = a * b;
    c1 != c2;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}

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

    std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
    std::unordered_map<std::string, std::string> vals = solver.model(terms);
    info("a = ", vals["a"]);
    info("b = ", vals["b"]);
    info("c = ", vals["c"]);
    info("c_res = ", vals["cr"]);

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

    std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
    std::unordered_map<std::string, std::string> vals = solver.model(terms);
    info("a = ", vals["a"]);
    info("b = ", vals["b"]);
    info("c = ", vals["c"]);
    info("c_res = ", vals["cr"]);
}


TEST(acir_circuit_check, uint_terms_add)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Add.public.acir");
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(loader.get_constraint_systems(), false);
    // naming first three variables
    // for binary noir sets indices as 0 1 2
    // for unary noir sets indices as 0 1
    info(builder.public_inputs);
    info(builder.zero_idx);
    builder.set_variable_name(0, "a");
    builder.set_variable_name(1, "b");
    builder.set_variable_name(2, "c");
    builder.set_variable_name(3, "d");
    builder.variables[0] = 1;
    builder.variables[1] = 1;
    builder.variables[3] = 2;
    // builder.variables[4] = 1;
    EXPECT_TRUE(bb::CircuitChecker::check(builder));
}