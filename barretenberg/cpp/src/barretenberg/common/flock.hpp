#pragma once

#ifdef _WIN32
#include <io.h>
#include <windows.h>
#define LOCK_SH 1
#define LOCK_EX 2
#define LOCK_NB 4
#define LOCK_UN 8

static inline int flock(int fd, int operation)
{
    HANDLE h = (HANDLE)_get_osfhandle(fd);
    OVERLAPPED o = { 0 };
    DWORD flags = 0;

    if (operation & LOCK_NB)
        flags |= LOCKFILE_FAIL_IMMEDIATELY;
    if (operation & LOCK_EX)
        flags |= LOCKFILE_EXCLUSIVE_LOCK;

    if (operation & LOCK_UN) {
        return UnlockFileEx(h, 0, MAXDWORD, MAXDWORD, &o) ? 0 : -1;
    }
    return LockFileEx(h, flags, 0, MAXDWORD, MAXDWORD, &o) ? 0 : -1;
}
#else
#include <sys/file.h>
#endif

#include <fcntl.h>
#include <string_view>
#include <unistd.h>

struct FileLockGuard {
    int fd;

    explicit FileLockGuard([[maybe_unused]] std::string_view path,
                           [[maybe_unused]] int flags = O_RDWR | O_CREAT,
                           [[maybe_unused]] mode_t mode = 0644)
    {
#ifndef __wasm__
        fd = open(std::string(path).c_str(), flags, mode);
        if (fd != -1) {
            flock(fd, LOCK_EX);
        }
#else
        fd = -1;
#endif
    }

    ~FileLockGuard()
    {
#ifndef __wasm__
        if (fd != -1) {
            flock(fd, LOCK_UN);
            close(fd);
        }
#endif
    }

    FileLockGuard(const FileLockGuard&) = delete;
    FileLockGuard& operator=(const FileLockGuard&) = delete;
};
