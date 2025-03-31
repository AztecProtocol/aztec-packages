#include <benchmark/benchmark.h>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/bb/cli.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/common/std_string.hpp"

namespace {
// Benches the bb cli/main.cpp functionality by parsing MAIN_ARGS.
void benchmark_bb_cli(benchmark::State& state)
{
    // Get MAIN_ARGS from environment
    const char* main_args_env = std::getenv("MAIN_ARGS");
    if (main_args_env == nullptr) {
        throw std::runtime_error("Environment variable MAIN_ARGS must be set");
    }

    // Parse the space-delimited arguments
    std::vector<std::string> args = bb::detail::split(main_args_env, ' ');

    // Add the program name to the arguments
    args.insert(args.begin(), "bb");

    if (args.empty()) {
        throw std::runtime_error("MAIN_ARGS must contain at least one argument");
    }

    // Convert to C-style argc/argv
    std::vector<char*> argv(args.size());

    // Convert each string to char* for the argv array
    for (size_t i = 0; i < args.size(); ++i) {
        // NOLINTNEXTLINE
        argv[i] = const_cast<char*>(args[i].c_str());
    }

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);

        // Call the main function with the parsed arguments
        int result = bb::parse_and_run_cli_command(static_cast<int>(args.size()), argv.data());
        if (result != 0) {
            exit(result);
        }
    }
}

BENCHMARK(benchmark_bb_cli)->Iterations(1)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
