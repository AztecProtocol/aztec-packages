barretenberg_module(world_state crypto_merkle_tree crypto_poseidon2)

# world_state needs -fPIC because it's linked into the nodejs_module shared library
set_target_properties(world_state_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
