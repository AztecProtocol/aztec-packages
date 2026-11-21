// SQLite3 Multiple Ciphers, compiled with its exported symbols renamed (aztec_sqlite_prefix.h; see
// scripts/vendor.sh) and the options kv-sqlite builds it with (native-packages/kv-sqlite/cpp/CMakeLists.txt).
#define SQLITE_THREADSAFE 1
#define SQLITE_DQS 0
#define SQLITE_OMIT_LOAD_EXTENSION 1
#define SQLITE_OMIT_SHARED_CACHE 1
#define SQLITE_DEFAULT_MEMSTATUS 0
#define SQLITE_LIKE_DOESNT_MATCH_BLOBS 1

#include "aztec_sqlite_prefix.h"

#include "sqlite3mc_amalgamation.c"
