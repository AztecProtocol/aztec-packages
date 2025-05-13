#include <benchmark/benchmark.h>
#include <cstdlib>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/bb/cli.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/common/std_string.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

namespace {
// This is used to suppress the default output of Google Benchmark.
// This is useful to run this benchmark without altering the stdout result of our simulated bb cli command.
// We instead use the `--benchmark_out` flag to output the results to a file.
class ConsoleNoOutputReporter : public benchmark::BenchmarkReporter {
  public:
    // We return `true` here to indicate "keep running" if there are multiple benchmark suites.
    bool ReportContext(const Context&) override { return true; }

    // Called once for each run. We just do nothing here.
    void ReportRuns(const std::vector<Run>&) override {}

    // Called at the end. Also do nothing.
    void Finalize() override {}
};

// Benches the bb cli/main.cpp functionality by parsing MAIN_ARGS.
void benchmark_bb_cli(benchmark::State& state)
{
    // Get MAIN_ARGS from environment
    const char* main_args_env = std::getenv("MAIN_ARGS");
    if (main_args_env == nullptr) {
        throw_or_abort("Environment variable MAIN_ARGS must be set");
    }

    // Parse the space-delimited arguments
    std::vector<std::string> args = bb::detail::split(main_args_env, ' ');

    // Add the program name to the arguments
    args.insert(args.begin(), "bb");

    if (args.empty()) {
        throw_or_abort("MAIN_ARGS must contain at least one argument");
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

int main(int argc, char** argv)
{
    ::benchmark ::Initialize(&argc, argv);
    if (::benchmark ::ReportUnrecognizedArguments(argc, argv)) {
        return 1;
    }
    auto report = std::make_unique<ConsoleNoOutputReporter>();
    ::benchmark ::RunSpecifiedBenchmarks(report.get());
    ::benchmark ::Shutdown();
    return 0;
}
