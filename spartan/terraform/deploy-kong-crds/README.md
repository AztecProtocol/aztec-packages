# Kong CRDs

One-time Kong CRD bootstrap for clusters that run Kong Ingress Controller.

This installs the `kong/kong` chart as a CRD-only release: Kong Gateway and the ingress controller are disabled, Helm's special `crds/` path is skipped, and only the chart's managed Kong CRD templates are rendered. The release adopts existing unowned Kong CRDs, and the RPC gateway module never renders CRDs, so cluster-scoped CRD ownership stays here.

```bash
terraform -chdir=terraform/deploy-kong-crds init -backend-config=public.tfbackend
terraform -chdir=terraform/deploy-kong-crds apply -var-file=public.tfvars.example
```

Use `private.tfbackend` and `private.tfvars.example` for the private cluster.
