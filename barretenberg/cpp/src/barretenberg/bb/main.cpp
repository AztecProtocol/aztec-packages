#include "barretenberg/bb/cli.hpp"
#include <jemalloc/jemalloc.h>

int main(int argc, char* argv[])
{
    int result = bb::parse_and_run_cli_command(argc, argv);
    return result;
}
