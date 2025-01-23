# Noir + Bb benchmarking suite

The goal of this module is to provide a simple place for people to construct benchmarks of witness generation and proving. At the moment it only pertains to UltraHonk recursion in the browser, but we have a similar module in ivc-integration that shows prover performance of our ClientIVC suite.

## Building

The package assumes that bb.js has been built, but it is easy to rebuild, as we show below.

The full build command `yarn build` deletes all circuit artifacts and generated code, compiles the circuits, computes their verification keys, generates declarations and types for parsing circuit bytecode and verification keys in typescript, generates additional type information for noir.js and bb.js, and builds the typescript. With all of this, `yarn test` will run whatever jest tests are present, and `yarn serve:app` will serve a simple app with proving for execution in a web browser. but we can build more incrementally as well.

Scenario: I have made changes to bb.js and now I want to rebuild and run the browser app with multithreaded proving and symbols for the meaningful WASM stack traces. Command:
```
cd ../../barretenberg/ts && SKIP_ST_BUILD=1 NO_STRIP=1 yarn build && cd - && yarn build:app && yarn serve:app
```

Scenario: bb.js is unchanged, but I have changed one of my test circuits, and I want to run all tests. Command:
```
yarn generate && yarn build:ts && yarn test
```
