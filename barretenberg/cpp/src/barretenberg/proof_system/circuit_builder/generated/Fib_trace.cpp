#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/arithmetization/arithmetization.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/types.h>
#include <vector>

#include "./Fib_trace.hpp"

#include "barretenberg/relations/generated/Fib.hpp"

using namespace barretenberg;

namespace proof_system {

using Row = Fib_vm::Row<barretenberg::fr>;

void FibTraceBuilder::build_circuit()
{
    {
        // Build up the rows
        size_t n = 16;
        // Build the is_last column

        // Add first row that makes the shifted cols 0
        Row first_row = Row{ .Fibonacci_FIRST = 1 };
        rows.push_back(first_row);

        // The actual first row
        Row row = {
            .Fibonacci_x = 0,
            .Fibonacci_y = 1,
        };
        rows.push_back(row);

        for (size_t i = 2; i < n; i++) {
            Row prev_row = rows[i - 1];

            FF x = prev_row.Fibonacci_y;
            FF y = prev_row.Fibonacci_x + prev_row.Fibonacci_y;
            Row row = {
                .Fibonacci_x = x,
                .Fibonacci_y = y,
            };
            rows.push_back(row);
        }
        // Build the isLast row
        rows[n - 1].Fibonacci_LAST = 1;

        // Build the shifts
        for (size_t i = 1; i < n; i++) {
            Row& row = rows[i - 1];
            row.Fibonacci_x_shift = rows[(i) % rows.size()].Fibonacci_x;
            row.Fibonacci_y_shift = rows[(i) % rows.size()].Fibonacci_y;
        }
        // info("Each row");
        // for (size_t i = 0; i < rows.size(); i++) {
        //     auto row = rows[i];
        //     info("Row ", i, " ", "first", row.Fibonacci_FIRST, " last", row.Fibonacci_LAST, " x", row.Fibonacci_x,
        //          " y", row.Fibonacci_y, " x_shift", row.Fibonacci_x_shift, " y_shift", row.Fibonacci_y_shift);
        // }
        // info("Built circuit with ", rows.size(), " rows");
    }
}
} // namespace proof_system