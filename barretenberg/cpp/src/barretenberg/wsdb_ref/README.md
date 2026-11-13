# wsdb-ref

The in-memory reference world state (`world_state_reference/`) served as a service over the node world state's
contract, `wsdb_schema.jsonc`. wsdb-ref owns that schema: the AVM's wsdb client (`vm2_wsdb/`) and
`native-packages/wsdb`'s `aztec-wsdb` are generated from it too, so wsdb-ref answers the same requests as the
production world state and serves as its reference.

The ipc-codegen dispatch runs the handlers in `wsdb_ref_handlers.cpp`. Each of the three build outputs carries
it to one transport of `@aztec-foundation/wsdb-ref` (`barretenberg/ts/wsdb-ref`):

| Output | Built in | Transport |
|---|---|---|
| `wsdb-ref` binary (`main.cpp`) | native builds | a spawned process over a socket or shared memory |
| `wsdb_ref_napi.node` | native builds | in-process in node, through Node-API |
| `wsdb-ref.wasm` (WASI reactor) | wasm builds | in-process in node or a browser |

A client sends `Init` first, with the genesis to start from; wsdb-ref has no built-in genesis.

## How forks stay cheap

Every tree in the reference world state is persistent: a write copies only the path it changes and shares the
rest with the version it came from. Blocks, forks and checkpoints are therefore copies of ten root pointers.
[`treap_forks.html`](treap_forks.html) is an interactive explainer of the treap behind the key index
(`world_state_reference/persistent_key_index.hpp`) and of how the forks share structure. Download it and open
it in a browser.
