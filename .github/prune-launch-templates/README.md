
## Prune launch templates

Remember to use npm run build ( yarn build ) before pushing!

## Overview

This is a GitHub action to prune old launch templates older than a given age.

### Standard

```yaml
jobs:
    prune-launch-templates:
        timeout-minutes: 5              # normally it only takes 1-2 minutes
        name: Prune launch templates
        runs-on: ubuntu-latest
        permissions:
          actions: write
        steps:
          - name: Prune launch templates
            id: prune-launch-templates
            with:
              aws_access_key_id: ${{ secrets.DEPLOY_AWS_ACCESS_KEY_ID }}
              aws_secret_access_key: ${{ secrets.DEPLOY_AWS_SECRET_ACCESS_KEY }}
              aws_region: "us-west-2"
              max_age_in_days: 14
              dry_run: false

```

