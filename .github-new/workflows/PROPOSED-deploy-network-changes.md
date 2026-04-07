# Proposed changes to .github/workflows/deploy-network.yml

Add `validator_ha_replica_count` input to both workflow_call and workflow_dispatch:

```yaml
# Add after ha_docker_image input in both workflow_call and workflow_dispatch sections:
      validator_ha_replica_count:
        description: "Number of pod replicas per HA validator release (optional, defaults to VALIDATOR_REPLICAS)"
        required: false
        type: string
```

Add env var in the deploy step (after VALIDATOR_HA_DOCKER_IMAGE line):

```yaml
          VALIDATOR_HA_REPLICA_COUNT: ${{ inputs.validator_ha_replica_count || '' }}
```

This allows overriding the HA replica count at deploy time via the workflow dispatch UI
or when called from other workflows (e.g., deploy-staging-public.yml).
