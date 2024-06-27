#pragma once

#include <condition_variable>
#include <lmdb.h>
#include <mutex>
#include <string>
namespace bb::crypto::merkle_tree {
class LMDBEnvironment {
  public:
    LMDBEnvironment(const std::string& directory, uint64_t mapSizeMB, uint32_t maxNumDBs, uint32_t maxNumReaders);
    LMDBEnvironment(const LMDBEnvironment& other) = delete;
    LMDBEnvironment(LMDBEnvironment&& other) = delete;
    LMDBEnvironment& operator=(const LMDBEnvironment& other) = delete;
    LMDBEnvironment& operator=(LMDBEnvironment&& other) = delete;

    ~LMDBEnvironment();

    MDB_env* underlying() const;

    void waitForReader();

    void releaseReader();

  private:
    MDB_env* _mdbEnv;
    uint32_t _maxReaders;
    uint32_t _numReaders;
    std::mutex _readersLock;
    std::condition_variable _readersCondition;
};
} // namespace bb::crypto::merkle_tree