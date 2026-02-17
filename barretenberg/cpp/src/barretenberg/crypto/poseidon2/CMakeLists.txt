barretenberg_module(crypto_poseidon2 ecc)
# Need -fPIC because it's linked into the nodejs_module shared library
set_target_properties(crypto_poseidon2_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
