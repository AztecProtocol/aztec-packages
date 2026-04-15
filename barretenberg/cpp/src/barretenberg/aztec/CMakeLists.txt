barretenberg_module(aztec crypto_merkle_tree)

# aztec_objects needs -fPIC because it's pulled (via world_state) into the
# nodejs_module shared library.
set_target_properties(aztec_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
