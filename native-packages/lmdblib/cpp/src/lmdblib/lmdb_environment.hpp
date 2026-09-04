#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <lmdb.h>
#include <memory>
#include <mutex>
#include <string>
namespace azteclabs::lmdblib {

/*
 * RAII wrapper around an LMDB environment.
 * Opens/creates the environemnt and manages read access to the enviroment.
 * The environment has an upper limit on the number of concurrent read transactions
 * and this is managed through the use of mutex/condition variables
 */
class LMDBEnvironment {
  public:
    using Ptr = std::unique_ptr<LMDBEnvironment>;
    using SharedPtr = std::shared_ptr<LMDBEnvironment>;
    /**
     * @brief Opens/creates the LMDB environment
     * @param directory The directory in which the environment is to be created
     * @param mapSizeKb The maximum size of the database, can be increased from a previously used value
     * @param maxNumDbs The maximum number of databases that can be created withn this environment
     * @param maxNumReaders The maximum number of concurrent read transactions permitted.
     * @param ephemeral When true, opens the env with `MDB_NOSYNC | MDB_NOMETASYNC`. Commits
     *                  return as soon as the dirty pages are queued; the kernel flushes them
     *                  lazily and never blocks the commit. Files stay sparse (we deliberately
     *                  avoid `MDB_WRITEMAP`, which would eagerly allocate the full map size
     *                  on disk). Intended for short-lived ephemeral world states (e.g. TXE
     *                  test sessions) that discard the directory on close; never use for a
     *                  real node — a crash mid-write yields an unrecoverable env.
     */
    LMDBEnvironment(const std::string& directory,
                    uint64_t mapSizeKb,
                    uint32_t maxNumDBs,
                    uint32_t maxNumReaders,
                    bool ephemeral = false);
    LMDBEnvironment(const LMDBEnvironment& other) = delete;
    LMDBEnvironment(LMDBEnvironment&& other) = delete;
    LMDBEnvironment& operator=(const LMDBEnvironment& other) = delete;
    LMDBEnvironment& operator=(LMDBEnvironment&& other) = delete;

    ~LMDBEnvironment();

    MDB_env* underlying() const;

    void wait_for_reader();

    void release_reader();

    void wait_for_writer();

    void release_writer();

    uint64_t getNextId() { return _id++; }

    uint64_t get_map_size() const;

    uint64_t get_data_file_size() const;

  private:
    std::atomic_uint64_t _id;
    std::string _directory;
    MDB_env* _mdbEnv;

    struct ResourceGuard {
        uint32_t _maxAllowed;
        uint32_t _current;
        std::mutex _lock;
        std::condition_variable _condition;

        ResourceGuard(uint32_t maxAllowed)
            : _maxAllowed(maxAllowed)
            , _current(0)
        {}

        void wait()
        {
            std::unique_lock lock(_lock);
            if (_current >= _maxAllowed) {
                _condition.wait(lock, [&] { return _current < _maxAllowed; });
            }
            ++_current;
        }

        void release()
        {
            std::unique_lock lock(_lock);
            --_current;
            _condition.notify_one();
        }
    };
    ResourceGuard _readGuard;
    ResourceGuard _writeGuard;
};
} // namespace azteclabs::lmdblib
