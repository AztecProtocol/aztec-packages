#include "barretenberg/kvdb/cli.hpp"

int main(int argc, char* argv[])
{
    return bb::kvdb::parse_and_run_kvdb(argc, argv);
}
