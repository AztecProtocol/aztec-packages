
helm repo add cilium https://helm.cilium.io

helm upgrade --install cilium cilium/cilium --version 1.16.3 --namespace kube-system