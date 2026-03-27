#include "barretenberg/cdb/cli.hpp"

#include "barretenberg/bb/deps/cli11.hpp"
#include <iostream>
#include <string>

namespace bb::cdb {

int parse_and_run_cdb(int argc, char* argv[])
{
    CLI::App app{ "aztec-cdb: Contract database IPC server" };
    app.require_subcommand(1);

    // Parse CLI
    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    return 0;
}

} // namespace bb::cdb
