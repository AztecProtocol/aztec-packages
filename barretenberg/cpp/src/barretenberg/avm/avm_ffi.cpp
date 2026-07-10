#include "barretenberg/avm/avm_ffi.h"

#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"
#include "ipc_codegen/in_process.hpp"

#include <chrono>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <thread>
#include <vector>

// Opaque handle: owns the per-instance context the AVM dispatch reads from.
// Kept a name-only C type in the header so no C++ leaks across the ABI.
struct avm_instance {
    std::unique_ptr<bb::wsdb::WsdbIpcClient> wsdb;
    std::unique_ptr<bb::cdb::CdbIpcContractDB> cdb;
};

namespace {

constexpr int MAX_RETRIES = 50;
constexpr int RETRY_DELAY_MS = 100;

// Connect with retry, mirroring bb-avm-sim's execute_avm_server: the servers may
// still be coming up when the instance is created.
template <typename Ctor> auto connect_with_retry(Ctor&& ctor) -> decltype(ctor())
{
    for (int attempt = 0; attempt < MAX_RETRIES; ++attempt) {
        try {
            return ctor();
        } catch (const std::exception&) {
            if (attempt == MAX_RETRIES - 1) {
                throw;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(RETRY_DELAY_MS));
        }
    }
    throw std::runtime_error("connect_with_retry: unreachable");
}

} // namespace

extern "C" {

avm_instance_t* avm_create_ipc(const char* wsdb_path, const char* cdb_path)
{
    if (wsdb_path == nullptr || cdb_path == nullptr) {
        return nullptr;
    }
    try {
        auto instance = std::make_unique<avm_instance>();
        instance->wsdb =
            connect_with_retry([&] { return std::make_unique<bb::wsdb::WsdbIpcClient>(std::string(wsdb_path)); });
        instance->cdb =
            connect_with_retry([&] { return std::make_unique<bb::cdb::CdbIpcContractDB>(std::string(cdb_path)); });
        return instance.release();
    } catch (...) {
        return nullptr;
    }
}

int avm_call(avm_instance_t* instance, const uint8_t* request, size_t request_len, uint8_t** out, size_t* out_len)
{
    if (instance == nullptr || out == nullptr || out_len == nullptr) {
        return -1;
    }
    try {
        bb::avm::AvmRequest req{ .cdb_client = *instance->cdb, .wsdb_client = *instance->wsdb };
        auto handler = bb::avm::make_avm_handler(req);
        std::span<const uint8_t> request_span(request, request_len);
        std::vector<uint8_t> response = ipc_codegen::dispatch_sync(handler, request_span);

        // malloc so the caller (and the FFI backend's free()) owns it across the
        // C ABI. Allocate at least 1 byte so a zero-length response still yields
        // a non-null pointer to free.
        auto* buffer = static_cast<uint8_t*>(std::malloc(response.empty() ? 1 : response.size()));
        if (buffer == nullptr) {
            return -1;
        }
        std::memcpy(buffer, response.data(), response.size());
        *out = buffer;
        *out_len = response.size();
        return 0;
    } catch (...) {
        return -1;
    }
}

void avm_destroy(avm_instance_t* instance)
{
    delete instance;
}

} // extern "C"
