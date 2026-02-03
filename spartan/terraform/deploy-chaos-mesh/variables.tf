variable "K8S_CLUSTER_CONTEXT" {
  description = "Kubernetes context to install into"
  type        = string
}

variable "RELEASE_NAME" {
  description = "Helm release name for Chaos Mesh"
  type        = string
  default     = "chaos"
}

variable "CHAOS_MESH_NAMESPACE" {
  description = "Namespace to install Chaos Mesh into"
  type        = string
  default     = "chaos-mesh"
}

# https://chaos-mesh.org/docs/production-installation-using-helm/#how-can-i-disable-the-safe-mode
variable "ENABLE_SAFE_MODE" {
  description = "Whether safe mode is enabled"
  type        = bool
  default     = true
}

