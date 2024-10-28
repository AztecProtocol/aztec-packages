#!/bin/bash

# Script to troubleshoot chaos network experiment failures
# Specifically for network chaos (latency) on StatefulSet pods

# Check pod status
check_pod_status() {
    local namespace=$1
    local pod_name=$2
    echo "=== Checking Pod Status ==="
    kubectl get pod -n $namespace $pod_name -o wide
    kubectl describe pod -n $namespace $pod_name
}

# Check network policies
check_network_policies() {
    local namespace=$1
    echo "=== Checking Network Policies ==="
    kubectl get networkpolicies -n $namespace
}

# Check chaos experiment status
check_chaos_status() {
    local namespace=$1
    echo "=== Checking Chaos Experiment Status ==="
    kubectl get chaosengine -n $namespace
    kubectl get chaosresult -n $namespace
}

# Check iptables rules on the node
check_iptables() {
    local node=$1
    echo "=== Checking iptables rules ==="
    kubectl debug node/$node -it --image=ubuntu -- bash -c "apt-get update && apt-get install -y iptables && iptables -L"
}

# Check privilege settings
check_privileges() {
    local namespace=$1
    local pod_name=$2
    echo "=== Checking Pod Security Context ==="
    kubectl get pod $pod_name -n $namespace -o jsonpath='{.spec.securityContext}'
}

# Main execution
main() {
    local namespace="smoke"
    local pod_name="spartan-aztec-network-validator-0"
    local node=$(kubectl get pod -n $namespace $pod_name -o jsonpath='{.spec.nodeName}')

    check_pod_status $namespace $pod_name
    check_network_policies $namespace
    check_chaos_status $namespace
    check_iptables $node
    check_privileges $namespace $pod_name
}

# Run script
main