#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/nodejs_module/lmdb/lmdb_message.hpp"
#include <map>
#include <napi.h>

namespace bb::nodejs::lmdb {

/**
 * @brief Manages the interaction between the JavaScript runtime and the LMDB instance.
 */
class LmdbWrapper : public Napi::ObjectWrap<LmdbWrapper> {
  public:
    LmdbWrapper(const Napi::CallbackInfo&);

    /**
     * @brief The only instance method exposed to JavaScript. Takes a msgpack Message and returns a Promise
     */
    Napi::Value call(const Napi::CallbackInfo&);

    static Napi::Function get_class(Napi::Env env);

  private:
    bb::messaging::MessageDispatcher _dispatcher;
    std::map<std::string, std::map<std::string, std::vector<std::byte>>> _dbs;

    // helper function to register message handlers on the dispatcher. Claude helped
    template <typename T, typename R> void register_handler(uint32_t msgType, R (LmdbWrapper::*handler)(const T&));

    EmptyResponse open_database(const OpenDatabaseRequest& req);
    EmptyResponse close_database(const CloseDatabaseRequest& req);
    EmptyResponse set(const SetRequest& req);
    GetResponse get(const GetRequest& req);
    EmptyResponse remove(const RemoveRequest& req);
};

template <typename T, typename R>
void LmdbWrapper::register_handler(uint32_t msgType, R (LmdbWrapper::*handler)(const T&))
{
    _dispatcher.registerTarget(msgType, [this, handler, msgType](msgpack::object& obj, msgpack::sbuffer& buffer) {
        messaging::TypedMessage<T> req_msg;
        obj.convert(req_msg);

        R response = (this->*handler)(req_msg.value);

        messaging::MsgHeader header(req_msg.header.messageId);
        messaging::TypedMessage<R> resp_msg(msgType, header, response);
        msgpack::pack(buffer, resp_msg);

        return true;
    });
}

} // namespace bb::nodejs::lmdb
