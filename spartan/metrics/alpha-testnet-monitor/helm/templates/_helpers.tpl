{{/* Name of the chart. */}}
{{- define "alpha-testnet-monitor.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* App name. */}}
{{- define "alpha-testnet-monitor.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/* chart-level labels to be applied to every resource that supports them. */}}
{{- define "alpha-testnet-monitor.labels" -}}
helm.sh/chart: {{ include "alpha-testnet-monitor.name" . }}
{{ include "alpha-testnet-monitor.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* selector labels that will be used to identify all resources belonging to the chart. */}}
{{- define "alpha-testnet-monitor.selectorLabels" -}}
app.kubernetes.io/name: {{ include "alpha-testnet-monitor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* name of the service account to use */}}
{{- define "alpha-testnet-monitor.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "alpha-testnet-monitor.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
