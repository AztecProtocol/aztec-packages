#include "wsdb/cli.hpp"
#include "common/assert.hpp"
#include "common/log.hpp"
#include <msgpack.hpp>
#include "world_state/world_state.hpp"
#include "wsdb/generated/wsdb_ipc_server.hpp"
#include "wsdb/wsdb_ipc_server.hpp"
#include "wsdb/wsdb_service.hpp"

#include <CLI/CLI.hpp>
#include <cstdint>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

namespace azteclabs::wsdb {

using namespace azteclabs::wsdb::world_state;
using namespace azteclabs::wsdb::merkle_tree;

int parse_and_run_wsdb(int argc, char* argv[])
{
    CLI::App app{ "aztec-wsdb: Standalone world state database server" };
    app.require_subcommand(1);

    // -----------------------------------------------------------------------
    // Subcommand: msgpack
    // -----------------------------------------------------------------------
    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");

    // msgpack run
    CLI::App* msgpack_run_command =
        msgpack_command->add_subcommand("run", "Start the world state database IPC server.");

    std::string input_path;
    msgpack_run_command->add_option(
        "-i,--input", input_path, "IPC socket/shm path (.sock for UDS, .shm for shared memory)");

    WsdbConfig config;
    add_wsdb_config_options(*msgpack_run_command, config);

    size_t request_ring_size = 1024 * 1024;
    msgpack_run_command
        ->add_option(
            "--request-ring-size", request_ring_size, "Request ring buffer size for shared memory IPC (default: 1MB)")
        ->check(CLI::PositiveNumber);

    size_t response_ring_size = 1024 * 1024;
    msgpack_run_command
        ->add_option("--response-ring-size",
                     response_ring_size,
                     "Response ring buffer size for shared memory IPC (default: 1MB)")
        ->check(CLI::PositiveNumber);

    // Parse CLI
    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    try {
        if (msgpack_run_command->parsed()) {
            return execute_wsdb_server(input_path, config, request_ring_size, response_ring_size);
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }

    return 0;
}

} // namespace azteclabs::wsdb
