---
title: Troubleshooting and Best Practices
description: Common issues, troubleshooting steps, security best practices, and CLI reference for keystore configuration and operation on the Aztec network.
---

## Keystore Creation Issues

### Missing fee-recipient Flag

**Error message:**
```
error: required option '--fee-recipient <address>' not specified
```

**Solution:** The CLI requires the `--fee-recipient` flag. Use the zero address:

```bash
--fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000
```

### RPC Connection Issues

**Error message:**
```
Error: HTTP request failed
```

**Solutions:**
- Verify `$ETH_RPC` is set correctly: `echo $ETH_RPC`
- Test RPC connectivity by checking Etherscan can query the latest block at `https://etherscan.io/blocks`
- Try a different RPC provider if the current one is rate-limited

### Permission Denied

**Error message:**
```
Error: permission denied
```

**Solution:** Ensure you have write permissions for the target directory:

```bash
mkdir -p ~/.aztec/keystore
chmod 755 ~/.aztec/keystore
```

### Invalid Keystore JSON

**Error:** Node fails to load keystore or CLI rejects keystore file

**Solutions:**
- Validate JSON syntax: `jq . ~/.aztec/keystore/key1.json`
- Ensure all required fields are present
- Check that publisher is an array: `["0x..."]` not `"0x..."`
- Verify private keys are 64-character hex strings (with or without `0x` prefix)

### Legacy BLS Key Derivation (2.1.4 Users)

**Issue:** Need to regenerate keys that were created with CLI version 2.1.4 or earlier

Version 2.1.5 changed the BLS key derivation path, which means keys generated from the same mnemonic produce different results. This affects users who:
- Generated keys with version 2.1.4 using `--count` parameter
- Used `--account-index` explicitly in version 2.1.4
- Need to regenerate keys from mnemonic that are already registered in the GSE contract

**The derivation path change:**
- **2.1.4**: `m/12381/3600/0/0/0`, `m/12381/3600/1/0/0`, `m/12381/3600/2/0/0`
- **2.1.5+**: `m/12381/3600/0/0/0`, `m/12381/3600/0/0/1`, `m/12381/3600/0/0/2`

**Solution: Use the --legacy flag**

If you generated keys with version 2.1.4 and need to regenerate them from your mnemonic, use the `--legacy` flag:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your twelve word mnemonic phrase here" \
  --count 5 \
  --legacy
```

The `--legacy` flag uses the 2.1.4 derivation path to reproduce your original keys.

:::warning When NOT to Use --legacy
Do NOT use the `--legacy` flag if:
- You're generating keys for the first time
- You generated keys with version 2.1.5 or later
- You didn't use `--count` or `--account-index` in version 2.1.4

Using `--legacy` unnecessarily will create keys with the old derivation path that won't match your newer registrations.
:::

:::info Why This Matters
BLS keys are registered in the GSE (Governance Staking Escrow) contract and cannot be easily updated. If you regenerate keys with a different derivation path, they won't match what's registered on chain, and your sequencer won't be able to attest properly.
:::

## Runtime and Operational Issues

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
      "attester": {
        "eth": "REQUIRED - Ethereum private key",
        "bls": "REQUIRED - BLS private key"
      },
      "feeRecipient": "REQUIRED - Aztec address"
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

1. Check publisher balances on Etherscan:
   - Go to `https://etherscan.io/address/[PUBLISHER_ADDRESS]`
   - The ETH balance is displayed at the top of the page

2. Fund publisher accounts with ETH

3. Set up automated balance monitoring using Etherscan's address watch feature or API alerts

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

## Security Best Practices

### Protecting Private Keys

1. **Never commit keystores to version control**
   - Add `keystore.json` to `.gitignore`
   - Store keystores outside your project directory

2. **Backup your mnemonic securely**
   - Write it down offline
   - Store in a secure location (not on the server)
   - Consider using a hardware wallet or password manager

3. **Limit keystore access**
   ```bash
   chmod 600 ~/.aztec/keystore/key1.json
   ```

4. **Separate publisher from attester**
   - Use dedicated publisher keys
   - Keep attester keys offline when possible
   - Use remote signers for production

### Key Storage

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

### Publisher Key Management

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

### Remote Signer Security

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

### Operational Security

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

### Production Deployments

For production, consider:
- **Hardware Security Modules (HSMs)** for key storage
- **Remote signers** to keep keys off the node
- **Encrypted keystores** with password protection
- **Key management systems** (HashiCorp Vault, AWS Secrets Manager)

See [Key Storage Methods](./storage_methods.md) for advanced security patterns.

## CLI Reference

### validator-keys new

Create a new keystore with validators:

```bash
aztec validator-keys new [options]
```

**Common Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--fee-recipient <address>` | L2 fee recipient (required) | None |
| `--mnemonic <phrase>` | 12 or 24 word mnemonic | Auto-generated |
| `--count <number>` | Number of validators to create | `1` |
| `--publisher-count <number>` | Publishers per validator | `0` |
| `--staker-output` | Generate public keystore for staking | `false` |
| `--gse-address <address>` | GSE contract address (required with --staker-output) | None |
| `--l1-rpc-urls <urls>` | L1 RPC endpoints (required with --staker-output) | None |
| `--legacy` | Use 2.1.4 BLS derivation path (only for regenerating old keys) | `false` |
| `--data-dir <path>` | Output directory | `~/.aztec/keystore` |
| `--file <name>` | Keystore filename | `key1.json` |

For the complete list:

```bash
aztec validator-keys new --help
```

### validator-keys add

Add validators to an existing keystore:

```bash
aztec validator-keys add <keystore-path> [options]
```

### validator-keys staker

Generate staker output from an existing keystore:

```bash
aztec validator-keys staker \
  --from <keystore-path> \
  --gse-address <address> \
  --l1-rpc-urls <url> \
  --output <output-file>
```

## Getting Help

If you encounter issues not covered here:

- Review the [Operator FAQ](../operator_faq.md) for common questions
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Check the [CLI reference](../../reference/cli_reference.md) for all available commands
- Review node logs for specific error messages (redact private keys!)
- When asking for help, provide:
  - Error messages (with private keys redacted)
  - Keystore structure (anonymized)
  - Node version and deployment environment

## Related Documentation

- **[Creating Keystores](./creating_keystores.md)** - Main guide for generating keystores
- **[Advanced Keystore Patterns](./advanced_patterns.md)** - Multiple validators, high availability, remote signers
- **[Key Storage Methods](./storage_methods.md)** - Encrypted keystores, HSMs, key management systems
- **[Sequencer Management](../../setup/sequencer_management.md)** - Operational guidance for running sequencers
