#include "barretenberg/avm/cli.hpp"

int main(int argc, char* argv[])
{
    return bb::avm::parse_and_run_avm(argc, argv);
}
