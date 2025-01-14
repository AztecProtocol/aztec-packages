# When the network is down

"Down" means that the proven chain has not advanced for over an hour.

We should get a slack message in `#network-alerts` when the network is down.

In the absence of a formal "on-call" schedule, a volunteer will self assign by giving a 👀 to the message.

When the incident is resolved, the volunteer will give a ✅ to the message.

## Helpful links

- [GCP Monitoring](https://console.cloud.google.com/monitoring/dashboards/builder/30d2d0d2-8dd2-4535-8074-e551dbc773aa)
- [GKE Workloads](https://console.cloud.google.com/kubernetes/workload/overview?hl=en&inv=1&invt=AbkUYg&project=testnet-440309)

## If the pending chain is alive

There is an issue with the prover node.

Filter the namespace to the network in question.

Are there any red exclamation marks?

If there are _not_, then try to restart the prover node.

1. Click on the prover node stateful set
2. Scroll down and click on it's managed pod
3. Click on the "Delete" button at the top of the page next to "Pod Details"

If there are red exclamation marks, you need to figure them out.

## If the pending chain is not alive

Filter the namespace to the network in question.

Figure out why the pending chain is not alive.

## If we can't figure it out

Go to the `#network-alerts` channel and ask for help.

Tag people in the message asking for help.
