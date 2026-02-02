# Pod Racing Webapp Tutorial

A sample Aztec webapp demonstrating wallet connection, contract deployment, and private state management.

## Prerequisites

- Node.js 18+
- Yarn
- Docker (for running the local Aztec network)

## Quick Start

### 1. Install dependencies

```bash
yarn install
```

### 2. Compile the contract

```bash
cd contracts
aztec compile
cd ..
```

### 3. Generate TypeScript bindings

```bash
aztec codegen target/pod_racing_contract-PodRacing.json -o src/artifacts
```

### 4. Start the local Aztec network

Using Docker:

```bash
# Create a network for the containers
docker network create aztec-net

# Start Anvil (L1)
docker run -d --name anvil --network aztec-net -p 8545:8545 \
  ghcr.io/foundry-rs/foundry:latest \
  'anvil --silent -p 8545 --host 0.0.0.0 --chain-id 31337'

# Start the Aztec local network
docker run -d --name aztec-local-network --network aztec-net -p 8080:8080 \
  -e ETHEREUM_HOSTS=http://anvil:8545 \
  -e L1_CHAIN_ID=31337 \
  aztecprotocol/aztec:latest start --local-network
```

Wait for the network to be ready (check `curl http://localhost:8080/status`).

### 5. Start the development server

```bash
yarn dev
```

Open http://localhost:5173 in your browser.

## Testing with the Test Wallet Extension

The project includes a test wallet extension for development and E2E testing.

### Loading the Test Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the folder: `test-extension/`

### What the Test Extension Does

The test extension is a minimal mock wallet that:

- **Auto-approves all connection requests** (skips emoji verification)
- **Returns a hardcoded test account** for `getAccounts()` calls
- **Returns empty arrays** for other wallet methods (won't sign real transactions)

This is useful for testing the wallet discovery and connection flow without a real wallet.

### Rebuilding the Test Extension

If you modify the extension source files:

```bash
node esbuild.extension.mjs
```

Then reload the extension in Chrome (`chrome://extensions/` > click the refresh icon).

## Project Structure

```
webapp-tutorial/
├── contracts/           # Noir smart contract source
│   └── src/
│       ├── main.nr      # Main contract (PodRacing)
│       ├── race.nr      # Race struct and logic
│       └── game_round_note.nr  # Private note for round data
├── src/
│   ├── artifacts/       # Generated TypeScript bindings
│   ├── components/      # React components
│   ├── App.tsx          # Main app component
│   ├── contract.ts      # Contract interaction helpers
│   ├── fees.ts          # Fee payment helpers
│   └── network.ts       # Network/PXE configuration
├── test-extension/      # Test wallet extension
│   ├── manifest.json
│   └── src/
│       ├── background.ts
│       └── content-script.ts
└── tests/               # E2E tests
```

## Connecting to Different Networks

- **Local**: Connects to `http://localhost:8080` (local Docker network)
- **Devnet**: Connects to Aztec devnet (requires a real wallet extension like Aztec Keychain)

## Troubleshooting

### "Looking for wallet extensions..." hangs

Make sure you have a wallet extension loaded:
- Load the test extension (see above), or
- Install the Aztec Keychain browser extension

### SharedArrayBuffer errors

The app requires `SharedArrayBuffer` for the WASM proving engine. The dev server is configured with the correct headers. If you see errors, ensure you're accessing via `localhost` (not `127.0.0.1`).

### Contract compilation fails

Ensure you have the correct version of `aztec` CLI installed:

```bash
aztec --version
```

The version should match the `aztec-packages` repository version.
