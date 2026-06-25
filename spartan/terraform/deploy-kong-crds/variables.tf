variable "GKE_CLUSTER_CONTEXT" {
  description = "Kubernetes context for the GKE cluster that should receive Kong CRDs."
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-public"
}

variable "KONG_CRD_NAMESPACE" {
  description = "Namespace used only to own the Kong CRD Helm release metadata."
  type        = string
  default     = "kong-crds"
}

variable "KONG_CRD_HELM_RELEASE_NAME" {
  description = "Helm release name for the Kong CRD-only release."
  type        = string
  default     = "kong-crds"
}

variable "KONG_CRD_HELM_CHART_VERSION" {
  description = "kong/kong chart version used to install CRDs. 3.2.0 matches kong/ingress 0.24.0."
  type        = string
  default     = "3.2.0"
}
