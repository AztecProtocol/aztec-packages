# Standalone in-memory reference world state + world-state vocabulary.
# vm2-free and single-threaded (no thread_pool) so it also builds under the fuzzing preset.
barretenberg_module(world_state_reference crypto_merkle_tree aztec crypto_poseidon2)
# -fPIC: reaches the nodejs_module shared library via vm2_sim.
set_target_properties(world_state_reference_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
