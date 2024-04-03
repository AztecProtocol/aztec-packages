# aztec-integration-testing

1) Run sandbox
1) aztec-nargo compile in our repo
1) yarn run:oracle in our repo (to get the test contract artifact) - needs node 18
1) Copy-Paste the /mock-poc/local-oracle  (our repo) to aztec-packages/noir-projects/noir-contracts (for now, use the 0.26 release)
1) Add it to the workspaces in nargo
1) Run bootstrap.sh (might or might not be taking some time, depending on config - go touch some grass or learn rust in the meantime)
1) from inside aztec-packages/noir-projects/noir-contracts run ../../noir/noir-repo/target/release/nargo test --oracle-resolver 'http://localhost:5555/' --silence-warnings --package local_oracle

To debug, the debugLog oracle call has been made available to the rpc, but will be logged in the rpc window itself (not in the sandbox)


--  Draft note/internal knowledge (aka it took me too long to find this) --

contract_function_interaction implementation
https://github.com/AztecProtocol/aztec-packages/blob/8bdb9213ff2560a83aadd7cc4af062e08e98bd22/yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L72


The mega-cheatcode: all the pxe calls abstracted away, for people using a wallet:
https://github.com/AztecProtocol/aztec-packages/blob/8bdb9213ff2560a83aadd7cc4af062e08e98bd22/yarn-project/aztec.js/src/wallet/base_wallet.ts#L101