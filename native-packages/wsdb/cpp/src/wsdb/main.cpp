#include "wsdb/cli.hpp"

int main(int argc, char* argv[])
{
    return bb::wsdb::parse_and_run_wsdb(argc, argv);
}
