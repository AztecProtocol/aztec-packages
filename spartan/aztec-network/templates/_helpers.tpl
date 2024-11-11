{{/*
Expand the name of the chart.
*/}}
{{- define "aztec-network.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "aztec-network.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "aztec-network.fullname" -}}
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
{{- define "aztec-network.labels" -}}
helm.sh/chart: {{ include "aztec-network.chart" . }}
{{ include "aztec-network.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "aztec-network.selectorLabels" -}}
app.kubernetes.io/name: {{ include "aztec-network.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "aztec-network.ethereumHost" -}}
{{- if .Values.ethereum.externalHost -}}
http://{{ .Values.ethereum.externalHost }}:{{ .Values.ethereum.service.port }}
{{- else -}}
http://{{ include "aztec-network.fullname" . }}-ethereum.{{ .Release.Namespace }}:{{ .Values.ethereum.service.port }}
{{- end -}}
{{- end -}}

{{- define "aztec-network.pxeUrl" -}}
{{- if .Values.pxe.externalHost -}}
http://{{ .Values.pxe.externalHost }}:{{ .Values.pxe.service.port }}
{{- else -}}
http://{{ include "aztec-network.fullname" . }}-pxe.{{ .Release.Namespace }}:{{ .Values.pxe.service.port }}
{{- end -}}
{{- end -}}

{{- define "aztec-network.bootNodeUrl" -}}
{{- if .Values.bootNode.externalTcpHost -}}
http://{{ .Values.bootNode.externalTcpHost }}:{{ .Values.bootNode.service.nodePort }}
{{- else -}}
http://{{ include "aztec-network.fullname" . }}-boot-node-0.{{ include "aztec-network.fullname" . }}-boot-node.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.bootNode.service.nodePort }}
{{- end -}}
{{- end -}}

{{- define "aztec-network.validatorUrl" -}}
{{- if .Values.validator.externalTcpHost -}}
http://{{ .Values.validator.externalTcpHost }}:{{ .Values.validator.service.nodePort }}
{{- else -}}
http://{{ include "aztec-network.fullname" . }}-validator-0.{{ include "aztec-network.fullname" . }}-validator.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.validator.service.nodePort }}
{{- end -}}
{{- end -}}

{{- define "aztec-network.metricsHost" -}}
http://{{ include "aztec-network.fullname" . }}-metrics.{{ .Release.Namespace }}
{{- end -}}

{{- define "aztec-network.otelCollectorMetricsEndpoint" -}}
{{- if .Values.telemetry.enabled -}}
{{- if .Values.telemetry.otelCollectorEndpoint -}}
{{- .Values.telemetry.otelCollectorEndpoint -}}/v1/metrics
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "aztec-network.otelCollectorTracesEndpoint" -}}
{{- if .Values.telemetry.enabled -}}
{{- if .Values.telemetry.otelCollectorEndpoint -}}
{{- .Values.telemetry.otelCollectorEndpoint -}}/v1/traces
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "aztec-network.otelCollectorLogsEndpoint" -}}
{{- if .Values.telemetry.enabled -}}
{{- if .Values.telemetry.otelCollectorEndpoint -}}
{{- .Values.telemetry.otelCollectorEndpoint -}}/v1/logs
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "helpers.flag" -}}
{{- $name := index . 0 -}}
{{- $value := index . 1 -}}
{{- if $value -}}
  {{- if kindIs "string" $value -}}
    {{- if ne $value "" -}}
--{{ $name }} {{ $value }}{{ " " }}
    {{- end -}}
  {{- else -}}
--{{ $name }} {{ $value }}{{ " " }}
  {{- end -}}
{{- end -}}
{{- end -}}
