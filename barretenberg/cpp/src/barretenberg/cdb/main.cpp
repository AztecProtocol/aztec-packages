#include "barretenberg/cdb/cli.hpp"

int main(int argc, char* argv[])
{
    return bb::cdb::parse_and_run_cdb(argc, argv);
}
