#!/usr/bin/env bash
set -euo pipefail

# Public upstream resolvers
CLOUDFLARE_DNS=1.1.1.1
GOOGLE_DNS=8.8.8.8
PUBLIC_DNS="$CLOUDFLARE_DNS $GOOGLE_DNS"

# Convert the flag to lower-case
DNS_TOGGLE="${KIND_FIX_DNS:-false}"
DNS_TOGGLE="${DNS_TOGGLE,,}"

case "$DNS_TOGGLE" in
  true)
    echo "Patching CoreDNS namespace resolution …"

    # Ensure we are only applying to the kind context
    if kubectl config get-contexts kind-kind >/dev/null 2>&1; then
      kubectl config use-context kind-kind
    else
      echo "Error: kind-kind context not found. Is the kind cluster running?" >&2
      exit 1
    fi

    # Grab the existing ConfigMap and rewrite the forward block with jq
    CORE_FIXED="$(kubectl -n kube-system get cm coredns -o json | \
      jq -c --arg upstream "$PUBLIC_DNS" '
        .data.Corefile |= sub(
          "forward \\. [^{}]*\\{";
          "forward . \($upstream) {"
        )')"

    # Apply the patch and restart the deployment
    kubectl -n kube-system patch cm coredns \
      --type merge --patch "$CORE_FIXED"

    kubectl -n kube-system rollout restart deploy/coredns
    ;;

  ""|false)
    echo "KIND_FIX_DNS not set/false – skipping DNS patch"
    ;;

  *)
    echo "KIND_FIX_DNS must be \"true\" or \"false\" (got '$KIND_FIX_DNS')" >&2
    exit 1
    ;;
esac
