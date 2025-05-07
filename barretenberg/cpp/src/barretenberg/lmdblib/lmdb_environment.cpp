#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "lmdb.h"
#include <cstdint>
#include <filesystem>
#include <stdexcept>
#include <sys/stat.h>

namespace bb::lmdblib {

LMDBEnvironment::LMDBEnvironment(const std::string& directory,
                                 uint64_t mapSizeKB,
                                 uint32_t maxNumDBs,
                                 uint32_t maxNumReaders)
    : _id(0)
    , _directory(directory)
    , _readGuard(maxNumReaders)
    , _writeGuard(1) // LMDB only permits one write transaction at a time
{
    call_lmdb_func("mdb_env_create", mdb_env_create, &_mdbEnv);
    uint64_t kb = 1024;
    uint64_t totalMapSize = kb * mapSizeKB;
    uint32_t flags = MDB_NOTLS;
    try {
        call_lmdb_func("mdb_env_set_mapsize", mdb_env_set_mapsize, _mdbEnv, static_cast<size_t>(totalMapSize));
        call_lmdb_func("mdb_env_set_maxdbs", mdb_env_set_maxdbs, _mdbEnv, static_cast<MDB_dbi>(maxNumDBs));
        call_lmdb_func("mdb_env_set_maxreaders", mdb_env_set_maxreaders, _mdbEnv, maxNumReaders);
        call_lmdb_func("mdb_env_open",
                       mdb_env_open,
                       _mdbEnv,
                       directory.c_str(),
                       flags,
                       static_cast<mdb_mode_t>(S_IRWXU | S_IRWXG | S_IRWXO));
    } catch (std::runtime_error& error) {
        call_lmdb_func(mdb_env_close, _mdbEnv);
        throw error;
    }
}

void LMDBEnvironment::wait_for_reader()
{
    _readGuard.wait();
}

void LMDBEnvironment::release_reader()
{
    _readGuard.release();
}

void LMDBEnvironment::wait_for_writer()
{
    _writeGuard.wait();
}

void LMDBEnvironment::release_writer()
{
    _writeGuard.release();
}

LMDBEnvironment::~LMDBEnvironment()
{
    call_lmdb_func(mdb_env_close, _mdbEnv);
}

MDB_env* LMDBEnvironment::underlying() const
{
    return _mdbEnv;
}

uint64_t LMDBEnvironment::get_map_size() const
{
    MDB_envinfo info;
    call_lmdb_func(mdb_env_info, _mdbEnv, &info);
    return info.me_mapsize;
}

uint64_t LMDBEnvironment::get_data_file_size() const
{
    std::string dataPath = (std::filesystem::path(_directory) / "data.mdb").string();
    if (std::filesystem::exists(dataPath)) {
        return std::filesystem::file_size(dataPath);
    }
    return 0;
}
} // namespace bb::lmdblib
