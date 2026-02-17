variable "NAMESPACE" {
  type        = string
  description = "Kubernetes namespace"
}

variable "RELEASE_NAME" {
  type        = string
  description = "Release name prefix"
}

variable "DB_PASSWORD" {
  type        = string
  sensitive   = true
  description = "PostgreSQL password (optional - auto-generated if not provided)"
  default     = null
}

variable "AZTEC_DOCKER_IMAGE" {
  type        = string
  description = "Aztec Docker image for migrations"
}

variable "CPU_REQUEST" {
  type        = string
  default     = "100m"
}

variable "MEMORY_REQUEST" {
  type        = string
  default     = "256Mi"
}

variable "CPU_LIMIT" {
  type        = string
  default     = "500m"
}

variable "MEMORY_LIMIT" {
  type        = string
  default     = "512Mi"
}

variable "STORAGE_SIZE" {
  type        = string
  default     = "1Gi"
}
