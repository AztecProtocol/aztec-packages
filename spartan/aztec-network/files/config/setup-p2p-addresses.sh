#!/bin/sh

POD_NAME=$(echo $HOSTNAME)

if [ "${NETWORK_PUBLIC}" = "true" ]; then
    # First try treating HOSTNAME as a pod name
    NODE_NAME=$(kubectl get pod $POD_NAME -n ${NAMESPACE} -o jsonpath='{.spec.nodeName}' 2>/dev/null)

    # If that fails, HOSTNAME might be the node name itself
    if [ $? -ne 0 ]; then
        echo "Could not find pod $POD_NAME, assuming $POD_NAME is the node name"
        NODE_NAME=$POD_NAME
    fi

    EXTERNAL_IP=$(kubectl get node $NODE_NAME -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}')

    if [ -z "$EXTERNAL_IP" ]; then
        echo "Warning: Could not find ExternalIP, falling back to InternalIP"
        EXTERNAL_IP=$(kubectl get node $NODE_NAME -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}')
    fi

    IP=${EXTERNAL_IP}
else
    # Get pod IP for non-public networks
    IP=$(hostname -i)
fi

# Write addresses to file for sourcing
echo "export P2P_IP=${IP}" > /shared/config/p2p-addresses
echo "export P2P_PORT=${P2P_PORT}" >> /shared/config/p2p-addresses

echo "P2P addresses configured:"
cat /shared/config/p2p-addresses
