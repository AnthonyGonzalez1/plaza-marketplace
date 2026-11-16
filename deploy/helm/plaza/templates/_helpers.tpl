{{/*
Labels shared by every object of the chart.
*/}}
{{- define "plaza.labels" -}}
app.kubernetes.io/name: plaza
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Labels that identify the pods of one component (store-api, web, postgres). Deployments and
Services use them to find their pods, so they must never change after the first install.
Call it with: include "plaza.selectorLabels" (dict "root" . "component" "web")
*/}}
{{- define "plaza.selectorLabels" -}}
app.kubernetes.io/name: plaza
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
