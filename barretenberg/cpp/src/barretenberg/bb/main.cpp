#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#pragma clang diagnostic ignored "-Wshorten-64-to-32"
#pragma clang diagnostic ignored "-Wunused-parameter"
#include "barretenberg/bb/cli.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"

int main(int argc, char* argv[])
{
    return bb::parse_and_run_cli_command(argc, argv);
}
