# aztec-integration-testing

## Repo org:
-- todo: find the best place where to put this dir

src
├── sandbox.ts: wrap pxe calls/sandbox interactions
├── server.ts: an Express rpc server meant to be used as oracle resolver, resolve the endpoints to sandbox.ts functions
├── mocks
│   └── main.nr: a mock contract which is the target of the test (simple storage read/write, in private or public)
└── noir_test
    └── main.nr: the actual integration test along the oracle calls. run the test with `yarn test`

To run this, after bootstrapping the whole multirepo (./bootstrap.sh full at the root) - this does *not* work with the docker container:
- `yarn compile:mock` then `yarn codegen:mock` after modifying the mocked contract tested
- launch anvil in one terminal, aztec node in another (`yarn start` in `yarn-project/aztec`), then the oracle resolver: `yarn run:resolver` (using node 18)
- finally, execute the test: `yarn test`


To debug, the debugLog oracle call has been made available to the rpc, but will be logged in the rpc window itself (not in the sandbox)


--  Draft note/internal knowledge (aka it took me too long to find this) --

contract_function_interaction implementation
https://github.com/AztecProtocol/aztec-packages/blob/8bdb9213ff2560a83aadd7cc4af062e08e98bd22/yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L72


The mega-cheatcode: all the pxe calls abstracted away, for people using a wallet:
https://github.com/AztecProtocol/aztec-packages/blob/8bdb9213ff2560a83aadd7cc4af062e08e98bd22/yarn-project/aztec.js/src/wallet/base_wallet.ts#L101