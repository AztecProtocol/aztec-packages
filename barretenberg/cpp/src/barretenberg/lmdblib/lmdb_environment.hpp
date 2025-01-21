#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <lmdb.h>
#include <memory>
#include <mutex>
#include <string>
namespace bb::lmdblib {

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
     */
    LMDBEnvironment(const std::string& directory, uint64_t mapSizeKb, uint32_t maxNumDBs, uint32_t maxNumReaders);
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

  private:
    std::atomic_uint64_t _id;
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
} // namespace bb::lmdblib