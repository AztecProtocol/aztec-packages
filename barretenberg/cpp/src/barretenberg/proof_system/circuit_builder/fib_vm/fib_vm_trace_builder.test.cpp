#include "fib_vm_trace_builder.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <gtest/gtest.h>
#include <iostream>
#include <string>
#include <sys/types.h>
#include <vector>

#include "barretenberg/serialize/msgpack.hpp"

using namespace barretenberg;
using fr = barretenberg::fr;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::fib_vm_trace_builder_tests {

TEST(FibVMTraceBuilderTests, FibTraceBuilderTest)
{
    // using FF = typename FibVMTraceBuilder::FF;

    const auto run_test = [](bool expected_result) {
        auto trace = FibVMTraceBuilder();

        size_t n = 16;
        trace.set_n(n);
        trace.build_execution_trace();

        bool result = trace.check_gates();
        EXPECT_EQ(result, expected_result);
    };

    run_test(/*expected_result=*/true);
};

struct Commit {
    std::vector<barretenberg::fr> values;

    // MSGPACK_FIELDS(values);
    void print()
    {
        for (auto& value : values) {
            info(value);
        }
    }
};

struct Commitments {
    std::vector<Commit> commitments;

    // MSGPACK_FIELDS(commitments);

    void print()
    {
        for (auto& commitment : commitments) {
            commitment.print();
            info();
        }
    }
};

fr read_field(std::ifstream& file)
{
    uint8_t buffer[32];
    file.read(reinterpret_cast<char*>(buffer), 32);

    // swap it to big endian -> i thought it was le in the first place?
    for (int n = 0, m = 31; n < m; ++n, --m) {
        std::swap(buffer[n], buffer[m]);
    }

    return fr::serialize_from_buffer(buffer);
}

using Row = fib_vm::FibRow<barretenberg::fr>;
std::vector<Row> read_both_file_into_cols(
    // size_t num_commited, // We manually handle the number of rows by reading until eof
    std::string commited_filename,
    //   size_t num_const,
    std::string constant_filename)
{

    std::vector<Row> rows;

    // open both files
    std::ifstream commited_file(commited_filename, std::ios::binary);
    if (!commited_file) {
        std::cout << "Error opening commited file" << std::endl;
        return {};
    }

    std::ifstream constant_file(constant_filename, std::ios::binary);
    if (!constant_file) {
        std::cout << "Error opening constant file" << std::endl;
        return {};
    }

    while (commited_file) {
        Row current_row = {};

        // We need to know the order of serialization
        current_row.x = read_field(commited_file);
        current_row.y = read_field(commited_file);
        current_row.is_last = read_field(constant_file);

        rows.push_back(current_row);
        // TODO: why is thre a bug where the top is absolute bollocks
    }

    return rows;
}

Commitments read_file_into_cols(size_t num_cols, std::string filename)
{
    std::vector<Commit> cols(num_cols);

    std::ifstream file(filename, std::ios::binary);
    if (!file) {
        std::cout << "Error opening file" << std::endl;
        return {};
    }

    while (file) {
        for (size_t i = 0; i < num_cols; ++i) {
            // We read in the columns into commitments one at a time
            uint8_t buffer[32];
            file.read(reinterpret_cast<char*>(buffer), 32);

            // swap it to big endian -> i thought it was le in the first place?
            for (int n = 0, m = 31; n < m; ++n, --m) {
                std::swap(buffer[n], buffer[m]);
            }

            fr field = fr::serialize_from_buffer(buffer);
            cols[i].values.push_back(field);

            // TODO: why is thre a bug where the top is absolute bollocks
        }
    };
    return { cols };
}

TEST(FibVMTraceBuilderTests, FibTracePowdrWitnessGenerationTest)
{
    // Goal of this test
    // Powdr will generate two files that contain all of the polynomials produced during witness generation
    // We will get `constants.bin` and `commits.bin`
    // These files contain a vector of tuples:
    //  - each tuple contains the name of the poly
    //  - And a vector of all of its values, up until a given degree
    //
    // We want to create a method that can, work out how many columns there are
    //  - Extract the name and the values for each column

    // using FF = typename FibVMTraceBuilder::FF;

    // TODO: i think that it is a binary file??

    if (!(std::filesystem::exists("../constants.bin") && std::filesystem::exists("../commits.bin"))) {
        std::cout << "Both files not found" << std::endl;
    }

    std::vector<Row> rows = read_both_file_into_cols("../commits.bin", "../constants.bin");

    auto trace = FibVMTraceBuilder();
    std::vector<Row> new_rows = trace.build_trace_from_powdr(rows);

    bool result = trace.check_gates();
    EXPECT_EQ(result, true);
}
} // namespace proof_system::fib_vm_trace_builder_tests