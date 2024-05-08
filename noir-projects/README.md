To compile/test these circuits, use the version of nargo that's built _within_ this monorepo.

`export NARGO_BACKEND_PATH=~/packages/barretenberg/cpp/build/bin/bb`

`cd noir-projects/noir-protocol-circuits`

`../../noir/noir-repo/target/release/nargo info --silence-warnings --package rollup_merge`
