// kv-sqlite's service (native-packages/kv-sqlite), the PXE's store, as the app links it: its sources and its
// generated FFI (kv_sqlite_ipc_ffi_*), vendored into third_party/kv-sqlite by scripts/vendor.sh, in one unit, so
// the app's build needs no list of them. SQLite's names are renamed as sqlite3mc_unit.c compiles them.
#define MSGPACK_NO_BOOST
#define MSGPACK_USE_STD_VARIANT_ADAPTOR

#include "aztec_sqlite_prefix.h"

#include "store.cpp"
#include "files_native.cpp"
#include "kv_service.cpp"
#include "generated/kv_ffi.cpp"
