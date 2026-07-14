{{- define "otel-metrics-collector.fullname" -}}
{{- .Values.fullnameOverride | default .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "otel-metrics-collector.configName" -}}
{{- printf "%s-config" (include "otel-metrics-collector.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "otel-metrics-collector.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: metrics
{{- end -}}

{{- define "otel-metrics-collector.labels" -}}
{{- $base := dict "app.kubernetes.io/name" .Chart.Name "app.kubernetes.io/instance" .Release.Name "app.kubernetes.io/component" "metrics" -}}
{{- $labels := mergeOverwrite (deepCopy (.Values.labels | default dict)) $base -}}
{{- toYaml $labels -}}
{{- end -}}

{{- define "otel-metrics-collector.resourceAttributes" -}}
{{- $defaults := dict "service.name" (include "otel-metrics-collector.fullname" .) "service.namespace" .Release.Namespace "k8s.namespace.name" .Release.Namespace -}}
{{- $attrs := mergeOverwrite $defaults (.Values.resourceAttributes | default dict) -}}
{{- $result := list -}}
{{- range $key, $value := $attrs -}}
{{- $result = append $result (dict "action" "upsert" "key" $key "value" $value) -}}
{{- end -}}
{{- toYaml $result -}}
{{- end -}}

{{- define "otel-metrics-collector.scrapeConfigs" -}}
{{- $result := list -}}
{{- range $config := .Values.scrapeConfigs -}}
{{- $scrapeConfig := dict "job_name" $config.job_name "scrape_interval" ($config.scrape_interval | default "15s") "metrics_path" ($config.metrics_path | default "/metrics") -}}
{{- $_ := set $scrapeConfig "static_configs" (list (dict "targets" $config.targets "labels" ($config.labels | default dict))) -}}
{{- $metricRelabelConfigs := list -}}
{{- range $rule := ($config.metric_relabel_configs | default list) -}}
{{- $ruleConfig := dict "action" $rule.action -}}
{{- with $rule.source_labels -}}
{{- if gt (len .) 0 -}}
{{- $_ := set $ruleConfig "source_labels" . -}}
{{- end -}}
{{- end -}}
{{- with $rule.regex -}}
{{- $_ := set $ruleConfig "regex" . -}}
{{- end -}}
{{- with $rule.target_label -}}
{{- $_ := set $ruleConfig "target_label" . -}}
{{- end -}}
{{- with $rule.replacement -}}
{{- $_ := set $ruleConfig "replacement" . -}}
{{- end -}}
{{- with $rule.separator -}}
{{- $_ := set $ruleConfig "separator" . -}}
{{- end -}}
{{- $metricRelabelConfigs = append $metricRelabelConfigs $ruleConfig -}}
{{- end -}}
{{- if gt (len $metricRelabelConfigs) 0 -}}
{{- $_ := set $scrapeConfig "metric_relabel_configs" $metricRelabelConfigs -}}
{{- end -}}
{{- $result = append $result $scrapeConfig -}}
{{- end -}}
{{- toYaml $result -}}
{{- end -}}
