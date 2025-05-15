# We retrieve state, and set it to empty if undefined.
if [ "$LOCAL" != "true" ]; then
  aws s3 cp $STATE_S3_BASE_PATH/$STATE_S3_KEY ./state.json || echo '{"accounts": [], "contracts": []}'> state.json
else
  [ -f ./state.json ] || echo '{"accounts": [], "contracts": []}' > state.json
fi
