## Noir Contracts

A series of example aztec-nr smart contracts used in our end to end testing flow

### protocol_contracts.json

A list of protocol contract artifacts, formatted as `<crate_name>-<ContractName>`. This mirrors the Noir compiler's output naming convention for files in `target/`. Consumers split on `-` to get the contract name.

Consumed by:

- `yarn-project/protocol-contracts/src/scripts/generate_data.ts` — generates `protocol_contract_data.ts` (names, salts, addresses, derived addresses, protocol contracts list and hash)
- `yarn-project/aztec.js/src/scripts/generate_protocol_contract_types.ts` — generates TypeScript contract wrapper classes in `aztec.js/src/contract/protocol_contracts/`
