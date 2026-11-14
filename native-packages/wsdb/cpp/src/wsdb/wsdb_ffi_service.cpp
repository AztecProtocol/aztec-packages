// The in-process aztec-wsdb behind the generated FFI entry (wsdb_labs_ipc_ffi_entry): the same WsdbService the IPC server runs,
// called on the caller's thread with no transport. The caller opens it once with the `msgpack run` options.
#include "wsdb/wsdb_ffi_service.hpp"
#include "wsdb/wsdb_service.hpp"

#include <CLI/CLI.hpp>
#include <condition_variable>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace azteclabs::wsdb {

namespace {
std::unique_ptr<WsdbService>& ffi_service()
{
    static std::unique_ptr<WsdbService> service;
    return service;
}
} // namespace

AsyncDispatchHandler& ipc_ffi_dispatcher()
{
    // The FFI entry takes its response before it returns, but handlers may respond later from a pool thread, so the
    // caller waits here. The caller's thread does the IPC reactor's job: reads run inline on it when idle.
    static AsyncDispatchHandler handler = [](std::span<const uint8_t> request, RawRespond respond) {
        auto& service = ffi_service();
        if (!service) {
            respond(detail::make_error("aztec-wsdb FFI: call wsdb_labs_ffi_open first"));
            return;
        }
        std::mutex mtx;
        std::condition_variable cv;
        std::optional<std::vector<uint8_t>> response;
        service->handler()(request, [&](std::vector<uint8_t> frame) {
            std::lock_guard<std::mutex> lock(mtx);
            response = std::move(frame);
            cv.notify_one();
        });
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [&] { return response.has_value(); });
        respond(std::move(*response));
    };
    return handler;
}

} // namespace azteclabs::wsdb

IPC_FFI_EXPORT int wsdb_labs_ffi_open(int argc, const char* const* args)
{
    using namespace azteclabs::wsdb;
    if (ffi_service()) {
        std::cerr << "wsdb_labs_ffi_open: already open" << '\n';
        return 1;
    }
    CLI::App app{ "wsdb FFI" };
    WsdbConfig config;
    add_wsdb_config_options(app, config);
    std::vector<const char*> argv{ "wsdb_ffi" };
    argv.insert(argv.end(), args, args + argc);
    try {
        app.parse(static_cast<int>(argv.size()), argv.data());
        ffi_service() = std::make_unique<WsdbService>(config, []() { return false; });
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    } catch (const std::exception& e) {
        std::cerr << "wsdb_labs_ffi_open: " << e.what() << '\n';
        return 1;
    }
    return 0;
}

IPC_FFI_EXPORT void wsdb_labs_ffi_close()
{
    azteclabs::wsdb::ffi_service().reset();
}
