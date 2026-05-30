#include "barretenberg/cdb/cli.hpp"
#include "barretenberg/cdb/generated/cdb_ipc_server.hpp"

#include "barretenberg/bb/deps/cli11.hpp"
#include <iostream>
#include <string>

namespace bb::cdb {

int parse_and_run_cdb(int argc, char* argv[])
{
    CLI::App app{ "aztec-cdb: Contract database schema provider" };
    app.require_subcommand(1);

    // -----------------------------------------------------------------------
    // Subcommand: msgpack
    // -----------------------------------------------------------------------
    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");

    // msgpack schema
    CLI::App* msgpack_schema_command =
        msgpack_command->add_subcommand("schema", "Output a msgpack schema encoded as JSON to stdout.");

    // Parse CLI
    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    try {
        if (msgpack_schema_command->parsed()) {
            std::cout << get_cdb_schema_as_json() << std::endl;
            return 0;
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }

    return 0;
}

} // namespace bb::cdb
