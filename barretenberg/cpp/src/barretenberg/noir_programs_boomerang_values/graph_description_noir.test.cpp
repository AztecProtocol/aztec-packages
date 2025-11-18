#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <cstdlib>
#include <filesystem>
#include <iostream>

using namespace bb;
using namespace cdg;
static std::string home_dir = std::getenv("HOME");
static std::string common_preffix =
    home_dir + "/aztec-packages/barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/noir_programs/";

void test_acir(std::vector<uint8_t>& bytecode)
{
    auto tool = StaticAnalyzerAcir(bytecode);
    auto [variables_in_one_gate, unconstrained_vars] = tool.analyze_acir();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    if (unconstrained_vars.size() > 0) {
        info("print variables that weren't constrained properly");
        for (const auto& elem : unconstrained_vars) {
            info("elem == ", elem);
        }
    }
    if (variables_in_one_gate.size() > 0) {
        info("print variables in one gate");
        for (const auto& elem: variables_in_one_gate) {
            tool.print_variable_info(elem);
        }
    }
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

TEST(BoomerangAcirCircuitBuilder, SqnCase)
{
    std::string init_bytecode_path = "sgn0/target/sgn0.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, EccPointAdditionCase)
{
    std::string init_bytecode_path = "ecc/target/ecc.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, FibCase)
{
    std::string init_bytecode_path = "fib/target/fib.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, AESCase)
{
    std::string init_bytecode_path = "aes/target/blackbox.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, EqualCase) {
    std::string init_bytecode_path = "equiv/target/equiv.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}

TEST(BoomerangAcirCircuitBuilder, BlackBoxAndXorCase) {
    std::string init_bytecode_path = "blackbox_and_xor/target/blackbox_and_xor.json";
    std::string bytecode_file = common_preffix + init_bytecode_path;
    std::vector<uint8_t> vector_bytecode = get_bytecode_from_json(bytecode_file);
    test_acir(vector_bytecode);
}
