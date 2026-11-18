// An instance of the in-process aztec-wsdb library (libaztec_wsdb): the WsdbService the IPC server runs, with no
// transport, configured like it by Init. One instance takes calls from many threads at once.
#include "wsdb/generated/wsdb_ffi.hpp"
#include "wsdb/wsdb_service.hpp"

#include <memory>
#include <span>
#include <utility>

namespace azteclabs::wsdb {

namespace {

class WsdbFfiInstance final : public FfiInstance {
  public:
    WsdbFfiInstance()
        // No transport, so no request is ever waiting to be read: an idle read always runs on its caller.
        : service_([] { return false; })
        // The FFI call returns the response, but a write answers later from the service's pool: wait for it.
        , dispatcher_([this](std::span<const uint8_t> request, RawRespond respond) { respond(service_.call(request)); })
    {}

    AsyncDispatchHandler& dispatcher() override { return dispatcher_; }

  private:
    WsdbService service_;
    AsyncDispatchHandler dispatcher_;
};

} // namespace

std::unique_ptr<FfiInstance> ipc_ffi_create_instance()
{
    return std::make_unique<WsdbFfiInstance>();
}

} // namespace azteclabs::wsdb
