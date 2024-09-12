#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/world_state_napi/message.hpp"
#include <cstdint>
#include <memory>
#include <napi.h>

namespace bb::world_state {

/**
 * @brief Manages the interaction between the JavaScript runtime and the WorldState class.
 */
class WorldStateAddon : public Napi::ObjectWrap<WorldStateAddon> {
  public:
    WorldStateAddon(const Napi::CallbackInfo&);

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

    bool get_leaf_value(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_leaf_preimage(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool get_sibling_path(msgpack::object& obj, msgpack::sbuffer& buffer) const;

    bool find_leaf_index(msgpack::object& obj, msgpack::sbuffer& buffer) const;
    bool find_low_leaf(msgpack::object& obj, msgpack::sbuffer& buffer) const;

    bool append_leaves(msgpack::object& obj, msgpack::sbuffer& buffer);
    bool batch_insert(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool update_archive(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool commit(msgpack::object& obj, msgpack::sbuffer& buffer);
    bool rollback(msgpack::object& obj, msgpack::sbuffer& buffer);

    bool sync_block(msgpack::object& obj, msgpack::sbuffer& buffer);

    static WorldStateRevision revision_from_input(int input);
};

} // namespace bb::world_state
