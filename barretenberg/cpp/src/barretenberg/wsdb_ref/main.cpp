/**
 * @file main.cpp
 * @brief The wsdb-ref binary: wsdb-ref served over IPC, for a client that runs its world state as a process.
 *
 * `wsdb-ref msgpack run --input <path>` serves one reference world state on a .sock or .shm path until a
 * shutdown signal. It starts at the canonical genesis; a client sends InitGenesis for another.
 */
#include "barretenberg/bb/deps/cli11.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/wsdb_ref/wsdb_ref_handlers.hpp"

#include "barretenberg/wsdb_ref/generated/wsdb_ipc_server.hpp"

#include <string>

int main(int argc, char* argv[])
{
    CLI::App app{ "wsdb-ref: the reference world state served over IPC" };
    app.require_subcommand(1);
    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");
    CLI::App* run_command = msgpack_command->add_subcommand("run", "Start the wsdb-ref IPC server.");
    std::string input_path;
    run_command->add_option("-i,--input", input_path, "IPC socket/shm path (.sock or .shm)")->required();
    CLI11_PARSE(app, argc, argv);

    try {
        bb::wsdb_ref::WsdbRefContext ctx;
        bb::wsdb_ref::serve(input_path, ctx);
    } catch (const std::exception& e) {
        info("Error: ", e.what());
        return 1;
    }
    return 0;
}
