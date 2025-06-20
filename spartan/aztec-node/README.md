## Aztec Node Chart

A chart for deploying a Stateful set of nodes into a kubernetes cluster.

## Networking
There are two options on how to run these containers with external networking.
- hostNetwork
- nodePort

***Host Networking***
Host networking is useful whenever you want to deploy multiple replicas that all have open ports on the nodes they are running on. However, this will only work if the pod's affinity is set accordingly.
If you deploy a set of containers that all have the same p2p ports, they need to be scheduled onto different k8s nodes.

***Node Port***
If you do not have access to multiple k8s nodes, you can deploy using the `service.p2p.enableNodePort` option. If you want to run multiple instances on the same k8s node, you will need to deploy this chart mulitple
times, each with a different p2p port set.

## Examples
### Running an aztec full node
```yaml
# -- Image to use for the container
image:
  # -- Image repository
  repository: aztecprotocol/aztec
  # -- Image tag
  tag: 0.85.0-alpha-testnet.9
  # -- Container pull policy
  pullPolicy: IfNotPresent

network: alpha-testnet

hostNetwork: true

node:
  replicas: 1
  logLevel: "debug; info: aztec:simulator, json-rpc"

  l1ExecutionUrls: []
  l1ConsensusUrls: []

  startCmd:
    - --node
    - --archiver

  startupProbe:
    # -- Period seconds
    periodSeconds: 60
    # -- Failure threshold
    failureThreshold: 60

persistence:
  enabled: true
  size: 512Gi
  storageClassName: standard
  accessModes:
    - ReadWriteOnce
  selector: {}

service:
  p2p:
    enabled: true
    nodePortEnabled: false
    port: 40400
    announcePort: 40400
  admin:
    enabled: true
    port: 8081
  httpPort: 8080
```

## Example running a validator node
```yaml
image:
  repository: aztecprotocol/aztec
  tag: 0.85.0-alpha-testnet.9
  pullPolicy: IfNotPresent

network: alpha-testnet
hostNetwork: true

node:
  replicas: 1
  logLevel: "debug; info: aztec:simulator, json-rpc"

  l1ExecutionUrls: []
  l1ConsensusUrls: []

  l1Publisher:
    mnemonic: "your validator mnemonic"
    mnemonicStartIndex: 0

  startCmd:
    - --node
    - --archiver
    - --sequencer

  startupProbe:
    # -- Period seconds
    periodSeconds: 60
    # -- Failure threshold
    failureThreshold: 60

persistence:
  enabled: true
  size: 512Gi
  storageClassName: standard
  accessModes:
    - ReadWriteOnce
  selector: {}

service:
  p2p:
    enabled: true
    nodePortEnabled: false
    port: 40400
    announcePort: 40400
  admin:
    enabled: true
    port: 8081
  httpPort: 8080
```

# All options
| Option Path | Default | Description |
|------------|---------|-------------|
| nameOverride | "" | Overrides the chart name |
| fullnameOverride | "" | Overrides the chart computed fullname |
| image.repository | aztecprotocol/aztec | Image repository for the container |
| image.tag | alpha-testnet | Image tag for the container |
| image.pullPolicy | IfNotPresent | Container pull policy |
| podManagementPolicy | Parallel | Pod management policy |
| network | - | Network name - predefined network (alpha-testnet, devnet) |
| customNetwork.l1ChainId | - | L1 chain ID for custom network |
| customNetwork.registryContractAddress | - | Registry contract address for custom network |
| customNetwork.slashFactoryAddress | - | Slash factory address for custom network |
| customNetwork.feeAssetHandlerContractAddress | - | Fee asset handler contract address for custom network |
| rollupVersion | "canonical" | Which rollup contract to follow from the registry |
| hostNetwork | false | Use host network (disables nodePort service) |
| node.replicas | 1 | Number of replicas |
| node.logLevel | "info" | Log level (info, verbose, debug, trace) |
| node.l1Publisher.privateKeys | [] | Private keys for L1 publisher |
| node.l1Publisher.mnemonic | - | Mnemonic for L1 publisher |
| node.l1Publisher.mnemonicStartIndex | - | Starting index for mnemonic |
| node.l1ExecutionUrls | [] | Ethereum hosts (comma-separated list) |
| node.l1ConsensusUrls | [] | L1 consensus host URLs (comma-separated list) |
| node.l1ConsensusHostApiKeys | [] | API keys for L1 consensus hosts |
| node.l1ConsensusHostApiKeyHeaders | [] | API key headers for L1 consensus hosts |
| node.startCmd | ["--node", "--archiver"] | Startup command for the node |
| node.remoteUrl.archiver | - | Remote URL for archiver |
| node.remoteUrl.proverBroker | - | Remote URL for prover broker |
| node.remoteUrl.proverCoordinationNodes | [] | Remote URLs for prover coordination nodes |
| node.remoteUrl.blobSink | - | Remote URL for blob sink |
| node.coinbase | - | Address that will receive block or proof rewards |
| node.sentinel.enabled | false | Enable sentinel configuration for slashing information |
| node.metrics.otelExcludeMetrics | "" | Comma-separated list of metrics to exclude |
| node.metrics.otelCollectorEndpoint | "" | Collector endpoint (e.g., http://localhost:4318) |
| node.metrics.useGcloudLogging | false | Use GCP logging |
| node.storage.dataDirectory | /data | Data directory |
| node.storage.dataStoreMapSize | - | Data store map size (kB) |
| node.storage.worldStateMapSize | - | World state map size (kB) |
| node.storage.p2pStorageMapSize | - | P2P storage map size (kB) |
| node.storage.archiveStorageMapSize | - | Archive storage map size (kB) |
| node.nodeJsOptions | ["--no-warnings", "--max-old-space-size=4096"] | Node.js options |
| node.startupProbe.periodSeconds | 30 | Period seconds for startup probe |
| node.startupProbe.failureThreshold | 3 | Failure threshold for startup probe |
| persistence.enabled | false | Enable persistence (uses emptyDir when disabled) |
| persistence.existingClaim | null | Use an existing PVC |
| persistence.accessModes | ["ReadWriteOnce"] | Access modes for persistence |
| persistence.size | 100Gi | Requested size for persistence |
| persistence.storageClassName | null | Storage class name for persistence |
| persistence.annotations | {} | Annotations for volume claim template |
| persistence.selector | {} | Selector for volume claim template |
| updateStrategy.type | RollingUpdate | Update strategy for the statefulset |
| initContainers | [] | Additional init containers |
| service.ingress.enabled | false | Enable ingress |
| service.ingress.annotations | {} | Ingress annotations |
| service.ingress.hosts | [] | Ingress hosts |
| service.p2p.enabled | true | Enable P2P service |
| service.p2p.nodePortEnabled | true | Enable node port for P2P service |
| service.p2p.port | 40400 | P2P port |
| service.p2p.announcePort | 40400 | P2P announce port |
| service.admin.enabled | true | Enable admin service |
| service.admin.port | 8081 | Admin port |
| service.httpPort | 8080 | HTTP port |
| certificate.enabled | false | Enable certificate configuration |
| certificate.domains | [] | Certificate domains |
| rbac.create | true | Create RBAC resources |
| rbac.clusterRules | See values.yaml | Required ClusterRole rules |
| rbac.rules | See values.yaml | Required Role rules |
| serviceAccount.create | true | Create a service account |
| serviceAccount.name | "" | Name of the service account |
| serviceAccount.annotations | {} | Annotations for the service account |
