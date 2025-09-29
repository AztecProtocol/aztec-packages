---
title: How to connect to a running sandbox
---

This guide shows you how to connect your application to a running Aztec sandbox.

## Prerequisites

- A running Aztec sandbox (see [Quickstart](../../../getting_started_on_sandbox.md)) on port 8080
- Node.js installed
- TypeScript project set up

## Connecting to the sandbox

### 1. Install the Aztec.js package

```bash
yarn add @aztec/aztec.js@2.0.2
```

### 2. Import required modules

```typescript
import { createPXEClient } from '@aztec/aztec.js';
```

### 3. Create a PXE client connection

```typescript
const pxe = await createPXEClient("http://localhost:8080");
```

:::note

If your sandbox is running on a different URL or port, you may want to pass it as an environment variable, for example:

```typescript
// Set via environment variable
const PXE_URL = process.env.PXE_URL || 'http://your-sandbox-url:port';
```

:::

### 4. Verify the connection

```typescript
const nodeInfo = await pxe.getNodeInfo();
console.log('Connected to sandbox version:', nodeInfo.nodeVersion);
```

## Loading existing accounts

After connecting, you can load pre-deployed accounts:

```typescript
const accounts = await pxe.getRegisteredAccounts();
console.log(`Found ${accounts.length} accounts in the sandbox`);
```
