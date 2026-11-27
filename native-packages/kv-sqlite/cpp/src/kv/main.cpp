// kv-sqlite: serves one store over ipc-runtime.
//
// Usage: kv-sqlite msgpack run --input <path>
//
// `--input` is where to serve (a socket, or shared memory for a `.shm` path). The store is opened by the first
// command, Init.
#include "generated/kv_ipc_server.hpp"

#include <exception>
#include <iostream>
#include <string_view>

int main(int argc, char** argv)
{
    const char* input = nullptr;
    bool msgpack_run = argc >= 3 && std::string_view(argv[1]) == "msgpack" && std::string_view(argv[2]) == "run";
    for (int i = 3; i < argc - 1; i++) {
        if (std::string_view(argv[i]) == "--input") {
            input = argv[i + 1];
        }
    }
    if (!msgpack_run || input == nullptr) {
        std::cerr << "usage: kv-sqlite msgpack run --input <path>\n";
        return 2;
    }
    try {
        aztec::kv::serve(input);
    } catch (const std::exception& e) {
        std::cerr << "kv-sqlite: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
