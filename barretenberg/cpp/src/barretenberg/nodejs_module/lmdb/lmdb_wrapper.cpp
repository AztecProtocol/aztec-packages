#include "barretenberg/nodejs_module/lmdb/lmdb_wrapper.hpp"
#include "barretenberg/nodejs_module/lmdb/lmdb_message.hpp"
#include "napi.h"
#include <stdexcept>

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

    register_handler(LmdbMessageType::OPEN_DATABASE, &LmdbWrapper::open_database);
    register_handler(LmdbMessageType::CLOSE_DATABASE, &LmdbWrapper::close_database);
    register_handler(LmdbMessageType::SET, &LmdbWrapper::set);
    register_handler(LmdbMessageType::GET, &LmdbWrapper::get);
    register_handler(LmdbMessageType::REMOVE, &LmdbWrapper::remove);
}

Napi::Value LmdbWrapper::call(const Napi::CallbackInfo& info)
{
    if (info.Length() < 1) {
        throw std::runtime_error("Wrong number of arguments");
    }
    if (!info[0].IsBuffer()) {
        throw std::runtime_error("Argument must be a buffer");
    }

    auto buffer = info[0].As<Napi::Buffer<char>>();
    msgpack::object_handle obj_handle = msgpack::unpack(buffer.Data(), buffer.Length());
    msgpack::object obj = obj_handle.get();

    msgpack::sbuffer result;
    _dispatcher.onNewData(obj, result);

    auto buf = Napi::Buffer<char>::Copy(info.Env(), result.data(), result.size());
    return buf;
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
