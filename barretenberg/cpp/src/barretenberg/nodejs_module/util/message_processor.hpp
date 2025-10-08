#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/nodejs_module/util/async_op.hpp"
#include "napi.h"
#include <atomic>

namespace bb::nodejs {

class AsyncMessageProcessor {
  public:
    template <typename T, typename R>
    void register_handler(uint32_t msgType, T* self, R (T::*handler)() const, bool unique = false)
    {
        register_handler(msgType, self, handler, unique);
    }

    template <typename T, typename R>
    void register_handler(uint32_t msgType, T* self, R (T::*handler)(), bool unique = false)
    {
        _register_handler<messaging::HeaderOnlyMessage, R>(
            msgType, [=](auto, const msgpack::object&) { return (self->*handler)(); }, unique);
    }

    template <typename T, typename P, typename R>
    void register_handler(uint32_t msgType, T* self, R (T::*handler)(const P&) const, bool unique = false)
    {
        register_handler(msgType, self, handler, unique);
    }

    template <typename T, typename P, typename R>
    void register_handler(uint32_t msgType, T* self, R (T::*handler)(const P&), bool unique = false)
    {
        _register_handler<messaging::TypedMessage<P>, R>(
            msgType,
            [=](const messaging::TypedMessage<P>& req, const msgpack::object&) { return (self->*handler)(req.value); },
            unique);
    }

    template <typename T, typename P, typename R>
    void register_handler(uint32_t msgType,
                          T* self,
                          R (T::*handler)(const P&, const msgpack::object&) const,
                          bool unique = false)
    {
        register_handler(msgType, self, handler, unique);
    }

    template <typename T, typename P, typename R>
    void register_handler(uint32_t msgType,
                          T* self,
                          R (T::*handler)(const P&, const msgpack::object&),
                          bool unique = false)
    {
        _register_handler<messaging::TypedMessage<P>, R>(
            msgType,
            [=](const messaging::TypedMessage<P>& req, const msgpack::object& obj) {
                return (self->*handler)(req.value, obj);
            },
            unique);
    }

    Napi::Promise process_message(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        // keep this in a shared pointer so that AsyncOperation can resolve/reject the promise once the execution is
        // complete on an separate thread
        auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

        if (!open) {
            deferred->Reject(Napi::TypeError::New(env, "Message processor is closed").Value());
        } else if (info.Length() < 1) {
            deferred->Reject(Napi::TypeError::New(env, "Wrong number of arguments").Value());
        } else if (!info[0].IsBuffer()) {
            deferred->Reject(Napi::TypeError::New(env, "Argument must be a buffer").Value());
        } else {
            auto buffer = info[0].As<Napi::Buffer<char>>();
            size_t length = buffer.Length();
            // we mustn't access the Napi::Env outside of this top-level function
            // so copy the data to a variable we own
            // and make it a shared pointer so that it doesn't get destroyed as soon as we exit this code block
            auto data = std::make_shared<std::vector<char>>(length);
            std::copy_n(buffer.Data(), length, data->data());

            auto* op = new bb::nodejs::AsyncOperation(env, deferred, [data, this, length](msgpack::sbuffer& buf) {
                msgpack::object_handle obj_handle = msgpack::unpack(data->data(), length);
                msgpack::object obj = obj_handle.get();
                dispatcher.on_new_data(obj, buf);
            });

            // Napi is now responsible for destroying this object
            op->Queue();
        }

        return deferred->Promise();
    }

    void close() { open = false; }

  private:
    bb::messaging::MessageDispatcher dispatcher;
    std::atomic_bool open = true;

    template <typename P, typename R>
    void _register_handler(uint32_t msgType,
                           const std::function<R(const P&, const msgpack::object&)>& fn,
                           bool unique = false)
    {
        dispatcher.register_target(
            msgType,
            [=](msgpack::object& obj, msgpack::sbuffer& buffer) {
                P req_msg;
                obj.convert(req_msg);

                R response = fn(req_msg, obj);

                bb::messaging::MsgHeader header(req_msg.header.messageId);
                bb::messaging::TypedMessage<R> resp_msg(msgType, header, response);
                msgpack::pack(buffer, resp_msg);

                return true;
            },
            unique);
    }
};

} // namespace bb::nodejs
