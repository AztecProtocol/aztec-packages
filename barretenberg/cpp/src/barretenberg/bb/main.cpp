#include "barretenberg/bb/cli.hpp"

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#endif

int main(int argc, char* argv[])
{
#ifdef _WIN32
    // stdin/stdout carry binary data (`-` paths, the msgpack API, curve constants), but the CRT
    // opens them in text mode, which stops reads at 0x1A and rewrites 0x0A.
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    return bb::parse_and_run_cli_command(argc, argv);
}
