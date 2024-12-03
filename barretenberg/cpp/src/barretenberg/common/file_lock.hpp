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
        : fileName(lockFileName)
    {
        // Open the lock file
        fd = open(lockFileName.c_str(), O_CREAT | O_RDWR | O_EXCL, 0666);
        if (fd == -1) {
            throw_or_abort("Failed to open lock file: " + lockFileName);
        }
    }

    ~FileLock()
    {
        if (fd != -1) {
            close(fd);
            // Delete the lock file - if others have it open, it is ok
            unlink(fileName.c_str());
        }
    }

  private:
    void unlock() { unlink(); }
    int fd = -1;
    std::string fileName;
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
