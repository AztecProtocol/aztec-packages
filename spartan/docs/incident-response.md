# When the network is down

Go [here](http://35.203.137.58/d/cdtxao66xa1ogc/aztec-network-dashboard?orgId=1) (password is in `#network-alerts` description).

## If the pending chain is alive

There is an issue with the prover node.

Go [here](https://console.cloud.google.com/kubernetes/workload/overview?hl=en&inv=1&invt=AbkUYg&project=testnet-440309).

Filter the namespace to the network in question.

Are there any red exclamation marks?

If there are _not_, then try to restart the prover node.

1. Click on the prover node stateful set
2. Scroll down and click on it's managed pod
3. Click on the "Delete" button at the top of the page next to "Pod Details"

If there are red exclamation marks, you need to figure them out.

## If the pending chain is not alive

Go [here](https://console.cloud.google.com/kubernetes/workload/overview?hl=en&inv=1&invt=AbkUYg&project=testnet-440309).

Filter the namespace to the network in question.

Figure out why the pending chain is not alive.
