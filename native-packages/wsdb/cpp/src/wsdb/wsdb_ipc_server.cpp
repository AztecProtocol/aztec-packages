#include "wsdb/wsdb_ipc_server.hpp"
#include "wsdb/generated/wsdb_ipc_server.hpp"

#include <iostream>
#include <string>

namespace azteclabs::wsdb {

int execute_wsdb_server(const std::string& input_path, size_t request_ring_size, size_t response_ring_size)
{
    ServeOptions options;
    // TS backend (client 0) + the AVM simulator pool (one connection per bb-avm-sim process). Sized to cover a
    // default-size pool with headroom so SHM isn't capped to a single AVM client. (UDS, the default transport, is
    // unaffected: it admits connections via the listen backlog.)
    options.server.max_shm_clients = 8;
    options.server.shm_request_ring_size = request_ring_size;
    options.server.shm_response_ring_size = response_ring_size;
    // serve() listens before making the service, and the service's Init opens LMDB and prefills genesis, which can
    // take arbitrarily long on a loaded machine: clients connect into the backlog meanwhile, so their connect
    // backstop only covers exec, linking and reaching listen().
    std::cerr << "aztec-wsdb serving " << input_path << '\n';
    serve(input_path, options);
    return 0;
}

} // namespace azteclabs::wsdb
