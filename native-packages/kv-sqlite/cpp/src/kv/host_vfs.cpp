// The wasm build's SQLite VFS (SQLITE_OS_OTHER): a wasm module has no file system, so every file operation is a
// call to the host's `files` host-call target (files_schema.jsonc), which keeps the files wherever the host keeps
// them (OPFS in a browser). One connection uses a store, so there is no locking. Temp files stay in memory
// (SQLITE_TEMP_STORE=3), so every file SQLite opens here has a path.
#include "files/generated/files_client.hpp"
#include "ipc_codegen/host_call_backend.hpp"
#include "store.hpp"

#include <sqlite3mc_amalgamation.h>

#include <cstring>
#include <exception>
#include <string>

#include <sys/random.h>
#include <time.h>

namespace {

using aztec::kv::files_service::FilesApi;
using namespace aztec::kv::files_service::wire;

constexpr const char* VFS_NAME = "aztec-host";
constexpr int SECTOR_SIZE = 4096;

FilesApi<ipc_codegen::HostCallBackend>& files()
{
    static FilesApi<ipc_codegen::HostCallBackend> api{ ipc_codegen::HostCallBackend("files") };
    return api;
}

/** Runs a host call, mapping its failure to SQLite's I/O error `code` (and recording the message). */
template <typename F> int io(int code, F&& body)
{
    try {
        body();
        return SQLITE_OK;
    } catch (const std::exception& e) {
        sqlite3_log(code, "files: %s", e.what());
        return code;
    }
}

struct HostFile {
    sqlite3_file base;
    uint32_t handle;
};

uint32_t handle_of(sqlite3_file* file)
{
    return reinterpret_cast<HostFile*>(file)->handle;
}

int x_close(sqlite3_file* file)
{
    return io(SQLITE_IOERR_CLOSE, [&] { files().close(FilesClose{ handle_of(file) }); });
}

int x_read(sqlite3_file* file, void* out, int amount, sqlite3_int64 offset)
{
    size_t got = 0;
    int rc = io(SQLITE_IOERR_READ, [&] {
        auto data =
            files()
                .read(FilesRead{ handle_of(file), static_cast<uint64_t>(offset), static_cast<uint32_t>(amount) })
                .data;
        got = std::min(data.size(), static_cast<size_t>(amount));
        std::memcpy(out, data.data(), got);
    });
    if (rc != SQLITE_OK) {
        return rc;
    }
    if (got < static_cast<size_t>(amount)) {
        // SQLite requires the unread part zeroed on a short read.
        std::memset(static_cast<uint8_t*>(out) + got, 0, static_cast<size_t>(amount) - got);
        return SQLITE_IOERR_SHORT_READ;
    }
    return SQLITE_OK;
}

int x_write(sqlite3_file* file, const void* data, int amount, sqlite3_int64 offset)
{
    return io(SQLITE_IOERR_WRITE, [&] {
        auto* bytes = static_cast<const uint8_t*>(data);
        files().write(
            FilesWrite{ handle_of(file), static_cast<uint64_t>(offset), std::vector<uint8_t>(bytes, bytes + amount) });
    });
}

int x_truncate(sqlite3_file* file, sqlite3_int64 size)
{
    return io(SQLITE_IOERR_TRUNCATE,
              [&] { files().truncate(FilesTruncate{ handle_of(file), static_cast<uint64_t>(size) }); });
}

int x_sync(sqlite3_file* file, int /*flags*/)
{
    return io(SQLITE_IOERR_FSYNC, [&] { files().sync(FilesSync{ handle_of(file) }); });
}

int x_file_size(sqlite3_file* file, sqlite3_int64* size)
{
    return io(SQLITE_IOERR_FSTAT,
              [&] { *size = static_cast<sqlite3_int64>(files().size(FilesSize{ handle_of(file) }).size); });
}

int x_lock(sqlite3_file*, int)
{
    return SQLITE_OK;
}

int x_unlock(sqlite3_file*, int)
{
    return SQLITE_OK;
}

int x_check_reserved_lock(sqlite3_file*, int* reserved)
{
    *reserved = 0;
    return SQLITE_OK;
}

int x_file_control(sqlite3_file*, int, void*)
{
    return SQLITE_NOTFOUND;
}

int x_sector_size(sqlite3_file*)
{
    return SECTOR_SIZE;
}

int x_device_characteristics(sqlite3_file*)
{
    return SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
}

const sqlite3_io_methods io_methods = {
    1,
    x_close,
    x_read,
    x_write,
    x_truncate,
    x_sync,
    x_file_size,
    x_lock,
    x_unlock,
    x_check_reserved_lock,
    x_file_control,
    x_sector_size,
    x_device_characteristics,
};

int x_open(sqlite3_vfs*, sqlite3_filename name, sqlite3_file* file, int flags, int* out_flags)
{
    file->pMethods = nullptr;
    if (name == nullptr) {
        return SQLITE_CANTOPEN;
    }
    uint32_t handle = 0;
    int rc =
        io(SQLITE_CANTOPEN, [&] { handle = files().open(FilesOpen{ name, static_cast<uint32_t>(flags) }).handle; });
    if (rc != SQLITE_OK) {
        return rc;
    }
    auto* host_file = reinterpret_cast<HostFile*>(file);
    host_file->handle = handle;
    file->pMethods = &io_methods;
    if (out_flags) {
        *out_flags = flags;
    }
    return SQLITE_OK;
}

int x_delete(sqlite3_vfs*, const char* name, int /*sync_dir*/)
{
    return io(SQLITE_IOERR_DELETE, [&] { files().remove(FilesRemove{ name }); });
}

int x_access(sqlite3_vfs*, const char* name, int /*flags*/, int* result)
{
    return io(SQLITE_IOERR_ACCESS, [&] { *result = files().exists(FilesExists{ name }).exists ? 1 : 0; });
}

int x_full_pathname(sqlite3_vfs*, const char* name, int out_size, char* out)
{
    if (static_cast<int>(std::strlen(name)) >= out_size) {
        return SQLITE_CANTOPEN;
    }
    std::strcpy(out, name);
    return SQLITE_OK;
}

int x_randomness(sqlite3_vfs*, int size, char* out)
{
    getentropy(out, static_cast<size_t>(size));
    return size;
}

int x_sleep(sqlite3_vfs*, int microseconds)
{
    return microseconds;
}

int x_current_time_int64(sqlite3_vfs*, sqlite3_int64* out)
{
    // Julian day number in milliseconds.
    timespec now{};
    clock_gettime(CLOCK_REALTIME, &now);
    *out = static_cast<sqlite3_int64>(210866760000000LL + now.tv_sec * 1000LL + now.tv_nsec / 1000000);
    return SQLITE_OK;
}

int x_current_time(sqlite3_vfs* vfs, double* out)
{
    sqlite3_int64 ms = 0;
    x_current_time_int64(vfs, &ms);
    *out = static_cast<double>(ms) / 86400000.0;
    return SQLITE_OK;
}

int x_get_last_error(sqlite3_vfs*, int, char*)
{
    return 0;
}

sqlite3_vfs host_vfs = {
    2,
    sizeof(HostFile),
    512,
    nullptr,
    VFS_NAME,
    nullptr,
    x_open,
    x_delete,
    x_access,
    x_full_pathname,
    nullptr,
    nullptr,
    nullptr,
    nullptr,
    x_randomness,
    x_sleep,
    x_current_time,
    x_get_last_error,
    x_current_time_int64,
};

} // namespace

// SQLITE_OS_OTHER: SQLite calls these from sqlite3_initialize. sqlite3mc then wraps the default VFS this registers
// with its cipher, as it wraps the unix VFS natively.
extern "C" int sqlite3_os_init()
{
    return sqlite3_vfs_register(&host_vfs, 1);
}

extern "C" int sqlite3_os_end()
{
    return SQLITE_OK;
}

namespace aztec::kv::files {

Bytes read(const std::string& path)
{
    auto& api = ::files();
    auto handle = api.open(FilesOpen{ path, SQLITE_OPEN_READONLY | SQLITE_OPEN_MAIN_DB }).handle;
    try {
        auto size = api.size(FilesSize{ handle }).size;
        auto data = api.read(FilesRead{ handle, 0, static_cast<uint32_t>(size) }).data;
        api.close(FilesClose{ handle });
        return data;
    } catch (...) {
        api.close(FilesClose{ handle });
        throw;
    }
}

void remove(const std::string& path)
{
    ::files().remove(FilesRemove{ path });
}

} // namespace aztec::kv::files
