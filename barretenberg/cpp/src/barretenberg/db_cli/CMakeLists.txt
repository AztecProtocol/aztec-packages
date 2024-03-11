barretenberg_module(db_cli)
target_link_libraries(
    db_cli
    PRIVATE
    lmdb
    env
)

target_link_libraries(
    db_cli
    PRIVATE
    barretenberg
    env
)