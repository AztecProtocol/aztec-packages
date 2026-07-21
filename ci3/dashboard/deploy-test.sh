#!/bin/bash
set -euo pipefail

# Deploy a test instance of the dashboard on ports 8082/8083 via SSM.
# Shares Redis and /logs-disk with the production instance.
# Requires: aws cli and SSM-enabled instance.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="us-east-2"
INSTANCE_NAME="${INSTANCE_NAME:-ci-dashboard}"

# Resolve instance ID from Name tag (override with INSTANCE_ID env var)
if [ -z "${INSTANCE_ID:-}" ]; then
  INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)
  if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
    echo "ERROR: Could not find running instance with Name=$INSTANCE_NAME"
    echo "Set INSTANCE_ID or INSTANCE_NAME env var."
    exit 1
  fi
fi
echo "Using instance: $INSTANCE_ID"

# Stage and tar files locally
echo "Packaging dashboard files..."
STAGING=$(mktemp -d /tmp/rk-test-stage-XXXXXX)
TARBALL="$STAGING.tar.gz"
rsync -a --exclude='deploy.sh' --exclude='deploy-test.sh' "$SCRIPT_DIR"/ "$STAGING"/
tar -czf "$TARBALL" -C "$STAGING" .
rm -rf "$STAGING"

# Upload to S3 as transfer mechanism
echo "Uploading to S3..."
S3_TMP="s3://aztec-ci-artifacts/tmp/rk-test-deploy.tar.gz"
aws s3 cp "$TARBALL" "$S3_TMP" --region "$REGION" --quiet
rm -f "$TARBALL"

# Encode the remote script as base64 to avoid all quoting issues.
# The script copies env vars from the prod container (rkapp) so the test
# instance connects to the same Redis, uses the same passwords, etc.
REMOTE_SCRIPT_B64=$(base64 << 'SCRIPT'
#!/bin/bash
set -euo pipefail

cd /home/ubuntu
mkdir -p rk-test
echo "Downloading files from S3..."
aws s3 cp s3://aztec-ci-artifacts/tmp/rk-test-deploy.tar.gz /tmp/rk-test.tar.gz --region us-east-2 --quiet
tar -xzf /tmp/rk-test.tar.gz -C rk-test
rm -f /tmp/rk-test.tar.gz

cd rk-test
echo "Building docker image..."
docker build -t rkapp-test .

echo "Stopping old container..."
docker rm -f rkapp-test 2>/dev/null || true

# Pull env vars from the production container
echo "Reading env vars from production container..."
PROD_ENV=""
for var in REDIS_HOST REDIS_PORT DASHBOARD_PASSWORD LOGS_DISK_PATH S3_LOGS_BUCKET S3_LOGS_PREFIX REPO_PATH; do
  val=$(docker exec rkapp printenv "$var" 2>/dev/null) || true
  if [ -n "$val" ]; then
    PROD_ENV="$PROD_ENV -e $var=$val"
  fi
done

echo "Starting new container..."
eval docker run -d --name rkapp-test --restart unless-stopped \
  --network host \
  -e CI_METRICS_PORT=8083 \
  $PROD_ENV \
  -v /logs-disk:/logs-disk \
  rkapp-test \
  gunicorn -w 4 -b 0.0.0.0:8082 rk:app

echo "Container started:"
docker ps --filter name=rkapp-test
SCRIPT
)

PARAMS_FILE=$(mktemp /tmp/rk-test-params-XXXXXX)
python3 -c "
import json, sys
cmd = 'echo $REMOTE_SCRIPT_B64 | base64 -d | bash'
json.dump({'commands': [cmd]}, open(sys.argv[1], 'w'))
" "$PARAMS_FILE"

# Send command and wait for result
echo "Deploying on instance..."
COMMAND_ID=$(aws ssm send-command --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --timeout-seconds 300 \
  --parameters "file://$PARAMS_FILE" \
  --output text --query 'Command.CommandId')
rm -f "$PARAMS_FILE"

echo "Command ID: $COMMAND_ID"
echo "Waiting for completion..."

# Poll until done (5s intervals, up to 5 minutes)
for i in $(seq 1 60); do
  sleep 5
  STATUS=$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text 2>/dev/null) || continue
  case "$STATUS" in
    Success)
      echo ""
      echo "Deploy succeeded!"
      aws ssm get-command-invocation --region "$REGION" \
        --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
        --query 'StandardOutputContent' --output text
      echo ""
      echo "Test dashboard: http://ci.aztec-labs.com:8082"
      exit 0
      ;;
    Failed|TimedOut|Cancelled)
      echo ""
      echo "Deploy FAILED (status: $STATUS)"
      echo "--- stdout ---"
      aws ssm get-command-invocation --region "$REGION" \
        --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
        --query 'StandardOutputContent' --output text
      echo "--- stderr ---"
      aws ssm get-command-invocation --region "$REGION" \
        --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
        --query 'StandardErrorContent' --output text
      exit 1
      ;;
    InProgress|Pending|Delayed)
      printf "."
      ;;
  esac
done

echo ""
echo "Timed out waiting for command. Check manually:"
echo "  aws ssm get-command-invocation --region $REGION --command-id $COMMAND_ID --instance-id $INSTANCE_ID"
exit 1
