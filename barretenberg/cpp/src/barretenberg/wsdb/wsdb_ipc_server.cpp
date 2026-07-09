#include "barretenberg/wsdb/wsdb_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/wsdb_execute.hpp"

#include <csignal>
#include <cstdint>
#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <unistd.h>
#include <unordered_map>
#include <vector>

#ifdef __linux__
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#endif

// Use nlohmann/json if available, otherwise minimal parsing
#include <sstream>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Platform-specific parent death monitoring
// (Same pattern as api_msgpack.cpp)
// ---------------------------------------------------------------------------

static void setup_parent_death_monitoring()
{
#ifdef __linux__
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
        std::cerr << "Warning: Could not set parent death signal" << '\n';
    }
#elif defined(__APPLE__)
    pid_t parent_pid = getppid();
    std::thread([parent_pid]() {
        int kq = kqueue();
        if (kq == -1) {
            std::cerr << "Warning: Could not create kqueue for parent monitoring" << '\n';
            return;
        }
        struct kevent change;
        EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0, nullptr);
        if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
            std::cerr << "Warning: Could not monitor parent process" << '\n';
            close(kq);
            return;
        }
        struct kevent event;
        kevent(kq, nullptr, 0, &event, 1, nullptr);
        std::cerr << "Parent process exited, shutting down..." << '\n';
        close(kq);
        std::exit(0);
    }).detach();
#endif
}

// ---------------------------------------------------------------------------
// Simple JSON-like parsing for config maps
// Parses "{0:1024,1:2048,...}" into unordered_map<uint32_t, uint64_t>
// ---------------------------------------------------------------------------

static std::unordered_map<MerkleTreeId, uint64_t> parse_tree_uint64_map(const std::string& json)
{
    std::unordered_map<MerkleTreeId, uint64_t> result;
    if (json.empty()) {
        return result;
    }
    std::string cleaned;
    for (char c : json) {
        if (c != '{' && c != '}' && c != ' ') {
            cleaned += c;
        }
    }
    std::istringstream ss(cleaned);
    std::string pair;
    while (std::getline(ss, pair, ',')) {
        auto colon_pos = pair.find(':');
        if (colon_pos != std::string::npos) {
            auto key = static_cast<MerkleTreeId>(std::stoi(pair.substr(0, colon_pos)));
            auto value = static_cast<uint64_t>(std::stoull(pair.substr(colon_pos + 1)));
            result[key] = value;
        }
    }
    return result;
}

static std::unordered_map<MerkleTreeId, uint32_t> parse_tree_uint32_map(const std::string& json)
{
    std::unordered_map<MerkleTreeId, uint32_t> result;
    if (json.empty()) {
        return result;
    }
    auto u64_map = parse_tree_uint64_map(json);
    for (const auto& [k, v] : u64_map) {
        result[k] = static_cast<uint32_t>(v);
    }
    return result;
}

static std::unordered_map<MerkleTreeId, index_t> parse_tree_index_map(const std::string& json)
{
    std::unordered_map<MerkleTreeId, index_t> result;
    if (json.empty()) {
        return result;
    }
    auto u64_map = parse_tree_uint64_map(json);
    for (const auto& [k, v] : u64_map) {
        result[k] = static_cast<index_t>(v);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Parse prefilled public data from JSON: [["slot_hex","value_hex"],...]
// Each hex string is a 64-char (32-byte) hex-encoded field element.
// ---------------------------------------------------------------------------

static fr hex_to_fr(const std::string& hex)
{
    std::string cleaned = hex;
    if (cleaned.size() >= 2 && cleaned[0] == '0' && (cleaned[1] == 'x' || cleaned[1] == 'X')) {
        cleaned = cleaned.substr(2);
    }
    return fr(cleaned);
}

static std::vector<PublicDataLeafValue> parse_prefilled_public_data(const std::string& json)
{
    std::vector<PublicDataLeafValue> result;
    if (json.empty() || json == "[]") {
        return result;
    }

    // Simple state-machine parser for [["hex","hex"],["hex","hex"],...]
    std::vector<std::string> hex_values;
    std::string current;
    bool in_string = false;

    for (char c : json) {
        if (c == '"') {
            in_string = !in_string;
        } else if (in_string) {
            current += c;
        } else if ((c == ',' || c == ']') && !current.empty()) {
            hex_values.push_back(std::move(current));
            current.clear();
        }
    }

    // hex_values should have pairs: slot, value, slot, value, ...
    if (hex_values.size() % 2 != 0) {
        std::cerr << "Warning: odd number of hex values in prefilled public data, ignoring last" << '\n';
    }
    for (size_t i = 0; i + 1 < hex_values.size(); i += 2) {
        result.emplace_back(hex_to_fr(hex_values[i]), hex_to_fr(hex_values[i + 1]));
    }
    return result;
}

// ---------------------------------------------------------------------------
// Parse prefilled nullifiers from JSON: ["nullifier_hex",...]
// Each hex string is a 64-char (32-byte) hex-encoded field element.
// ---------------------------------------------------------------------------

static std::vector<fr> parse_prefilled_nullifiers(const std::string& json)
{
    std::vector<fr> result;
    if (json.empty() || json == "[]") {
        return result;
    }

    std::string current;
    bool in_string = false;

    for (char c : json) {
        if (c == '"') {
            in_string = !in_string;
        } else if (in_string) {
            current += c;
        } else if ((c == ',' || c == ']') && !current.empty()) {
            result.push_back(hex_to_fr(current));
            current.clear();
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// IPC server execution
// ---------------------------------------------------------------------------

int execute_wsdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        const std::string& tree_heights_json,
                        const std::string& tree_prefill_json,
                        const std::string& map_sizes_json,
                        uint32_t threads,
                        uint32_t initial_header_generator_point,
                        const std::string& prefilled_public_data_json,
                        const std::string& prefilled_nullifiers_json,
                        uint64_t genesis_timestamp,
                        size_t request_ring_size,
                        size_t response_ring_size)
{
    const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;

    // Parse config
    auto tree_height = parse_tree_uint32_map(tree_heights_json);
    auto tree_prefill = parse_tree_index_map(tree_prefill_json);

    std::unordered_map<MerkleTreeId, uint64_t> map_size{
        { MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
    };
    if (!map_sizes_json.empty()) {
        auto parsed = parse_tree_uint64_map(map_sizes_json);
        for (const auto& [k, v] : parsed) {
            map_size[k] = v;
        }
    }

    // Parse prefilled public data: JSON array of ["slot_hex","value_hex"] pairs
    std::vector<PublicDataLeafValue> prefilled_public_data;
    if (!prefilled_public_data_json.empty()) {
        prefilled_public_data = parse_prefilled_public_data(prefilled_public_data_json);
        std::cerr << "Parsed " << prefilled_public_data.size() << " prefilled public data entries" << '\n';
    }

    // Parse prefilled nullifiers: JSON array of "nullifier_hex" strings. The caller (TS world-state) passes the same
    // canonical genesis nullifiers it seeds via the napi path, so the IPC genesis nullifier-tree root matches.
    std::vector<bb::fr> prefilled_nullifiers;
    if (!prefilled_nullifiers_json.empty()) {
        prefilled_nullifiers = parse_prefilled_nullifiers(prefilled_nullifiers_json);
        std::cerr << "Parsed " << prefilled_nullifiers.size() << " prefilled nullifiers" << '\n';
    }

    // Create WorldState
    std::cerr << "Creating WorldState at " << data_dir << " with " << threads << " threads" << '\n';
    auto ws = std::make_unique<WorldState>(threads,
                                           data_dir,
                                           map_size,
                                           tree_height,
                                           tree_prefill,
                                           prefilled_public_data,
                                           prefilled_nullifiers,
                                           initial_header_generator_point,
                                           genesis_timestamp);

    WsdbRequest request{ .world_state = *ws };

    // Create IPC server based on path suffix
    std::unique_ptr<ipc::IpcServer> server;

    if (input_path.size() >= 4 && input_path.substr(input_path.size() - 4) == ".shm") {
        std::string base_name = input_path.substr(0, input_path.size() - 4);
        constexpr size_t MAX_SHM_CLIENTS = 2; // TS backend (client 0) + AVM binary (client 1)
        server = ipc::IpcServer::create_mpsc_shm(base_name, MAX_SHM_CLIENTS, request_ring_size, response_ring_size);
        std::cerr << "MPSC shared memory server at " << base_name << " (max " << MAX_SHM_CLIENTS << " clients)\n";
    } else if (input_path.size() >= 5 && input_path.substr(input_path.size() - 5) == ".sock") {
        server = ipc::IpcServer::create_socket(input_path, 1);
        std::cerr << "Socket server at " << input_path << '\n';
    } else {
        std::cerr << "Error: --input path must end with .sock or .shm" << '\n';
        return 1;
    }

    // Set up signal handlers
    static ipc::IpcServer* global_server = server.get();

    auto graceful_shutdown_handler = [](int signal) {
        std::cerr << "\nReceived signal " << signal << ", shutting down gracefully..." << '\n';
        if (global_server) {
            global_server->request_shutdown();
        }
    };

    auto fatal_error_handler = [](int signal) {
        const char* signal_name = (signal == SIGBUS) ? "SIGBUS" : (signal == SIGSEGV) ? "SIGSEGV" : "UNKNOWN";
        std::cerr << "\nFatal error: received " << signal_name << '\n';
        if (global_server) {
            global_server->close();
        }
        std::exit(1);
    };

    (void)std::signal(SIGTERM, graceful_shutdown_handler);
    (void)std::signal(SIGINT, graceful_shutdown_handler);
    (void)std::signal(SIGBUS, fatal_error_handler);
    (void)std::signal(SIGSEGV, fatal_error_handler);

    setup_parent_death_monitoring();

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }

    std::cerr << "aztec-wsdb IPC server ready" << '\n';

    // Run server with wsdb command handler
    server->run([&request](int client_id, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        try {
            // Deserialize msgpack command
            // Format: [["CommandName", {payload}]] - a 1-element tuple containing the NamedUnion
            auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(raw_request.data()), raw_request.size());
            auto obj = unpacked.get();

            // Expect array of size 1 (tuple wrapping)
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
                std::cerr << "Error: Expected array of size 1 from client " << client_id << '\n';
                return {};
            }

            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            auto& command_obj = obj.via.array.ptr[0];

            // Check for shutdown before converting
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (command_obj.type == msgpack::type::ARRAY && command_obj.via.array.size == 2 &&
                command_obj.via.array.ptr[0].type == msgpack::type::STR) {
                // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
                std::string_view command_name(command_obj.via.array.ptr[0].via.str.ptr,
                                              command_obj.via.array.ptr[0].via.str.size);
                bool is_shutdown = (command_name == "WsdbShutdown");

                // Convert and execute
                WsdbCommand command;
                command_obj.convert(command);
                auto response = wsdb(request, std::move(command));

                // Serialize response
                msgpack::sbuffer response_buffer;
                msgpack::pack(response_buffer, response);
                std::vector<uint8_t> result(response_buffer.data(), response_buffer.data() + response_buffer.size());

                if (is_shutdown) {
                    throw ipc::ShutdownRequested(std::move(result));
                }

                return result;
            }

            // Fallback: try converting directly
            WsdbCommand command;
            command_obj.convert(command);
            auto response = wsdb(request, std::move(command));

            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());

        } catch (const ipc::ShutdownRequested&) {
            throw;
        } catch (const std::exception& e) {
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            std::cerr.flush();

            WsdbErrorResponse error_response{ .message = std::string(e.what()) };
            WsdbCommandResponse response = error_response;

            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());
        }
    });

    server->close();
    return 0;
}

} // namespace bb::wsdb
