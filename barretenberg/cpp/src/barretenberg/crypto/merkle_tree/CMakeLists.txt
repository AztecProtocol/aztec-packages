barretenberg_module(
    crypto_merkle_tree
    stdlib_primitives
    stdlib_blake3s
    stdlib_pedersen_hash
    crypto_poseidon2
    lmdb-lib
)

add_dependencies(crypto_merkle_tree lmdb)
add_dependencies(crypto_merkle_tree_objects lmdb)
add_dependencies(crypto_merkle_tree_tests lmdb)
add_dependencies(crypto_merkle_tree_test_objects lmdb)
