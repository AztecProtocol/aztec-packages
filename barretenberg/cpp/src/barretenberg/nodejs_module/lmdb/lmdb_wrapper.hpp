#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/nodejs_module/lmdb/lmdb_message.hpp"
#include "barretenberg/nodejs_module/util/message_processor.hpp"
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
    bb::nodejs::AsyncMessageProcessor _msg_processor;
    std::map<std::string, std::map<std::string, std::vector<std::byte>>> _dbs;

    EmptyResponse open_database(const OpenDatabaseRequest& req);
    EmptyResponse close_database(const CloseDatabaseRequest& req);
    EmptyResponse set(const SetRequest& req);
    GetResponse get(const GetRequest& req);
    EmptyResponse remove(const RemoveRequest& req);
};

} // namespace bb::nodejs::lmdb
