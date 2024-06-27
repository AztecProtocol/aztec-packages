#pragma once

#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/world_state_napi/src/tree_with_store.hpp"
#include <memory>
#include <napi.h>

class WorldStateAddon : public Napi::ObjectWrap<WorldStateAddon> {
  public:
    WorldStateAddon(const Napi::CallbackInfo&);
    Napi::Value get_root(const Napi::CallbackInfo&);
    Napi::Value insert_leaf(const Napi::CallbackInfo&);

    static Napi::Function get_class(Napi::Env);

  private:
    // std::unique_ptr<bb::world_state::TreeWithStore> _notes_tree;
    std::unique_ptr<bb::world_state::Tree> _notes_tree;
};
