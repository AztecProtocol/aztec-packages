# aztec-integration-testing

## Design
This implements integration or end-to-end testing in Noir, using the builtin `#[test]` macro and an RPC server acting as oracle resolver.
See ........ for the technical details

## Repo org

NOTE: the first time(s) you run `yarn test`, it might fails with tx dropped from the p2p node. Running it again usually fixes it (something to investigate later one - wild guess is contract class id collision - maybe we should try with a first non-concomitant deploy, before running the others)

src
├── sandbox.ts: wrap pxe calls/sandbox interactions
├── server.ts: an Express rpc server meant to be used as oracle resolver, resolve the endpoints to sandbox.ts functions
├── mocks
│ └── main.nr: a mock contract which is the target of the test (simple storage read/write, in private or public)
└── noir_test
└── main.nr: the actual integration test along the oracle calls. run the test with `yarn test`

To run this, after bootstrapping the whole multirepo (./bootstrap.sh full at the root) - this does _not_ work with the docker container as we need a higher timeout for the foreign call from nargo's minreq (see https://github.com/noir-lang/noir/issues/4772#event-12468173848):

- `yarn compile:mock` then `yarn codegen:mock` after modifying the mocked contract tested
- launch anvil in one terminal, aztec node in another (`yarn start` in `yarn-project/aztec`), then the oracle resolver: `yarn run:resolver` (using node 18)
- finally, execute the test: `yarn test`

To debug, the debugLog oracle call has been made available to the rpc, but will be logged in the rpc window itself (not in the sandbox)

## 