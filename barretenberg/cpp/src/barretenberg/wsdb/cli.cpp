#include "barretenberg/wsdb/cli.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/wsdb/wsdb_execute.hpp"
#include "barretenberg/wsdb/wsdb_ipc_server.hpp"

#include "barretenberg/bb/deps/cli11.hpp"
#include <cstdint>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

namespace {

struct WsdbApi {
    WsdbCommand commands;
    WsdbCommandResponse responses;
    SERIALIZATION_FIELDS(commands, responses);
};

std::string get_wsdb_schema_as_json()
{
    return msgpack_schema_to_string(WsdbApi{});
}

} // namespace

int parse_and_run_wsdb(int argc, char* argv[])
{
    CLI::App app{ "aztec-wsdb: Standalone world state database server" };
    app.require_subcommand(1);

    // -----------------------------------------------------------------------
    // Subcommand: msgpack
    // -----------------------------------------------------------------------
    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");

    // msgpack schema
    CLI::App* msgpack_schema_command =
        msgpack_command->add_subcommand("schema", "Output a msgpack schema encoded as JSON to stdout.");

    // msgpack run
    CLI::App* msgpack_run_command =
        msgpack_command->add_subcommand("run", "Start the world state database IPC server.");

    std::string input_path;
    msgpack_run_command->add_option(
        "-i,--input", input_path, "IPC socket/shm path (.sock for UDS, .shm for shared memory)");

    std::string data_dir;
    msgpack_run_command->add_option("-d,--data-dir", data_dir, "Data directory for LMDB stores")->required();

    // Tree heights (JSON map: treeId -> height)
    std::string tree_heights_json;
    msgpack_run_command->add_option("--tree-heights", tree_heights_json, "Tree heights as JSON: {0:40,1:32,...}");

    // Tree prefill sizes
    std::string tree_prefill_json;
    msgpack_run_command->add_option(
        "--tree-prefill", tree_prefill_json, "Tree prefill sizes as JSON: {0:128,2:128,...}");

    // Map sizes (KB)
    std::string map_sizes_json;
    msgpack_run_command->add_option("--map-sizes", map_sizes_json, "LMDB map sizes in KB as JSON: {0:1024,...}");

    uint32_t threads = 16;
    msgpack_run_command->add_option("-t,--threads", threads, "Thread pool size (default: 16)")
        ->check(CLI::PositiveNumber);

    uint32_t initial_header_generator_point = 0;
    msgpack_run_command->add_option(
        "--initial-header-generator-point", initial_header_generator_point, "Header generator point (default: 0)");

    // Prefilled public data as JSON array of [slot_hex, value_hex] pairs
    std::string prefilled_public_data_json;
    msgpack_run_command->add_option(
        "--prefilled-public-data", prefilled_public_data_json, "Prefilled public data as JSON array");

    uint64_t genesis_timestamp = 0;
    msgpack_run_command->add_option("--genesis-timestamp", genesis_timestamp, "Genesis block timestamp (default: 0)");

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
        if (msgpack_schema_command->parsed()) {
            std::cout << get_wsdb_schema_as_json() << std::endl;
            return 0;
        }

        if (msgpack_run_command->parsed()) {
            return execute_wsdb_server(input_path,
                                       data_dir,
                                       tree_heights_json,
                                       tree_prefill_json,
                                       map_sizes_json,
                                       threads,
                                       initial_header_generator_point,
                                       prefilled_public_data_json,
                                       genesis_timestamp,
                                       request_ring_size,
                                       response_ring_size);
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }

    return 0;
}

} // namespace bb::wsdb
