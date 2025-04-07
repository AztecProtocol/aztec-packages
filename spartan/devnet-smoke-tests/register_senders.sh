# Register senders for each account
jq -c '.accounts[]' state.json | while read -r account; do
  current_user_address=$(echo $account | jq -r '.address')

  other_accounts=$(jq -c --arg curr "$current_user_address" '.accounts[] | select(.address != $curr)' state.json)
  echo "$other_accounts" | while read -r other_account; do
    other_address=$(echo "$other_account" | jq -r '.address')

    aztec-wallet \
      register-sender "$other_address" \
      -f "$current_user_address"
  done
done
