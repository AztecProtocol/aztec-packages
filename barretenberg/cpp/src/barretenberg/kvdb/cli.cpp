#include "barretenberg/kvdb/cli.hpp"

#include "barretenberg/bb/deps/cli11.hpp"
#include "barretenberg/kvdb/generated/kvdb_ipc_server.hpp"
#include "barretenberg/kvdb/kvdb_ipc_server.hpp"

#include <cstdint>
#include <iostream>
#include <string>

namespace bb::kvdb {

int parse_and_run_kvdb(int argc, char* argv[])
{
    CLI::App app{ "aztec-kvdb: Standalone LMDB-backed key-value store server" };
    app.require_subcommand(1);

    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");
    CLI::App* msgpack_schema_command =
        msgpack_command->add_subcommand("schema", "Output a msgpack schema encoded as JSON to stdout.");
    CLI::App* msgpack_run_command = msgpack_command->add_subcommand("run", "Start the kvdb IPC server.");

    std::string input_path;
    msgpack_run_command->add_option(
        "-i,--input", input_path, "IPC socket/shm path (.sock for UDS, .shm for shared memory)");

    std::string data_dir;
    msgpack_run_command->add_option("-d,--data-dir", data_dir, "Data directory for LMDB store")->required();

    uint64_t map_size_bytes = 1024UL * 1024;
    msgpack_run_command->add_option("--map-size", map_size_bytes, "LMDB map size in bytes (default: 1 MiB)")
        ->check(CLI::PositiveNumber);

    uint32_t max_readers = 16;
    msgpack_run_command->add_option("--max-readers", max_readers, "LMDB max readers (default: 16)")
        ->check(CLI::PositiveNumber);

    size_t request_ring_size = 1024UL * 1024;
    msgpack_run_command
        ->add_option(
            "--request-ring-size", request_ring_size, "Request ring buffer size for shared memory IPC (default: 1MB)")
        ->check(CLI::PositiveNumber);

    size_t response_ring_size = 1024UL * 1024;
    msgpack_run_command
        ->add_option("--response-ring-size",
                     response_ring_size,
                     "Response ring buffer size for shared memory IPC (default: 1MB)")
        ->check(CLI::PositiveNumber);

    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    try {
        if (msgpack_schema_command->parsed()) {
            std::cout << get_kvdb_schema_as_json() << std::endl;
            return 0;
        }

        if (msgpack_run_command->parsed()) {
            return execute_kvdb_server(
                input_path, data_dir, map_size_bytes, max_readers, request_ring_size, response_ring_size);
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }

    return 0;
}

} // namespace bb::kvdb
