{{/*
Create a default fully qualified app name.
*/}}
{{- define "network-shaping.fullname" -}}
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

{{/*
Common labels
*/}}
{{- define "network-shaping.labels" -}}
helm.sh/chart: {{ include "network-shaping.chart" . }}
{{ include "network-shaping.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "chaos-mesh.selectorLabels" -}}
app.kubernetes.io/name: {{ include "network-shaping.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
