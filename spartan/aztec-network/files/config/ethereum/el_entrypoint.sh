reth node {{ include "helpers.flag" (list "http.addr" "0.0.0.0") }}
{{- include "helpers.flag" (list "http.port" .Values.ethereum.el.service.port) }}
{{- include "helpers.flag" (list "builder.gaslimit" .Values.ethereum.el.gasLimit) }}
{{- include "helpers.flag" (list "txpool.gas-limit" .Values.ethereum.el.gasLimit) }}
              --chain /genesis/genesis.json
              --authrpc.jwtsecret /jwt/jwtsecret
              --datadir /data
              --dev