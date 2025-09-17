{{/*
Expand the name of the chart.
*/}}
{{- define "aztec-keystore.serviceAccountName" -}}
{{- .Values.serviceAccount.name | default (printf "%s-%s" .Release.Name "keystore") }}
{{- end }}

