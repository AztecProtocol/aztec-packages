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

{{/*
Aztec Image
*/}}
{{- define "aztec-network.image" -}}
image: {{ .Values.images.aztec.image }}
imagePullPolicy: {{ .Values.images.aztec.pullPolicy }}
{{- end -}}



{{- define "aztec-network.pxeUrl" -}}
http://{{ include "aztec-network.fullname" . }}-pxe.{{ .Release.Namespace }}:{{ .Values.pxe.service.nodePort }}
{{- end -}}

{{- define "aztec-network.bootNodeUrl" -}}
http://{{ include "aztec-network.fullname" . }}-boot-node-0.{{ include "aztec-network.fullname" . }}-boot-node.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.bootNode.service.nodePort }}
{{- end -}}

{{- define "aztec-network.validatorUrl" -}}
http://{{ include "aztec-network.fullname" . }}-validator-lb.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.validator.service.nodePort }}
{{- end -}}

{{- define "aztec-network.blobSinkUrl" -}}
http://{{ include "aztec-network.fullname" . }}-blob-sink.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.blobSink.service.nodePort }}
{{- end -}}

{{- define "aztec-network.metricsHost" -}}
http://{{ include "aztec-network.fullname" . }}-metrics.{{ .Release.Namespace }}
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

{{/*
P2P Setup Container
*/}}
{{- define "aztec-network.p2pSetupContainer" -}}
- name: setup-p2p-addresses
  image: bitnami/kubectl
  command:
    - /bin/sh
    - -c
    - |
      cp /scripts/setup-p2p-addresses.sh /tmp/setup-p2p-addresses.sh && \
      chmod +x /tmp/setup-p2p-addresses.sh && \
      /tmp/setup-p2p-addresses.sh
  env:
    - name: NETWORK_PUBLIC
      value: "{{ .Values.network.public }}"
    - name: NAMESPACE
      value: {{ .Release.Namespace }}
    - name: P2P_TCP_PORT
      value: "{{ .Values.validator.service.p2pTcpPort }}"
    - name: P2P_UDP_PORT
      value: "{{ .Values.validator.service.p2pUdpPort }}"
  volumeMounts:
    - name: scripts
      mountPath: /scripts
    - name: p2p-addresses
      mountPath: /shared/p2p
{{- end -}}

{{/*
Service Address Setup Container
*/}}
{{- define "aztec-network.serviceAddressSetupContainer" -}}
- name: setup-service-addresses
  image: bitnami/kubectl
  command:
    - /bin/bash
    - -c
    - |
      cp /scripts/setup-service-addresses.sh /tmp/setup-service-addresses.sh && \
      chmod +x /tmp/setup-service-addresses.sh && \
      /tmp/setup-service-addresses.sh
  env:
    - name: NETWORK_PUBLIC
      value: "{{ .Values.network.public }}"
    - name: NAMESPACE
      value: {{ .Release.Namespace }}
    - name: TELEMETRY
      value: "{{ .Values.telemetry.enabled }}"
    - name: OTEL_COLLECTOR_ENDPOINT
      value: "{{ .Values.telemetry.otelCollectorEndpoint }}"
    - name: EXTERNAL_ETHEREUM_HOSTS
      value: "{{ .Values.ethereum.execution.externalHosts }}"
    - name: ETHEREUM_PORT
      value: "{{ .Values.ethereum.execution.service.port }}"
    - name: EXTERNAL_ETHEREUM_CONSENSUS_HOST
      value: "{{ .Values.ethereum.beacon.externalHost }}"
    - name: EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY
      value: "{{ .Values.ethereum.beacon.apiKey }}"
    - name: EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER
      value: "{{ .Values.ethereum.beacon.apiKeyHeader }}"
    - name: ETHEREUM_CONSENSUS_PORT
      value: "{{ .Values.ethereum.beacon.service.port }}"
    - name: EXTERNAL_BOOT_NODE_HOST
      value: "{{ .Values.bootNode.externalHost }}"
    - name: BOOT_NODE_PORT
      value: "{{ .Values.bootNode.service.nodePort }}"
    - name: EXTERNAL_PROVER_NODE_HOST
      value: "{{ .Values.proverNode.externalHost }}"
    - name: PROVER_NODE_PORT
      value: "{{ .Values.proverNode.service.nodePort }}"
    - name: PROVER_BROKER_PORT
      value: "{{ .Values.proverBroker.service.nodePort }}"
    - name: USE_GCLOUD_LOGGING
      value: "{{ .Values.telemetry.useGcloudLogging }}"
    - name: SERVICE_NAME
      value: {{ include "aztec-network.fullname" . }}
  volumeMounts:
    - name: scripts
      mountPath: /scripts
    - name: config
      mountPath: /shared/config
{{- end -}}

{{/*
Sets up the OpenTelemetry resource attributes for a service
*/}}
{{- define "aztec-network.otelResourceSetupContainer" -}}
{{- $serviceName := base $.Template.Name | trimSuffix ".yaml" -}}
- name: setup-otel-resource
  {{- include "aztec-network.image" . | nindent 2 }}
  command:
    - /bin/bash
    - -c
    - |
      cp /scripts/setup-otel-resource.sh /tmp/setup-otel-resource.sh && \
      chmod +x /tmp/setup-otel-resource.sh && \
      /tmp/setup-otel-resource.sh
  env:
    - name: POD_IP
      valueFrom:
        fieldRef:
          fieldPath: status.podIP
    - name: K8S_POD_UID
      valueFrom:
        fieldRef:
          fieldPath: metadata.uid
    - name: K8S_POD_NAME
      valueFrom:
        fieldRef:
          fieldPath: metadata.name
    - name: K8S_NAMESPACE_NAME
      valueFrom:
        fieldRef:
          fieldPath: metadata.namespace
    - name: OTEL_SERVICE_NAME
      value: "{{ $serviceName }}"
    - name: OTEL_RESOURCE_ATTRIBUTES
      value: 'service.namespace={{ .Release.Namespace }},environment={{ .Values.environment | default "production" }}'
  volumeMounts:
    - name: scripts
      mountPath: /scripts
    - name: config
      mountPath: /shared/config
{{- end -}}

{{/**
Anti-affinity when running in public network mode
*/}}
{{- define "aztec-network.publicAntiAffinity" -}}
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
            - key: app
              operator: In
              values:
                - validator
                - boot-node
                - prover-node
                - prover-broker
        topologyKey: "kubernetes.io/hostname"
        namespaceSelector: {}
{{- end -}}

{{- define "aztec-network.gcpLocalSsd" -}}
nodeSelector:
  local-ssd: "true"
{{- end -}}

{{- define "aztec-network.waitForEthereum" -}}
if [ -n "${EXTERNAL_ETHEREUM_HOSTS}" ]; then
  export ETHEREUM_HOSTS="${EXTERNAL_ETHEREUM_HOSTS}"
fi
echo "Awaiting any ethereum node from: ${ETHEREUM_HOSTS}"
while true; do
  for HOST in $(echo "${ETHEREUM_HOSTS}" | tr ',' '\n'); do
    if curl -s -X POST -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":67}' \
      "${HOST}" | grep -q 0x; then
      echo "Ethereum node ${HOST} is ready!"
      break 2
    fi
    echo "Waiting for Ethereum node ${HOST}..."
  done
  sleep 5
done
{{- end -}}
