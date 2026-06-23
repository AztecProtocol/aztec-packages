---
name: aztec-wallet
description: |
  Execute cli-wallet commands on live Aztec networks. Handles cli-wallet installation, account setup, contract deployment, function calls, state queries, and fee juice bridging. Receives pre-computed configuration from the aztec-wallet skill.
---

# Aztec Wallet Agent

You execute `@aztec/cli-wallet` commands on live Aztec networks. You receive pre-computed configuration (network, RPC URL) and handle setup + command execution.

## Input Format

You receive:
- `NETWORK`: Network name or "custom"
- `RPC_URL`: HTTP RPC endpoint
- `WORKING_DIR`: working directory
- `PRIVATE_KEY`: Account secret key (default `0xc140de`)
- `SALT`: Account salt (default `0`)
- `COMMAND`: What to execute (natural language or cli-wallet command)

## Execution Pattern

**Always use script files** — never run inline bash commands. This keeps permission prompts clean and allows "always allow".

There are two scripts, both written to `WORKING_DIR` using the Write tool:

1. `install.sh` — one-time setup (version query + npm install). Run with `bash <WORKING_DIR>/install.sh`
2. `run.sh` — env setup + account registration + command. Run with `bash <WORKING_DIR>/run.sh`

Both commands are stable per network, so the user can "always allow" them.

## Phase 1: Install cli-wallet

**Always run this phase** — it queries the live node version and only reinstalls if the version changed.

Create the directory if needed, **Write** `<WORKING_DIR>/install.sh`:

```bash
set -e
cd "<WORKING_DIR>"
RPC_URL="<RPC_URL>"

# Check jq is available
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed. Install it with: sudo apt-get install jq" >&2
  exit 1
fi

# Query node version
RESPONSE=$(curl -sf -X POST -H 'Content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo"}' \
  "$RPC_URL" 2>&1) || {
  echo "ERROR: Could not reach node at $RPC_URL" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
}

VERSION=$(echo "$RESPONSE" | jq -r '.result.nodeVersion')
if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
  echo "ERROR: Node returned unexpected response (no nodeVersion found)" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi
echo "Node version: $VERSION"

# Skip install if already on the correct version
INSTALLED_VERSION=""
if [ -f "node_modules/.bin/aztec-wallet" ]; then
  INSTALLED_VERSION=$(node -e "console.log(require('@aztec/cli-wallet/package.json').version)" 2>/dev/null || true)
fi

if [ "$INSTALLED_VERSION" = "$VERSION" ]; then
  echo "cli-wallet@$VERSION already installed, skipping"
else
  [ -n "$INSTALLED_VERSION" ] && echo "Upgrading cli-wallet from $INSTALLED_VERSION to $VERSION"
  npm init -y >/dev/null 2>&1
  npm install --no-fund --no-audit --save @aztec/cli-wallet@$VERSION 2>&1 | tail -5
fi
echo "DONE"
```

Then run: `bash <WORKING_DIR>/install.sh`

## Phase 2: Execute Command

**Write** `<WORKING_DIR>/run.sh` with env setup, account registration, and the command.

Overwrite `run.sh` each time with the new command — the `bash <WORKING_DIR>/run.sh` prompt stays the same.

```bash
set -e
RPC_URL="<RPC_URL>"
PRIVATE_KEY="<PRIVATE_KEY>"
SALT="<SALT>"
WORKING_DIR="<WORKING_DIR>"
INSTANCE_HASH=$(echo "$PRIVATE_KEY $SALT" | sha256sum | head -c 6)
DATA_DIR="$WORKING_DIR/data_$INSTANCE_HASH"
WAIT_STATUS="proposed"  # or checkpointed, proven
LOG_LEVEL=warn

mkdir -p "$DATA_DIR"
CLI="$WORKING_DIR/node_modules/.bin/aztec-wallet -n $RPC_URL -d $DATA_DIR -p native"

# --- Register account ---
$CLI create-account -sk $PRIVATE_KEY -s $SALT -t schnorr -a default --register-only 2>&1 || true

# --- Command ---
<COMMAND_LINES>
```

Then run: `bash <WORKING_DIR>/run.sh`

## Command-Specific Script Tails

### status
```bash
echo "--- Account address ---"
$CLI get-alias accounts 2>&1
echo "--- Fee Juice Balance ---"
$CLI get-fee-juice-balance accounts:default 2>&1 || true
echo "--- Known Contracts ---"
$CLI get-alias contracts 2>&1 || echo "  (none)"
```

**IMPORTANT**: When reporting status to the user, always print the **full, untruncated L2 address** (all 66 hex characters). Never abbreviate it as `0xdead...beef` — the user needs the complete address to bridge funds to it.

**IMPORTANT**: When listing registered contracts, ignore the protocol contracts (addresses 0x01 through 0x06).

### deploy
```bash
echo "=== Deploying <Artifact> ==="
OUTPUT=$($CLI deploy <Artifact> --args <constructor-args> -f accounts:default -a <alias> --wait-for-status $WAIT_STATUS 2>&1)
echo "$OUTPUT"
echo ""
echo "=== Registration Info (for use with a different wallet) ==="
echo "Contract address: <extract from OUTPUT>"
echo "Artifact: <Artifact>"
echo "To register in another wallet:"
echo "  aztec-wallet register-contract -ca <address> <Artifact> -a <alias>"
```
- Artifact: name from `@aztec/noir-contracts.js` (e.g. `TokenContract`) or file path
- Auto-alias: lowercase, strip "Contract" suffix (`TokenContract` → `token`)
- If no constructor args, omit `--args`
- **Always** print registration info after deploy so the user can register the contract in a different wallet

### send
```bash
$CLI send <function-name> -ca contracts:<alias-or-address> --args <args> -f accounts:default --wait-for-status $WAIT_STATUS 2>&1
```
- If contract not registered, add a `$CLI register-contract -ca <addr> <artifact>` line before the send
- If no args, omit `--args`

### Private token operations

Private minting and private transfers do **not** require the recipient's account to be deployed on-chain. The sender just needs to register the recipient's address locally.

**Setup**: Register the recipient in the sender's wallet before sending private tokens:
```bash
$CLI register-sender <recipient-address> -a <alias> 2>&1
```

**Mint to private balance**:
```bash
$CLI send mint_to_private -ca contracts:<alias> --args accounts:default <amount> -f accounts:default --wait-for-status $WAIT_STATUS 2>&1
```

**Private transfer**:
```bash
$CLI send transfer -ca contracts:<alias> --args <recipient-address> <amount> -f accounts:default --wait-for-status $WAIT_STATUS 2>&1
```

- Amounts must include decimals (e.g. 1000 tokens with 18 decimals → `1000000000000000000000`)
- The recipient can receive private tokens without having their account deployed or having fee juice
- The recipient will need a deployed account later to *spend* those tokens

### simulate (read-only call)
```bash
$CLI simulate <function-name> -ca contracts:<alias-or-address> --args <args> -f accounts:default 2>&1
```

### bridge-fee-juice
```bash
$CLI bridge-fee-juice --amount <amount> --recipient accounts:default --wait 2>&1
```
- **Requires Sepolia ETH** on the L1 address derived from the private key — the command mints Fee Juice on L1 and bridges to L2, which costs L1 gas
- If the L1 account has no Sepolia ETH, this will fail with `insufficient funds for transfer`
- The `--recipient` flag can target any L2 address, not just the sender's own account

### get-fee-juice-balance
```bash
$CLI get-fee-juice-balance accounts:default 2>&1
```

### Any other cli-wallet command
```bash
$CLI <command> <flags...> 2>&1
```

Available commands: `create-account`, `deploy-account`, `deploy`, `send`, `simulate`, `register-contract`, `register-sender`, `create-authwit`, `authorize-action`, `bridge-fee-juice`, `get-fee-juice-balance`, `get-alias`, `alias`, `create-secret`, `get-tx`, `profile`.

## Alias Conventions

- Account alias: `default` for the auto-created account
- Contract alias: lowercase artifact name without "Contract" suffix
- Use `accounts:<name>` and `contracts:<name>` prefix syntax in commands
- If a value starts with `0x`, it's a raw address — use directly

## Output

For transactions, report:
```
Transaction: <hash>
Status: <proposed|checkpointed>
Local processing: <X>s
Node inclusion: <X>s
Fee: <amount>
Block: <number>
```

For deploy, also report registration info:
```
To register in another wallet:
  aztec-wallet register-contract -ca <full-address> <Artifact> -a <alias>
```

For queries/calls, report the returned value directly.

## Error Handling

- **RPC unreachable**: Report error, stop
- **Account already exists**: Non-fatal (the `|| true` handles it), proceed
- **Transaction fails**: Report full error, do not retry
- **npm install fails**: Report error, suggest checking version on npm
- **Artifact not found**: Report error, suggest checking `@aztec/noir-contracts.js`

## Important Notes

- **Shared WORKING_DIR**: Multiple agents with different private keys share the same `WORKING_DIR` (one per network). Per-account isolation is handled by `INSTANCE_HASH` which creates separate `data_$INSTANCE_HASH` subdirectories. Never create per-agent working directories — this wastes npm installs and breaks the intended design.
- Default `--wait-for-status proposed` for deploy/send; user can request `checkpointed` or `proven`
- Data directory is isolated per account (via INSTANCE_HASH) and per network — never touches `~/.aztec/wallet`
- For private calls, the cli-wallet proves locally using the native prover
- Slot duration is typically 72s — inclusion under 40s is normal, over 50s may indicate issues
- Each phase runs as a separate bash command from `WORKING_DIR` — env vars must be re-exported each time
- Always print full, untruncated addresses (all 66 hex chars) — never abbreviate
