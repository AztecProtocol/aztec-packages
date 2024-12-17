# See https://registry.terraform.io/providers/grafana/grafana/latest/docs

terraform {
  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 3.13.2"
    }
  }

  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "metrics-deploy/us-west1-a/aztec-gke/metrics/alerting/terraform.tfstate"
  }
}

provider "grafana" {
  url  = var.grafana_url
  auth = var.grafana_auth
}

resource "grafana_folder" "rule_folder" {
  title = "Alerting Rules"
}


resource "grafana_contact_point" "slack" {
  name = "slack"

  slack {
    url = var.slack_url
  }
}

resource "grafana_notification_policy" "ignore_policy" {
  contact_point = grafana_contact_point.slack.name
  group_by      = ["k8s_namespace_name"]


  policy {
    contact_point = grafana_contact_point.slack.name
    matcher {
      label = "k8s_namespace_name"
      match = "=~"
      value = "devnet|troll-turtle"
    }
  }

  policy {
    mute_timings  = ["always"]
    contact_point = grafana_contact_point.slack.name
  }
}

resource "grafana_mute_timing" "mute_timing_always" {
  name = "always"

  intervals {
  }
}

resource "grafana_rule_group" "rule_group_minutely" {
  org_id           = 1
  name             = "minutely-evaluation-group"
  folder_uid       = grafana_folder.rule_folder.uid
  interval_seconds = 60

  rule {
    name      = "Proven Chain is Live"
    condition = "B"

    data {
      ref_id = "A"

      relative_time_range {
        from = 600
        to   = 0
      }

      datasource_uid = "spartan-metrics-prometheus"
      model = jsonencode({
        disableTextWrap     = false,
        editorMode          = "code",
        expr                = "increase(aztec_archiver_block_height{aztec_status=\"proven\"}[30m])",
        fullMetaSearch      = false,
        includeNullMetadata = true,
        instant             = true,
        intervalMs          = 1000,
        legendFormat        = "__auto",
        maxDataPoints       = 43200,
        range               = false,
        refId               = "A",
        useBackend          = false

      })
    }
    data {
      ref_id = "B"

      relative_time_range {
        from = 600
        to   = 0
      }

      datasource_uid = "__expr__"
      model = jsonencode(
        {
          conditions = [
            {
              evaluator = { params = [1], type = "lt" },
              operator  = { type = "and" },
              query     = { params = ["C"] },
              reducer   = { params = [], type = "last" },
              type      = "query"
            }
          ],
          datasource    = { type = "__expr__", uid = "__expr__" },
          expression    = "A",
          intervalMs    = 1000,
          maxDataPoints = 43200,
          refId         = "C",
          type          = "threshold"
        }
      )
    }

    no_data_state  = "NoData"
    exec_err_state = "Error"
    for            = "1m"
    annotations    = {}
    labels         = {}
    is_paused      = false
  }

}
