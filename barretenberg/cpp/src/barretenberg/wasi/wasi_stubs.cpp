// If building WASM, we can stub out functions we know we don't need, to save the host
// environment from having to stub them itself.
#include <barretenberg/common/log.hpp>
#include <cstdint>
#include <cstdlib>
#include <string.h>

extern "C" {

int32_t __imported_wasi_snapshot_preview1_sched_yield()
{
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_poll_oneoff(int32_t, int32_t, int32_t, int32_t)
{
    info("poll_oneoff not implemented.");
    abort();
}

// void __imported_wasi_snapshot_preview1_proc_exit(int32_t)
// {
//     info("proc_exit not implemented.");
//     abort();
// }

struct iovs_struct {
    char* data;
    size_t len;
};

int32_t __imported_wasi_snapshot_preview1_fd_write(int32_t fd, iovs_struct* iovs_ptr, size_t iovs_len, size_t* ret_ptr)
{
    if (fd != 1 && fd != 2) {
        info("fd_write to unsupported file descriptor: ", fd);
        abort();
    }
    std::string str;
    for (size_t i = 0; i < iovs_len; ++i) {
        auto iovs = iovs_ptr[i];
        str += std::string(iovs.data, iovs.len);
    }
    logstr(str.c_str());
    *ret_ptr = str.length();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_seek(int32_t, int64_t, int32_t, int32_t)
{
    info("fd_seek not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_close(int32_t)
{
    info("fd_close not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_environ_get(int32_t, int32_t)
{
    // info("environ_get not implemented.");
    // abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_environ_sizes_get(int32_t, int32_t)
{
    // info("environ_sizes_get not implemented.");
    // abort();
    return 0;
}

// int32_t __imported_wasi_snapshot_preview1_clock_time_get(int32_t, int64_t, int32_t)
// {
//     info("clock_time_get not implemented.");
//     abort();
//     return 0;
// }

int32_t __imported_wasi_snapshot_preview1_fd_fdstat_get(int32_t fd, void* buf)
{
    // info("fd_fdstat_get not implemented.");
    // abort();
    if (fd != 1 && fd != 2) {
        info("fd_fdstat_get with unsupported file descriptor: ", fd);
        abort();
    }
    memset(buf, 0, 20);
    *(uint8_t*)buf = (uint8_t)fd;
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_fdstat_set_flags(int32_t, int32_t)
{
    info("fd_fdstat_set_flags not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_filestat_get(int32_t, int32_t)
{
    info("fd_filestat_get not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_filestat_set_size(int32_t, int64_t)
{
    info("fd_filestat_set_size not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_create_directory(int32_t, int32_t, int32_t)
{
    info("path_create_directory not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_readdir(int32_t, int32_t, int32_t, int64_t, int32_t)
{
    info("fd_readdir not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_advise(int32_t, int64_t, int64_t, int32_t)
{
    info("fd_advise not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_allocate(int32_t, int64_t, int64_t)
{
    info("fd_allocate not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_datasync(int32_t)
{
    info("fd_datasync not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_sync(int32_t)
{
    info("fd_sync not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_renumber(int32_t, int32_t)
{
    info("fd_renumber not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_tell(int32_t, uint64_t*)
{
    info("fd_tell stubbed.");
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_read(int32_t, int32_t, int32_t, int32_t)
{
    info("fd_read not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_open(
    int32_t, int32_t, int32_t, int32_t, int32_t, int64_t, int64_t, int32_t, int32_t)
{
    info("path_open not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_fd_prestat_get(int32_t, int32_t)
{
    // info("fd_prestat_get not implemented.");
    // abort();
    return 8;
}

int32_t __imported_wasi_snapshot_preview1_fd_prestat_dir_name(int32_t, int32_t, int32_t)
{
    info("fd_prestat_dir_name not implemented.");
    abort();
    return 28;
}

int32_t __imported_wasi_snapshot_preview1_path_filestat_get(int32_t, int32_t, int32_t, int32_t, int32_t)
{
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_filestat_set_times(
    int32_t, int32_t, int32_t, int32_t, int64_t, int64_t, int32_t)
{
    info("path_filestat_set_times not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_link(int32_t, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t)
{
    info("path_link not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_readlink(int32_t, int32_t, int32_t, int32_t, int32_t, int32_t)
{
    info("path_readlink not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_remove_directory(int32_t, int32_t, int32_t)
{
    info("path_remove_directory not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_rename(int32_t, int32_t, int32_t, int32_t, int32_t, int32_t)
{
    info("path_rename not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_symlink(int32_t, int32_t, int32_t, int32_t, int32_t)
{
    info("path_symlink not implemented.");
    abort();
    return 0;
}

int32_t __imported_wasi_snapshot_preview1_path_unlink_file(int32_t, int32_t, int32_t)
{
    info("path_unlink_file not implemented.");
    abort();
    return 0;
}
}
