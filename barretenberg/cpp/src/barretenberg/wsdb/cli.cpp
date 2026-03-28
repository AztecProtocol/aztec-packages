#include "barretenberg/wsdb/cli.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/wsdb/wsdb_ipc_server.hpp"

#include "barretenberg/bb/deps/cli11.hpp"
#include <cstdint>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

namespace bb::wsdb {

int parse_and_run_wsdb(int argc, char* argv[])
{
    CLI::App app{ "aztec-wsdb: Standalone world state database server" };
    app.require_subcommand(1);

    auto* msgpack_run_command = app.add_subcommand("msgpack run", "Start the IPC server");

    std::string input_path;
    msgpack_run_command->add_option("--input", input_path, "Socket path (.sock)")->required();

    std::string data_dir;
    msgpack_run_command->add_option("--data-dir", data_dir, "Data directory for LMDB stores")->required();

    uint32_t threads = 16;
    msgpack_run_command->add_option("--threads", threads, "Number of worker threads (default: 16)");

    std::string tree_heights_json;
    msgpack_run_command->add_option("--tree-heights", tree_heights_json, "Tree heights as JSON map")->required();

    std::string tree_prefill_json;
    msgpack_run_command->add_option("--tree-prefill", tree_prefill_json, "Tree prefill counts as JSON map");

    std::string map_sizes_json;
    msgpack_run_command->add_option("--map-sizes", map_sizes_json, "LMDB map sizes as JSON map");

    uint32_t initial_header_generator_point = 0;
    msgpack_run_command->add_option(
        "--initial-header-generator-point", initial_header_generator_point, "Initial header generator point");

    // Prefilled public data as JSON array of [slot_hex, value_hex] pairs
    std::string prefilled_public_data_json;
    msgpack_run_command->add_option(
        "--prefilled-public-data", prefilled_public_data_json, "Prefilled public data as JSON array");

    // Parse CLI
    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    try {
        if (msgpack_run_command->parsed()) {
            return execute_wsdb_server(input_path,
                                       data_dir,
                                       tree_heights_json,
                                       tree_prefill_json,
                                       map_sizes_json,
                                       threads,
                                       initial_header_generator_point,
                                       prefilled_public_data_json);
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }

    return 0;
}

} // namespace bb::wsdb
