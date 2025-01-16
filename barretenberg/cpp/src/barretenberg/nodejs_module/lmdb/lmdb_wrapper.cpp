#include "barretenberg/nodejs_module/lmdb/lmdb_wrapper.hpp"
#include "barretenberg/nodejs_module/lmdb/lmdb_message.hpp"
#include "napi.h"
#include <stdexcept>

using namespace bb::nodejs;
using namespace bb::nodejs::lmdb;

LmdbWrapper::LmdbWrapper(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    size_t data_dir_index = 0;
    std::string data_dir;
    if (info.Length() > data_dir_index && info[data_dir_index].IsString()) {
        data_dir = info[data_dir_index].As<Napi::String>();
    } else {
        throw Napi::TypeError::New(env, "Directory needs to be a string");
    }

    _msg_processor.register_handler(LmdbMessageType::OPEN_DATABASE, this, &LmdbWrapper::open_database);
    _msg_processor.register_handler(LmdbMessageType::CLOSE_DATABASE, this, &LmdbWrapper::close_database);
    _msg_processor.register_handler(LmdbMessageType::SET, this, &LmdbWrapper::set);
    _msg_processor.register_handler(LmdbMessageType::GET, this, &LmdbWrapper::get);
    _msg_processor.register_handler(LmdbMessageType::REMOVE, this, &LmdbWrapper::remove);
}

Napi::Value LmdbWrapper::call(const Napi::CallbackInfo& info)
{
    return _msg_processor.process_message(info);
}

Napi::Function LmdbWrapper::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "Lmdb",
                       {
                           LmdbWrapper::InstanceMethod("call", &LmdbWrapper::call),
                       });
}

EmptyResponse LmdbWrapper::open_database(const OpenDatabaseRequest& req)
{
    _dbs[req.db_name] = {};
    return EmptyResponse{ true };
}

EmptyResponse LmdbWrapper::close_database(const CloseDatabaseRequest& req)
{
    (void)req;
    return { true };
}

EmptyResponse LmdbWrapper::remove(const RemoveRequest& req)
{
    (void)req;
    return { true };
}

EmptyResponse LmdbWrapper::set(const SetRequest& req)
{
    auto& db = _dbs.at(req.db_name);
    db[req.key] = req.value;

    return { true };
}

GetResponse LmdbWrapper::get(const GetRequest& req)
{
    auto& value = _dbs[req.db_name][req.key];
    return { value };
}
