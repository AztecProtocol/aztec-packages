#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/nodejs_module/world_state/world_state_message.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include <cstdint>
#include <memory>
#include <napi.h>

namespace bb::nodejs {

/**
 * @brief Manages the interaction between the JavaScript runtime and the WorldState class.
 */
class WorldStateWrapper : public Napi::ObjectWrap<WorldStateWrapper> {
  public:
    WorldStateWrapper(const Napi::CallbackInfo&);

    /**
     * @brief The only instance method exposed to JavaScript. Takes a msgpack Message and returns a Promise
     */
    Napi::Value call(const Napi::CallbackInfo&);

    /**
     * @brief Register the WorldStateAddon class with the JavaScript runtime.
     */
    static Napi::Function get_class(Napi::Env);

  private:
    std::unique_ptr<bb::world_state::WorldState> _ws;
    bb::messaging::MessageDispatcher _dispatcher;

    bool get_tree_info(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_state_reference(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_initial_state_reference(msgpack::object& obj, msgpack::sbuffer& buffer) const;

    bool get_leaf_value(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_leaf_preimage(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_sibling_path(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_block_numbers_for_leaf_indices(msgpack::object& obj, msgpack::sbuffer& buffer) const;

    bool find_leaf_indices(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool find_low_leaf(msgpack::object& obj, msgpack::sbuffer& buffer) const;

    bool append_leaves(msgpack::object& obj, msgpack::sbuffer& buffer);
    bool batch_insert(msgpack::object& obj, msgpack::sbuffer& buffer);
    bool sequential_insert(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool update_archive(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool commit(msgpack::object& obj, msgpack::sbuffer& buffer);
    bool rollback(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool sync_block(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool create_fork(msgpack::object& obj, msgpack::sbuffer& buffer);
    bool delete_fork(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool close(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool set_finalised(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool unwind(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool remove_historical(msgpack::object& obj, msgpack::sbuffer& buffer) const;

    bool get_status(msgpack::object& obj, msgpack::sbuffer& buffer) const;
};

} // namespace bb::nodejs
