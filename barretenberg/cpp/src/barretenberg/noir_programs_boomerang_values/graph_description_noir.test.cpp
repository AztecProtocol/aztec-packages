#include "barretenberg/acir_formal_proofs/acir_loader.hpp"
#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"

using namespace bb;
using namespace cdg;

void test_acir_circuit_builder(const std::vector<uint8_t>& acir_program_buf)
{
    acir_format::AcirFormat constraint_system = acir_format::program_buf_to_acir_format(acir_program_buf, false).at(0);
    bb::UltraCircuitBuilder builder = acir_format::create_circuit(constraint_system, false);
    auto tool = StaticAnalyzer(builder);
    auto test_result = tool.analyzer_circuit();
    EXPECT_EQ(test_result.first.size(), 1);
    EXPECT_EQ(test_result.second.size(), 0);
}

TEST(boomerang_acir_circuit_builder, test_graph_1st_vector)
{
    std::vector<uint8_t> acir_program_buf{
        31,  139, 8,   0,   0,   0,   0,   0,   0,   255, 165, 83,  189, 10,  194, 48,  16,  78,  154, 84,  234, 38,
        210, 238, 29,  117, 83,  124, 4,   17,  156, 196, 209, 69,  68,  108, 135, 12,  22,  41,  165, 224, 216, 71,
        16,  95,  192, 167, 16,  125, 156, 110, 142, 46,  238, 254, 221, 201, 89,  34,  38,  122, 16,  190, 235, 119,
        247, 229, 187, 132, 134, 179, 103, 72,  192, 229, 92,  37,  247, 220, 133, 111, 126, 91,  2,   16,  151, 36,
        181, 106, 32,  23,  50,  163, 224, 22,  189, 111, 126, 226, 31,  67,  65,  136, 16,  176, 19,  141, 210, 178,
        187, 107, 31,  198, 131, 125, 81,  76,  166, 173, 222, 105, 184, 62,  174, 54,  253, 242, 178, 61,  83,  49,
        179, 243, 210, 233, 190, 121, 73,  102, 126, 41,  52,  28,  75,  31,  206, 204, 207, 226, 152, 247, 190, 230,
        120, 8,   53,  185, 174, 222, 0,   140, 84,  26,  47,  50,  149, 199, 51,  149, 228, 113, 154, 213, 129, 247,
        0,   3,   162, 19,  230, 51,  113, 212, 251, 191, 233, 89,  77,  195, 5,   36,  199, 125, 209, 135, 158, 49,
        100, 118, 129, 255, 167, 171, 169, 225, 190, 178, 210, 235, 85,  144, 219, 251, 243, 79,  115, 232, 30,  122,
        19,  208, 39,  28,  222, 199, 21,  25,  228, 247, 207, 85,  4,   0,   0
    };
    test_acir_circuit_builder(acir_program_buf);
}
