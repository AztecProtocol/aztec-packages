// The Kv service: its one factory (make_service), which the server process (main.cpp) and the native library both
// make the service through, over the handlers below. Each handler answers from the instance's
// Store, and a failure is the service's error, carrying SQLite's message (a wrong key reads "file is not a
// database").
#include "generated/kv_dispatch.hpp"
#include "store.hpp"

#include <exception>
#include <stdexcept>

namespace aztec::kv {

struct KvCtx {
    std::unique_ptr<Store> store;

    Store& open_store()
    {
        if (!store) {
            throw std::runtime_error("the store is not open: Init opens it");
        }
        return *store;
    }
};

namespace {

template <typename Resp, typename F> void answer(const Responder<Resp>& respond, F&& body)
{
    try {
        respond.ok(body());
    } catch (const std::exception& e) {
        respond.error(e.what());
    }
}

std::vector<std::pair<Bytes, Bytes>> pairs(std::vector<wire::KvEntry>&& entries)
{
    std::vector<std::pair<Bytes, Bytes>> out;
    out.reserve(entries.size());
    for (auto& entry : entries) {
        out.emplace_back(std::move(entry.key), std::move(entry.value));
    }
    return out;
}

} // namespace

template <> void handle_init(KvCtx& ctx, wire::KvInit&& cmd, Responder<wire::KvInitResponse> respond)
{
    answer(respond, [&] {
        if (ctx.store) {
            throw std::runtime_error("the store is already open");
        }
        ctx.store = std::make_unique<Store>(std::move(cmd.path), std::move(cmd.encryptionKey));
        return wire::KvInitResponse{};
    });
}

template <> void handle_clear(KvCtx& ctx, wire::KvClear&&, Responder<wire::KvClearResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().clear();
        return wire::KvClearResponse{};
    });
}

template <> void handle_export(KvCtx& ctx, wire::KvExport&&, Responder<wire::KvExportResponse> respond)
{
    answer(respond, [&] { return wire::KvExportResponse{ ctx.open_store().export_file() }; });
}

template <> void handle_delete_store(KvCtx& ctx, wire::KvDeleteStore&&, Responder<wire::KvDeleteStoreResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().delete_files();
        ctx.store.reset();
        return wire::KvDeleteStoreResponse{};
    });
}

template <> void handle_begin(KvCtx& ctx, wire::KvBegin&&, Responder<wire::KvBeginResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().begin();
        return wire::KvBeginResponse{};
    });
}

template <> void handle_commit(KvCtx& ctx, wire::KvCommit&&, Responder<wire::KvCommitResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().commit();
        return wire::KvCommitResponse{};
    });
}

template <> void handle_rollback(KvCtx& ctx, wire::KvRollback&&, Responder<wire::KvRollbackResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().rollback();
        return wire::KvRollbackResponse{};
    });
}

template <> void handle_get(KvCtx& ctx, wire::KvGet&& cmd, Responder<wire::KvGetResponse> respond)
{
    answer(respond, [&] {
        wire::KvGetResponse response;
        for (auto& value : ctx.open_store().get(cmd.container, cmd.keys)) {
            response.values.push_back(wire::KvMaybeValue{ std::move(value) });
        }
        return response;
    });
}

template <> void handle_has(KvCtx& ctx, wire::KvHas&& cmd, Responder<wire::KvHasResponse> respond)
{
    answer(respond, [&] { return wire::KvHasResponse{ ctx.open_store().has(cmd.container, cmd.key) }; });
}

template <> void handle_count(KvCtx& ctx, wire::KvCount&& cmd, Responder<wire::KvCountResponse> respond)
{
    answer(respond, [&] { return wire::KvCountResponse{ ctx.open_store().count(cmd.container, cmd.key) }; });
}

template <> void handle_range(KvCtx& ctx, wire::KvRange&& cmd, Responder<wire::KvRangeResponse> respond)
{
    answer(respond, [&] {
        wire::KvRangeResponse response;
        for (auto& [key, value] : ctx.open_store().range(cmd.container, cmd.start, cmd.end, cmd.reverse, cmd.limit)) {
            response.entries.push_back(wire::KvEntry{ std::move(key), std::move(value) });
        }
        return response;
    });
}

template <> void handle_put(KvCtx& ctx, wire::KvPut&& cmd, Responder<wire::KvPutResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().put(cmd.container, cmd.key, cmd.value);
        return wire::KvPutResponse{};
    });
}

template <> void handle_put_many(KvCtx& ctx, wire::KvPutMany&& cmd, Responder<wire::KvPutManyResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().put_many(cmd.container, pairs(std::move(cmd.entries)));
        return wire::KvPutManyResponse{};
    });
}

template <> void handle_delete(KvCtx& ctx, wire::KvDelete&& cmd, Responder<wire::KvDeleteResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().remove(cmd.container, cmd.key);
        return wire::KvDeleteResponse{};
    });
}

template <> void handle_append(KvCtx& ctx, wire::KvAppend&& cmd, Responder<wire::KvAppendResponse> respond)
{
    answer(respond, [&] {
        return wire::KvAppendResponse{ ctx.open_store().append(cmd.container, cmd.key, cmd.values, cmd.unique) };
    });
}

template <> void handle_values(KvCtx& ctx, wire::KvValues&& cmd, Responder<wire::KvValuesResponse> respond)
{
    answer(respond, [&] { return wire::KvValuesResponse{ ctx.open_store().values(cmd.container, cmd.key) }; });
}

template <>
void handle_delete_value(KvCtx& ctx, wire::KvDeleteValue&& cmd, Responder<wire::KvDeleteValueResponse> respond)
{
    answer(respond, [&] {
        ctx.open_store().delete_value(cmd.container, cmd.key, cmd.value);
        return wire::KvDeleteValueResponse{};
    });
}

template <> void handle_get_at(KvCtx& ctx, wire::KvGetAt&& cmd, Responder<wire::KvGetAtResponse> respond)
{
    answer(respond,
           [&] { return wire::KvGetAtResponse{ ctx.open_store().get_at(cmd.container, cmd.key, cmd.index) }; });
}

template <> void handle_set_at(KvCtx& ctx, wire::KvSetAt&& cmd, Responder<wire::KvSetAtResponse> respond)
{
    answer(respond, [&] {
        return wire::KvSetAtResponse{ ctx.open_store().set_at(cmd.container, cmd.key, cmd.index, cmd.value) };
    });
}

template <> void handle_pop(KvCtx& ctx, wire::KvPop&& cmd, Responder<wire::KvPopResponse> respond)
{
    answer(respond, [&] { return wire::KvPopResponse{ ctx.open_store().pop(cmd.container, cmd.key) }; });
}

std::unique_ptr<Service> make_service()
{
    return std::make_unique<ContextService<KvCtx>>();
}

} // namespace aztec::kv
