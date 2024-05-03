# aztec-integration-testing

## Design
This implements integration or end-to-end testing in Noir, using the builtin `#[test]` macro and an RPC server acting as oracle resolver.

See ........ for the technical details

The noir tests are run in parallels, reason why we redeploy the tested contract in every test fn (similar to how Foundry behaves). A typescript test suite is provided for comparison, with the exact same steps. Running this later is timed at 1:59 while the Noir version at 59 seconds (with a very little increase for each new test fn added).

## Repo org

src
├── sandbox.ts: wrap pxe calls/sandbox interactions
├── server.ts: an Express rpc server meant to be used as oracle resolver, resolve the endpoints to sandbox.ts functions
├── mocks
│ └── main.nr: a mock contract which is the target of the test (simple storage read/write, in private or public)
└── noir_test
└── main.nr: the actual integration test along the oracle calls. run the test with `yarn test`
└── e2e_mock.test.ts: the same test implemented in typescript, using Jest (redoing the exact same steps, for timing comparison)

To run this, after bootstrapping the whole multirepo (./bootstrap.sh full at the root) - this does _not_ work with the docker container as we need a higher timeout for the foreign call from nargo's minreq (see https://github.com/noir-lang/noir/issues/4772#event-12468173848):

- `yarn compile:mock` then `yarn codegen:mock` after modifying the mocked contract tested
- launch anvil in one terminal, aztec node in another (`yarn start` in `yarn-project/aztec`), then the oracle resolver: `yarn run:resolver` (using node 18)
- finally, execute the test: `yarn test`

To debug, the debugLog oracle call has been made available to the rpc, but will be logged in the rpc window itself (not in the sandbox)

## 