# Circuits.js

Javascript bindings for the aztec3 circuits WASM.
High-level bindings to the raw C API to our core circuit logic.

## To run:

`yarn && yarn test`

## To rebundle local dependencies from aztec3-packages

Currently relies on dependencies locally linked from `aztec3-packages`.
Run `yarn bundle-deps` to rebundle them (committed to the repo for simplicity).
Run `yarn dev-deps` if you have ../../.. as the `aztec3-packages` path.

TODO worker API
