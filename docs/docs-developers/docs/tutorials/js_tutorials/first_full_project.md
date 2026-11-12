---
title: Your First Full Project
sidebar_position: 0
description: Create a contract with aztec init, then deploy and call it from TypeScript, starting from an empty folder.
references: ["docs/examples/ts/first_full_project/index.ts", "labs/yarn-project/aztec/scripts/init.sh", "labs/yarn-project/aztec/scripts/templates/counter/contract/src/main.nr"]
---

This tutorial takes you from an empty folder to a contract deployed on a local network and called from TypeScript. You create a Counter contract with `aztec init`, compile it, generate its TypeScript bindings, and write one script that deploys it, increments it and reads it back.

## Prerequisites

- Node.js (v22 or later) and npm
- The Aztec CLI at version #include_version_without_prefix, with a local network running. See [Getting started on the local network](../../../getting_started_on_local_network.md) to install the CLI and start the network with `aztec start --local-network`.

## Create the contract

Create an empty folder and initialize an Aztec project in it:

```bash
mkdir my_project
cd my_project
aztec init
```

`aztec init` names the project after the folder. It creates a workspace with two crates:

- `my_project_contract/`: a `Counter` contract that keeps a private counter per owner
- `my_project_test/`: Noir tests for the contract, which you run with `aztec test`

Compile the contract and generate its TypeScript bindings:

```bash
aztec compile
aztec codegen target -o src/artifacts
```

`aztec compile` writes the contract artifact to `target/my_project_contract-Counter.json`. `aztec codegen` turns it into `src/artifacts/Counter.ts`, which exports a typed `CounterContract` class.

## Set up the TypeScript project

Create these two files in `my_project/`. The Aztec packages must match your CLI version.

```json title="package.json"
{
  "name": "my-project",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@aztec-labs/accounts": "#include_version_without_prefix",
    "@aztec-labs/aztec.js": "#include_version_without_prefix",
    "@aztec-labs/wallets": "#include_version_without_prefix"
  },
  "devDependencies": {
    "@types/node": "22.20.5",
    "tsx": "4.23.15",
    "typescript": "5.9.3"
  }
}
```

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Install the dependencies:

```bash
npm install
```

## Write the script

Create `src/index.ts`:

#include_code full /docs/examples/ts/first_full_project/index.ts typescript

The script:

1. Creates an `EmbeddedWallet`, which runs a PXE (Private eXecution Environment) inside the script. `ephemeral: true` keeps its state in memory only.
2. Adds the first of the local network's test accounts. The network funds them at genesis, so they pay fees without being deployed first.
3. Deploys the Counter with an initial value of 10, owned by that account. The constructor is a private function, so it runs in the PXE before the transaction is sent.
4. Calls `increment`, a private function, and then reads the counter with `get_counter`, a utility function that runs in the PXE without a transaction.

## Run it

```bash
npm start
```

Expected output (your address differs):

```text
Counter deployed at 0x...
Counter value: 11
```

Your project now has everything a larger app needs: a contract workspace with tests, generated bindings, and a TypeScript client.

## Troubleshooting

- **The import of `./artifacts/Counter.js` fails**: run `aztec codegen target -o src/artifacts` after every `aztec compile`.
- **The script cannot reach the node**: start the local network with `aztec start --local-network`. The script connects to `http://localhost:8080` unless you set `AZTEC_NODE_URL`.
- **Errors after you upgrade the CLI**: the `@aztec-labs/*` versions in `package.json` must equal the version `aztec --version` prints.

## Next steps

- [Counter contract](../contract_tutorials/counter_contract.md) explains the contract line by line.
- [Testing contracts](../../aztec-nr/testing_contracts.md) covers the tests in `my_project_test/`.
- [Deploying a token contract](./aztecjs-getting-started.md) uses a prebuilt token contract and private transfers.
