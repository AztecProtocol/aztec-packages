---
name: aztec-node-rpc
description: Fetch data from an Aztec node over JSON-RPC — block numbers, blocks, checkpoints, txs, node info, fees, config, and admin/debug operations. Use whenever you need to query a live Aztec node (public testnet/mainnet gateways, drpc, or a node inside the k8s clusters) or a locally running node. Covers endpoints, auth, namespaces/methods, and a health-check helper.
argument-hint: [endpoint or network, e.g. "testnet block number" or "mainnet node info"]
---

# Query an Aztec node over JSON-RPC

An Aztec node exposes a JSON-RPC HTTP API. Use this skill to fetch chain/tx/node data from a
live network or a local node, and to run admin/debug operations.

## First: health-check the endpoint

Before anything else, confirm the endpoint answers. The canonical liveness call is
`aztec_getBlockNumber` (POST to `/`):

```bash
curl -s -X POST <URL> -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"aztec_getBlockNumber","params":[],"id":1}'
# -> {"jsonrpc":"2.0","id":1,"result":2445}
```

Or use the helper (auto-falls back to the legacy `node_` namespace, e.g. for drpc):

```bash
.claude/skills/aztec-node-rpc/check-rpc.sh https://v5.testnet.rpc.aztec-labs.com
# -> OK  https://v5.testnet.rpc.aztec-labs.com  (aztec_getBlockNumber)  block=2445
```

## Wire format

- **Transport**: HTTP POST to path `/`, JSON-RPC 2.0.
- **Method name**: `<namespace>_<method>`, e.g. `aztec_getBlock`, `aztecAdmin_getConfig`.
- **Ports** (for a node you run or port-forward): main API on **8080**, admin API on **8880**.
- Batch requests are supported (array of request objects).

```bash
curl -s -X POST http://localhost:8080/ -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"aztec_getBlock","params":[42],"id":1}'
```

## Namespaces

Registered by `registerAztecNodeRpcHandlers` (yarn-project/aztec-node/src/aztec-node/register_node_rpc_handlers.ts).

| Namespace | Server (port) | Auth | Purpose |
|---|---|---|---|
| `aztec` (alias `node`) | main (8080) | none | main read/query + `sendTx` |
| `p2p` | main (8080) | none | peer/mempool introspection |
| `aztecDebug` (alias `nodeDebug`) | main (8080) | none | debug ops; only if node started with debug enabled |
| `aztecAdmin` (alias `nodeAdmin`) | admin (8880) | API key | node config / lifecycle control |
| `prover` | admin (8880) | API key | prover-node ops (only on a prover node) |

> **Legacy aliases**: `node_*`, `nodeDebug_*`, `nodeAdmin_*` are pre-v5 aliases kept for
> back-compat. Most public nodes accept the new `aztec_*` names; **drpc only accepts the
> legacy `node_*` names** (see Endpoints). When `aztec_*` returns `-32601 method is not
> available`, retry with `node_*`.

See `references/methods.md` for the full per-namespace method list. Commonly used `aztec_*`
methods: `getBlockNumber`, `getCheckpointNumber`, `getBlock`, `getBlocks`, `getBlockData`,
`getChainTips`, `getNodeInfo`, `getNodeVersion`, `getChainId`, `getL1ContractAddresses`,
`getProtocolContractAddresses`, `getL1Constants`, `getSyncedL2SlotNumber`,
`getWorldStateSyncStatus`, `sendTx`, `getTxReceipt`, `getTxEffect`, `getTxByHash`,
`getPendingTxs`, `getPublicStorageAt`, `getContract`, `getCurrentMinFees`,
`getValidatorsStats`, `simulatePublicCalls`.

## Endpoints

### Public gateways (Kong `key-auth`)

Hosted at `*.rpc.aztec-labs.com`. Auth is either the header `x-aztec-api-key: <key>` **or**
the key as the first URL path segment (`https://host/<key>` — Kong copies it into the header,
then strips it before proxying).

| Network / rollup | Hosts | Auth |
|---|---|---|
| testnet v5 (canonical) | `v5.testnet.rpc.aztec-labs.com`, `canonical.testnet.rpc.aztec-labs.com` | keyless OK (rate-limited) |
| testnet v4 | `v4.testnet.rpc.aztec-labs.com`, `testnet.rpc.aztec-labs.com` | keyless OK |
| mainnet v5 (canonical) | `v5.mainnet.rpc.aztec-labs.com`, `canonical.mainnet.rpc.aztec-labs.com` | **key required** |
| mainnet v4 | `v4.mainnet.rpc.aztec-labs.com` | **key required** |

Testnet gateways allow keyless use; mainnet requires a consumer key.

```bash
# testnet — no key
curl -s -X POST https://v5.testnet.rpc.aztec-labs.com/ -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"aztec_getBlockNumber","params":[],"id":1}'

# mainnet — key from the secrets file (see below)
. ~/.claude/secrets/aztec-rpc.env
curl -s -X POST https://v5.mainnet.rpc.aztec-labs.com/ -H 'content-type: application/json' \
  -H "x-aztec-api-key: ${AZTEC_MAINNET_GATEWAY_KEY}" \
  -d '{"jsonrpc":"2.0","method":"aztec_getBlockNumber","params":[],"id":1}'
```

### drpc (third-party load balancer)

`https://lb.drpc.live/aztec-mainnet/<key>` and `https://lb.drpc.live/aztec-testnet/<key>`
(key is a URL path segment). **drpc only whitelists the legacy `node_*` namespace** — use
`node_getBlockNumber`, `node_getNodeInfo`, etc. `aztec_*` methods return `-32601`.

```bash
. ~/.claude/secrets/aztec-rpc.env
curl -s -X POST "$AZTEC_DRPC_TESTNET_URL" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getBlockNumber","params":[],"id":1}'
```

### Nodes inside the k8s clusters (kubectl port-forward)

Two GKE clusters (GCP project `testnet-440309`). Contexts: `aztec-gke-public`, `aztec-gke-private`.

| Cluster (context) | Namespaces of interest |
|---|---|
| `aztec-gke-public` | `testnet`, `testnet-rpc`, `mainnet` (public/standby), `mainnet-rpc` |
| `aztec-gke-private` | `next-net`, `mainnet` (ignition — active) |

Every node exposes the main API on **8080** and admin on **8880**. Service names follow
`<namespace>-<role>[-aztec-node]`:

| Service (svc/…) | Role |
|---|---|
| `<ns>-rpc-aztec-node` | public-facing RPC node (LoadBalancer) |
| `<ns>-validator`, `<ns>-validator-ha-1` | validator/sequencer node |
| `<ns>-prover-node` | prover node |
| `<ns>-p2p-bootstrap-node` | p2p bootstrap node |
| `<ns>-fisherman-aztec-node` | fisherman node (mainnet) |
| `testnet-rpc-v5-aztec-node`, `mainnet-rpc-canonical-aztec-node` | dedicated RPC upstreams (behind Kong) in the `*-rpc` namespaces |

List what's actually deployed:
`kubectl --context <ctx> -n <ns> get svc | grep -E 'aztec-node|validator|prover|bootstrap'`

Port-forward and query:

```bash
kubectl --context aztec-gke-public -n testnet port-forward svc/testnet-rpc-aztec-node 18080:8080 &
PF=$!
curl -s --retry 15 --retry-connrefused --retry-delay 1 -X POST http://localhost:18080/ \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"aztec_getBlockNumber","params":[],"id":1}'
kill $PF
```

For the **admin API** (port 8880) forward `svc/<name>-admin` on `18880:8880` and send the
namespace's admin key as `x-api-key`. The key lives in a k8s secret:

```bash
kubectl --context <ctx> -n <ns> get secret aztec-admin-api-key -o jsonpath='{.data.key}' | base64 -d
```

## Admin & debug APIs

- **Admin** (`aztecAdmin_*`, port 8880, needs API key): `getConfig`, `setConfig`, `pauseSync`,
  `resumeSync`, `pauseSequencer`, `resumeSequencer`, `rollbackTo`, `startSnapshotUpload`,
  `getSlashOffenses`, `reloadKeystore`. Auth header: `x-api-key: <key>` or `Authorization: Bearer <key>`.
- **Debug** (`aztecDebug_*`, port 8080, only if the node runs with debug on): `mineBlock`,
  `prove`, `warpL2TimeAtLeastTo`, `warpL2TimeAtLeastBy`, `registerContractFunctionSignatures`.
  Typically only enabled on local/sandbox nodes.

For a node you start locally, `aztec start --node ...` prints the admin API key on first boot
(persisted under the data dir); pass `--admin-port` / `--port` to change ports.

## Secrets

API keys are **not** stored in this skill. They live in `~/.claude/secrets/aztec-rpc.env`
(chmod 600) and are `source`d as shown above:

- `AZTEC_MAINNET_GATEWAY_KEY` — mainnet public-gateway consumer key (internal/test consumer,
  GCP secret `mainnet-rpc-consumer-client1`, project `testnet-440309`).
- `AZTEC_DRPC_MAINNET_URL` / `AZTEC_DRPC_TESTNET_URL` — full drpc URLs with the key embedded.

To (re)issue or inspect gateway consumer keys: `spartan/scripts/create_api_key.sh`, and
`gcloud secrets list --filter=rpc-consumer` (annotation `client_name` labels each consumer).
Refresh the stored mainnet key with:
`gcloud secrets versions access latest --secret=mainnet-rpc-consumer-client1 --project=testnet-440309`
