---
name: aztec-wallet
description: Run cli-wallet commands against a live Aztec network. Deploy contracts, send transactions, query state, bridge funds, and manage accounts.
argument-hint: <network-or-rpc-url> <command...>
---

# Aztec Wallet

Run `@aztec/cli-wallet` commands against a live Aztec network. Handles network resolution, cli-wallet installation, account setup, and alias management automatically.

## Known Networks

| Network | RPC Endpoint | Notes |
|---------|-------------|-------|
| `next-net` | `https://nextnet.aztec-labs.com` | Runs nightly from `next` branch |
| `testnet` | `https://rpc.testnet.aztec-labs.com` | Runs nightly from `v4-next` branch |

Custom RPC URLs (starting with `http://` or `https://` or IP addresses) are also accepted. If an IP address is provided without a port assume a default port of 8080.

## Step 1: Parse User Request

Determine from the user's message:
- **Network**: A known name from the table above, or a custom RPC URL
- **Command**: What the user wants to do — deploy, send, call, bridge, account setup, etc.
- **Private key** (optional): defaults to `0xc140de` (schnorr account, salt `0`)

If the request is ambiguous, ask the user to clarify.

## Step 2: Resolve RPC URL

- Known network name → look up from the table
- Unknown network → ask the user for their RPC URL
- Custom URL → use directly

Do NOT run any bash commands (no curl, no version query). The agent handles that.

## Step 3: Delegate to Agent

Spawn the `aztec-wallet` agent with a structured prompt:

```
FIRST: Read .claude/agents/aztec-wallet.md for full operational instructions.

Then execute the following:

NETWORK: <network-name or "custom">
RPC_URL: <resolved-url>
WORKING_DIR: /tmp/aztec-wallet-<network-name>/
PRIVATE_KEY: <hex, default 0xc140de>
SALT: 0

COMMAND: <what the user wants to do, in natural language or as a cli-wallet command>
```

The agent will query the node version, install the matching cli-wallet, set up the account, and execute the command.

**IMPORTANT — shared WORKING_DIR**: When spawning multiple agents (e.g. different accounts on the same network), they must ALL use the same `WORKING_DIR` (`/tmp/aztec-wallet-<network-name>/`). Do NOT create per-agent directories. Per-account isolation is already handled by `INSTANCE_HASH` inside the agent, which creates separate `data_$INSTANCE_HASH` subdirectories based on the private key and salt. Sharing the working dir also avoids redundant npm installs.

## Alias Conventions

The cli-wallet has a persistent alias system. Use it consistently:

- **Account alias**: `default` for the auto-created account, or user-provided names
- **Contract alias**: lowercase artifact name without "Contract" suffix (e.g. `TokenContract` → `token`)
- Aliases are prefixed by type when used: `accounts:default`, `contracts:token`
- When the user says "the token contract" or "on token", interpret as alias `contracts:token`
- When the user says "transfer to Grego", figure out from context which contract and function they mean

## Examples

- `/aztec-wallet testnet status` → show L2 address, balance, known contracts (no tx sent)
- `/aztec-wallet testnet deploy TokenContract` → deploy Token, alias as `token`
- `/aztec-wallet testnet send mint_to_public on token --args <addr> 1000` → mint tokens
- `/aztec-wallet testnet call balance_of_public on token --args <addr>` → read balance
- `/aztec-wallet testnet send mint_to_private on token --args <addr> 1000` → mint tokens to private balance
- `/aztec-wallet testnet send transfer on token --args <recipient> 150` → private transfer (register recipient first)
- `/aztec-wallet testnet bridge 1000 to <address>` → bridge Fee Juice (requires Sepolia ETH on L1)
- `/aztec-wallet next-net setup-account` → create account, show L2 address for bridging
- `/aztec-wallet https://my-rpc.com deploy ./path/to/artifact.json` → custom RPC + custom contract

## Notes on Private Transfers

- The recipient does **not** need their account deployed on-chain to receive private tokens
- The sender must `register-sender <recipient-address>` before sending private tokens
- The recipient will need a deployed account to later *spend* those tokens
- `bridge-fee-juice` requires Sepolia ETH on the L1 address — it won't work with an unfunded key
