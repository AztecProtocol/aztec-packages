#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <filesystem>

using namespace bb;
using namespace cdg;
static std::string common_preffix =
    "/home/dkidot/aztec/aztec-packages/barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/noir_programs/";


void test_acir(std::vector<uint8_t>& bytecode) {
    auto tool = StaticAnalyzerAcir(bytecode);
    auto [variables_in_one_gate, unconstrained_vars] = tool.analyze_acir();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    if (variables_in_one_gate.size() > 0) {
        info("print variables_in_one_gate");
        for (const auto& elem: variables_in_one_gate) {
            info("elem == ", elem);
        }
    }
    if (unconstrained_vars.size() > 0) {
        for (const auto& elem: unconstrained_vars) {
            info("elem == ", elem);
        }

    }
void test_acir_circuit_builder(std::vector<uint8_t>& acir_program_buf)
{
    auto constraint_systems = acir_format::program_buf_to_acir_format(std::move(acir_program_buf));
    const acir_format::AcirFormat constraint_system = constraint_systems.at(0);
    acir_format::AcirProgram program{ constraint_system };
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(program);
    auto tool = StaticAnalyzer(builder);
    auto test_result = tool.analyze_circuit();
    EXPECT_EQ(test_result.first.size(), 1);
    EXPECT_EQ(test_result.second.size(), 0);
}

TEST(BoomerangAcirCircuitBuilder, InitCase)
{
    std::string init_bytecode_path = "init/target/init.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, FirstCase)
{
    std::string init_bytecode_path = "first/target/first.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, SqnCase) {
    std::string init_bytecode_path = "sgn0/target/sgn0.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, EccPointAdditionCase) {
    std::string init_bytecode_path = "ecc/target/ecc.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, FibCase) {
    std::string init_bytecode_path = "fib/target/fib.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}
