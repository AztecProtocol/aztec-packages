#include "acir_loader.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "helpers.hpp"
#include <vector>

// defkit/print_assertions TODO delete all print_assertions from tests
const std::string ARTIFACTS_PATH = "../src/barretenberg/acir_formal_proofs/artifacts/";

// saves to ARTIFACTS_PATH/{instruction_name}.witness
void save_buggy_witness(std::string instruction_name, smt_circuit::UltraCircuit circuit)
{
    // stay it empty, dont want to see them in stdout
    std::vector<std::string> special_names;
    info("Saving bug for op ", instruction_name);
    default_model_single(special_names, circuit, ARTIFACTS_PATH + instruction_name + ".witness");
}

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

TEST(acir_formal_proofs, uint_terms_add)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::Add.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a + b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);

    if (res) {
        save_buggy_witness("Binary::Add", circuit);
    }
}

TEST(acir_formal_proofs, uint_terms_mul)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::Mul.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a * b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Mul", circuit);
    }
}

TEST(acir_formal_proofs, uint_terms_and)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::And.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a & b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::And", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
        info("c_res = ", vals["cr"]);
    }
}

TEST(acir_formal_proofs, uint_terms_div)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Div.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a / b;
    c == cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Div", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
        info("c_res = ", vals["cr"]);
    }
}

// checks to times
// if a == b c must be 0
// if a != b must be 1
TEST(acir_formal_proofs, uint_terms_eq_on_equality)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Eq.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    a == b;
    c != 1;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Eq", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
    }
}

TEST(acir_formal_proofs, uint_terms_eq_on_inequality)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Eq.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    a != b;
    c != 0;
    bool res = solver.check();
    solver.print_assertions();

    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Eq", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
    }
}

/*TEST(acir_formal_proofs, uint_terms_lt)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Lt.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = smt_circuit::BVVar("a", &solver);
    auto b = smt_circuit::BVVar("b", &solver);
    auto c = smt_circuit::BVVar("c", &solver);
    a < b;
    c != 1;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}*/

/*TEST(acir_formal_proofs, uint_terms_gt)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Lt.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);

    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    a > b;
    c != 0;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
}*/

TEST(acir_formal_proofs, uint_terms_mod)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::Mod.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
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
    if (res) {
        save_buggy_witness("Binary::Mod", circuit);
    }
}

TEST(acir_formal_proofs, uint_terms_or)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::Or.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a | b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Or", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
        info("c_res = ", vals["cr"]);
    }
}

TEST(acir_formal_proofs, uint_terms_shl64)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Shl.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = smt_circuit::BVVar("a", &solver);
    auto b = smt_circuit::BVVar("b", &solver);
    auto c = smt_circuit::BVVar("c", &solver);
    auto cr = shl64(a, b, &solver);
    c != cr;
    bool res = solver.check();
    if (res) {
        save_buggy_witness("Binary::Shl", circuit);
    }
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_shl32)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Shl.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = smt_circuit::BVVar("a", &solver);
    auto b = smt_circuit::BVVar("b", &solver);
    auto c = smt_circuit::BVVar("c", &solver);
    auto cr = shl32(a, b, &solver);
    c != cr;
    bool res = solver.check();
    if (res) {
        save_buggy_witness("Binary::Shl", circuit);
    }
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_shr)
{
    AcirToSmtLoader loader = AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Shr.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = shr(a, b, &solver);
    c != cr;
    bool res = solver.check();
    if (res) {
        save_buggy_witness("Binary::Shr", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
        info("c_res = ", vals["cr"]);
    }
    EXPECT_FALSE(res);
}

TEST(acir_formal_proofs, uint_terms_sub)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::Sub.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a - b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Sub", circuit);
    }
}

TEST(acir_formal_proofs, uint_terms_xor)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Binary::Xor.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a ^ b;
    c != cr;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Xor", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("c = ", vals["c"]);
        info("c_res = ", vals["cr"]);
    }
}

TEST(acir_formal_proofs, uint_terms_not)
{
    AcirToSmtLoader loader = AcirToSmtLoader(ARTIFACTS_PATH + "Not.acir");
    smt_solver::Solver solver = loader.get_smt_solver();
    smt_circuit::UltraCircuit circuit = loader.get_smt_circuit(&solver);
    auto a = circuit["a"];
    auto b = circuit["b"];
    // 2**64 - 1
    auto mask = smt_terms::BVConst("18446744073709551615", &solver, 10);
    auto br = a ^ mask;
    br != b;
    bool res = solver.check();
    solver.print_assertions();
    info(solver.getResult());
    EXPECT_FALSE(res);
    if (res) {
        save_buggy_witness("Binary::Not", circuit);
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "br", br } });
        std::unordered_map<std::string, std::string> vals = solver.model(terms);
        info("a = ", vals["a"]);
        info("b = ", vals["b"]);
        info("br = ", vals["br"]);
    }
}

// if failed, bug NOT verified
// fali on file not found or check circuit
TEST(acir_formal_proofs, uint_terms_and_verify_bug)
{
    EXPECT_TRUE(verify_buggy_witness("Binary::And"));
}

// if failed, bug NOT verified
// fali on file not found or check circuit
TEST(acir_formal_proofs, uint_terms_shr_verify_bug)
{
    EXPECT_TRUE(verify_buggy_witness("Binary::Shr"));
}

/*TEST(acir_circuit_check, uint_terms_add)
{
    AcirToSmtLoader loader =
        AcirToSmtLoader("../src/barretenberg/acir_formal_proofs/artifacts/Binary::Add.public.acir");
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
*/