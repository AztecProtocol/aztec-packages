#include "barretenberg/avm/cli.hpp"
#include "barretenberg/avm/avm_ipc_server.hpp"
#include "barretenberg/common/log.hpp"

#include "barretenberg/bb/deps/cli11.hpp"
#include <iostream>
#include <string>

namespace bb::avm {

int parse_and_run_avm(int argc, char* argv[])
{
    CLI::App app{ "aztec-avm: Standalone AVM simulator server" };
    app.require_subcommand(1);

    // -----------------------------------------------------------------------
    // Subcommand: msgpack run
    // -----------------------------------------------------------------------
    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");
    CLI::App* msgpack_run_command = msgpack_command->add_subcommand("run", "Start the AVM simulator IPC server.");

    std::string input_path;
    msgpack_run_command->add_option("-i,--input", input_path, "IPC socket path (.sock)")->required();

    std::string wsdb_path;
    msgpack_run_command->add_option("--wsdb", wsdb_path, "WSDB server socket path")->required();

    std::string cdb_path;
    msgpack_run_command->add_option("--cdb", cdb_path, "CDB server socket path")->required();

    // Parse CLI
    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    try {
        if (msgpack_run_command->parsed()) {
            return execute_avm_server(input_path, wsdb_path, cdb_path);
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }

    return 0;
}

} // namespace bb::avm
