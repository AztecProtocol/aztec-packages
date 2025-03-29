#include <benchmark/benchmark.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/bb/cli.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"

namespace {
// Benches the bb cli/main.cpp functionality by parsing MAIN_ARGS.
void benchmark_bb_cli_user_provided(benchmark::State& state)
{
    // Get MAIN_ARGS from environment
    const char* main_args_env = std::getenv("MAIN_ARGS");
    if (main_args_env == nullptr) {
        throw std::runtime_error("Environment variable MAIN_ARGS must be set");
    }

    // Parse the space-delimited arguments
    std::string args_str(main_args_env);
    std::istringstream args_stream(args_str);
    std::vector<std::string> args;
    std::string arg;

    // Parse into vector of strings
    while (args_stream >> arg) {
        args.push_back(arg);
    }

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

        // Use result to prevent compiler optimization
        benchmark::DoNotOptimize(result);
    }
}

BENCHMARK(benchmark_bb_cli_user_provided)->Iterations(1)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
