#include "barretenberg/bb/cli.hpp"
#include "barretenberg/env/memory_limit.hpp"
#include <cstring>

int main(int argc, char* argv[])
{
    // Check if this is an AVM command (needs higher memory limit)
    bool is_avm = false;
    for (int i = 1; i < argc; i++) {
        if (std::strcmp(argv[i], "avm_prove") == 0 || std::strcmp(argv[i], "avm_verify") == 0 ||
            std::strcmp(argv[i], "avm_check_circuit") == 0) {
            is_avm = true;
            break;
        }
    }

    // Initialize memory limit early before significant allocations
    // Regular proving: 16GB, AVM: 64GB (conservative)
    bb::initialize_memory_limit(is_avm);

    return bb::parse_and_run_cli_command(argc, argv);
}
