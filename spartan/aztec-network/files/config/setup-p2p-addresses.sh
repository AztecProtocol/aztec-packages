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

    TCP_ADDR="${EXTERNAL_IP}:${P2P_TCP_PORT}"
    UDP_ADDR="${EXTERNAL_IP}:${P2P_UDP_PORT}"

else
    # Get pod IP for non-public networks
    POD_IP=$(hostname -i)
    TCP_ADDR="${POD_IP}:${P2P_TCP_PORT}"
    UDP_ADDR="${POD_IP}:${P2P_UDP_PORT}"
fi

# Write addresses to file for sourcing
echo "export P2P_TCP_ANNOUNCE_ADDR=${TCP_ADDR}" > /shared/p2p/p2p-addresses
echo "export P2P_TCP_LISTEN_ADDR=0.0.0.0:${P2P_TCP_PORT}" >> /shared/p2p/p2p-addresses
echo "export P2P_UDP_ANNOUNCE_ADDR=${UDP_ADDR}" >> /shared/p2p/p2p-addresses
echo "export P2P_UDP_LISTEN_ADDR=0.0.0.0:${P2P_UDP_PORT}" >> /shared/p2p/p2p-addresses

echo "P2P addresses configured:"
cat /shared/p2p/p2p-addresses