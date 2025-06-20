# If running on remote, push to S3, otherwise keep local state.json as-is
if [ "$LOCAL" != "true" ]; then
  aws s3 cp ./state.json $STATE_S3_BASE_PATH/$STATE_S3_KEY
fi
