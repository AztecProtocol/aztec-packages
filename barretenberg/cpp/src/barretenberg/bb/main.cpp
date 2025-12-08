#include "barretenberg/bb/cli.hpp"
#include "barretenberg/env/memory_limit.hpp"

int main(int argc, char* argv[])
{
    // Initialize memory limit early before significant allocations
    bb::initialize_memory_limit();

    return bb::parse_and_run_cli_command(argc, argv);
}
