---
title: Troubleshooting and best practices
description: Common issues, troubleshooting steps, and security best practices for keystore configuration.
---

## Common issues

### "No validators found in keystore"

**Symptoms**: Node fails to start with no sequencer configurations loaded

**Causes**:
- Keystore file not found at specified path
- Invalid JSON syntax
- Missing required fields
- File permissions prevent reading

**Solutions**:

1. Verify keystore path:
```bash
ls -la $KEY_STORE_DIRECTORY
```

2. Validate JSON syntax:
```bash
cat keystore.json | jq .
```

3. Check required fields:
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": "REQUIRED",
      "feeRecipient": "REQUIRED"
    }
  ]
}
```

4. Fix file permissions:
```bash
chmod 600 keystore.json
chown aztec:aztec keystore.json
```

### "Failed to connect to remote signer"

**Symptoms**: Node cannot reach Web3Signer endpoint

**Causes**:
- Incorrect URL or port
- Network connectivity issues
- Certificate validation failures
- Remote signer not running

**Solutions**:

1. Test connectivity:
```bash
curl https://signer.example.com:8080/upcheck
```

2. Verify certificate:
```bash
openssl s_client -connect signer.example.com:8080 -showcerts
```

3. Check remote signer logs for authentication errors

4. For self-signed certificates, ensure proper certificate configuration in keystore

### "Insufficient funds for gas"

**Symptoms**: Transactions fail with insufficient balance errors

**Causes**:
- Publisher accounts not funded
- ETH balance depleted

**Solutions**:

1. Check publisher balances:
```bash
cast balance 0xPUBLISHER_ADDRESS --rpc-url $ETHEREUM_HOST
```

2. Fund publisher accounts with ETH

3. Set up automated balance monitoring and alerts

### "Nonce too low" or "Replacement transaction underpriced"

**Symptoms**: Transaction submission failures related to nonces

**Causes**:
- Multiple nodes using same publisher key
- Publisher key reused across keystores
- Transaction pool issues

**Solutions**:

1. **Never share publisher keys across multiple running nodes**

2. If you must use the same key, ensure only one node is active at a time

3. Clear pending transactions if safe to do so

### "Keystore file not loaded"

**Symptoms**: Only some keystores load from a directory

**Causes**:
- Invalid JSON in some files
- Incorrect file extensions
- Schema version mismatch

**Solutions**:

1. Check all files in directory:
```bash
for file in /path/to/keystores/*.json; do
  echo "Checking $file"
  jq . "$file" || echo "Invalid JSON in $file"
done
```

2. Ensure all files use `.json` extension

3. Verify `schemaVersion: 1` in all keystores

### "Cannot decrypt JSON V3 keystore"

**Symptoms**: Failed to load encrypted keystore files

**Causes**:
- Incorrect password
- Corrupted keystore file
- Unsupported encryption algorithm

**Solutions**:

1. Verify password is correct

2. Test decryption manually:
```bash
# Using ethereumjs-wallet or similar tool
```

3. Re-generate keystore if corrupted

4. Ensure keystore was generated using standard tools (geth, web3.py, ethers.js)

## Security best practices

### Key storage

**DO:**
- Use remote signers (Web3Signer) for production deployments
- Store keystores in encrypted volumes
- Use JSON V3 keystores with strong passwords
- Restrict file permissions to 600 (owner read/write only)
- Keep backups of keystores in secure, encrypted locations

**DON'T:**
- Commit keystores or private keys to version control
- Store unencrypted private keys on disk
- Share private keys between nodes
- Use the same keys across test and production environments
- Log private keys or keystore passwords

### Publisher key management

**DO:**
- Use separate publisher keys for each sequencer if possible
- Monitor publisher account balances with alerting
- Rotate publisher keys periodically
- Maintain multiple funded publishers for resilience
- Keep publisher keys separate from attester keys

**DON'T:**
- Reuse publisher keys across multiple nodes
- Run out of gas in publisher accounts
- Use sequencer attester keys as publishers if avoidable
- Share publisher keys between sequencers

### Remote signer security

**DO:**
- Use TLS/HTTPS for all remote signer connections
- Implement client certificate authentication
- Run remote signers on isolated networks
- Monitor remote signer access logs
- Use firewall rules to restrict access

**DON'T:**
- Use unencrypted HTTP connections
- Expose remote signers to the public internet
- Share remote signer endpoints between untrusted parties
- Disable certificate verification

### Operational security

**DO:**
- Implement principle of least privilege for file access
- Use hardware security modules (HSMs) for high-value sequencers
- Maintain audit logs of key access and usage
- Test keystore configurations in non-production environments first
- Document your key management procedures

**DON'T:**
- Run nodes as root user
- Store passwords in shell history or scripts
- Share attester keys between sequencers
- Neglect monitoring and alerting

## Getting help

If you encounter issues not covered here:

1. Check the [Aztec Discord](https://discord.gg/aztec) `#operator-faq` channel
2. Review node logs for specific error messages
3. Ask in Discord with:
   - Error messages (redact private keys!)
   - Keystore structure (anonymized)
   - Node version and deployment environment

## Next steps

- Return to [Advanced Configuration Patterns](./advanced_patterns.md)
- See [Key Storage Methods](./storage_methods.md) for more options
- Check [Sequencer Management](../../setup/sequencer_management) for operational guidance
