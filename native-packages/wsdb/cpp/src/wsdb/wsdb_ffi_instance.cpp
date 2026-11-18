// An instance of the in-process aztec-wsdb library (libaztec_wsdb): the WsdbService the IPC server runs, with no
// transport. Calls run on their callers' threads, several at once: reads run inline on the caller when the
// scheduler is idle and on its pool otherwise, and writes run on the pool, so the generated call waits for them.
#include "wsdb/generated/wsdb_ffi.hpp"
#include "wsdb/wsdb_service.hpp"

#include <CLI/CLI.hpp>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace azteclabs::wsdb {

namespace {

class WsdbFfiInstance final : public FfiInstance {
  public:
    explicit WsdbFfiInstance(const WsdbConfig& config)
        // No transport, so no request is ever waiting to be read: an idle read always runs on its caller.
        : service_(config, [] { return false; })
    {}

    AsyncDispatchHandler& dispatcher() override { return service_.handler(); }

  private:
    WsdbService service_;
};

} // namespace

std::unique_ptr<FfiInstance> ipc_ffi_create_instance(std::span<const char* const> args)
{
    CLI::App app{ "aztec_wsdb" };
    WsdbConfig config;
    add_wsdb_config_options(app, config);
    std::vector<std::string> argv(args.rbegin(), args.rend());
    try {
        app.parse(argv);
    } catch (const CLI::ParseError& e) {
        // The FFI returns null for a refused instance; say why.
        std::cerr << "aztec_wsdb: " << e.what() << '\n';
        throw std::invalid_argument(e.what());
    }
    return std::make_unique<WsdbFfiInstance>(config);
}

} // namespace azteclabs::wsdb
