---
title: Deploy a contract with a Portal
---

- Deploy to L1 using Viem, Foundry or your preferred tool;
- Deploy to L2 passing in the address of the L1 portal as its portal contract;
  ```typescript
  const deploymentTx = Contract.deploy(wallet).send({
    portalContract: tokenPortalAddress,
  });
  ```
- Initialize l1 with l2 address for access control.