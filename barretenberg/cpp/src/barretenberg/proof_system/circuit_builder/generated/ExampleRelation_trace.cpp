#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/types.h>
#include <vector>

#include "barretenberg/proof_system/relations/generated/ExampleRelation.hpp"

using namespace barretenberg;
// using fr = barretenberg::fr;

namespace proof_system {

using Row = ExampleRelation_vm::Row<fr>;
inline fr read_field(std::ifstream& file)
{
    uint8_t buffer[32];
    file.read(reinterpret_cast<char*>(buffer), 32);

    // swap it to big endian ???? TODO: create utility
    for (int n = 0, m = 31; n < m; ++n, --m) {
        std::swap(buffer[n], buffer[m]);
    }

    return fr::serialize_from_buffer(buffer);
}

inline std::vector<Row> read_both_file_into_cols(std::string const& commited_filename,
                                                 std::string const& constants_filename)
{
    std::vector<Row> rows;

    // open both files
    std::ifstream commited_file(commited_filename, std::ios::binary);
    if (!commited_file) {
        std::cout << "Error opening commited file" << std::endl;
        return {};
    }

    std::ifstream constant_file(constants_filename, std::ios::binary);
    if (!constant_file) {
        std::cout << "Error opening constant file" << std::endl;
        return {};
    }

    // Add a first row of all 0s except the one that does not need to be shifted?
    auto emptyRow = Row{
        .Fibonacci_ISLAST = fr(1),
        .Fibonacci_x = fr(0),
        .Fibonacci_y = fr(0),
        .Fibonacci_x_shift = fr(0),
        .Fibonacci_y_shift = fr(0),
    };
    rows.push_back(emptyRow);

    // We are assuming that the two files are the same length
    while (commited_file) {
        Row current_row = {};

        current_row.Fibonacci_ISLAST = read_field(constant_file);

        current_row.Fibonacci_x = read_field(commited_file);

        current_row.Fibonacci_y = read_field(commited_file);

        rows.push_back(current_row);
    }

    // remove the last row - TODO: BUG!
    rows.pop_back();

    // Build out shifts from collected rows
    for (size_t i = 1; i < rows.size(); ++i) {
        Row& row = rows[i - 1];

        row.Fibonacci_x_shift = rows[(i) % rows.size()].Fibonacci_x;
        row.Fibonacci_y_shift = rows[(i) % rows.size()].Fibonacci_y;

        // row.Fibonacci_x_shift = rows[(i + 1) % rows.size()].Fibonacci_x;
        // row.Fibonacci_y_shift = rows[(i + 1) % rows.size()].Fibonacci_y;
    }

    return rows;
}

} // namespace proof_system
