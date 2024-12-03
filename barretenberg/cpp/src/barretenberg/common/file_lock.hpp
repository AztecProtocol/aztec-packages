#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include <string>
namespace bb {
#if defined(__unix__) || defined(__APPLE__) || defined(__linux__) // POSIX systems
#include <cstdio>
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>

class FileLock {
  public:
    explicit FileLock(const std::string& lockFileName)
    {
        // Open the lock file
        fd = open(lockFileName.c_str(), O_CREAT | O_RDWR, 0666);
        if (fd == -1) {
            throw_or_abort("Failed to open lock file: " + lockFileName);
        } else {
            lock();
        }
    }

    ~FileLock()
    {
        if (fd != -1) {
            unlock();
            close(fd);
        }
    }

  private:
    void lock()
    {
        // Acquire an exclusive lock
        if (flock(fd, LOCK_EX) == -1) {
            throw_or_abort("Failed to acquire lock on file descriptor");
        }
    }

    void unlock()
    {
        // Release the lock
        if (flock(fd, LOCK_UN) == -1) {
            throw_or_abort("Failed to release lock on file descriptor");
        }
    }
    int fd = -1;
};

#else // Non-POSIX systems
class FileLock {
  public:
    explicit FileLock(BB_UNUSED const std::string& /* lockFileName */)
    {
        // No-op
    }
    ~FileLock() = default;
};
}
#endif
