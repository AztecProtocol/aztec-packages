---
title: e2e tests (TypeScript)
sidebar_position: 3
---

## Private flow test

```typescript title="uniswap_private" showLineNumbers 
it('should uniswap trade on L1 from L2 funds privately (swaps WETH -> DAI)', async () => {
  const wethL1BeforeBalance = await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress);

  // 1. Approve and deposit weth to the portal and move to L2
  const wethDepositClaim = await wethCrossChainHarness.sendTokensToPortalPrivate(wethAmountToBridge);

  // funds transferred from owner to token portal
  expect(await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress)).toEqual(
    wethL1BeforeBalance - wethAmountToBridge,
  );
  expect(await wethCrossChainHarness.getL1BalanceOf(wethCrossChainHarness.tokenPortalAddress)).toEqual(
    wethAmountToBridge,
  );

  await wethCrossChainHarness.makeMessageConsumable(Fr.fromHexString(wethDepositClaim.messageHash));

  // 2. Claim WETH on L2
  logger.info('Minting weth on L2');
  await wethCrossChainHarness.consumeMessageOnAztecAndMintPrivately(wethDepositClaim);
  await wethCrossChainHarness.expectPrivateBalanceOnL2(ownerAddress, wethAmountToBridge);

  // Store balances
  const wethL2BalanceBeforeSwap = await wethCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);
  const daiL2BalanceBeforeSwap = await daiCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);

  // 3. Owner gives uniswap approval to transfer the funds to public to self on its behalf
  logger.info('Approving uniswap to transfer funds to public to self on my behalf');
  const nonceForWETHTransferToPublicApproval = new Fr(1n);
  const transferToPublicAuhtwit = await ownerWallet.createAuthWit({
    caller: uniswapL2Contract.address,
    action: wethCrossChainHarness.l2Token.methods.transfer_to_public(
      ownerAddress,
      uniswapL2Contract.address,
      wethAmountToBridge,
      nonceForWETHTransferToPublicApproval,
    ),
  });

  // 4. Swap on L1 - sends L2 to L1 message to withdraw WETH to L1 and another message to swap assets.
  logger.info('Withdrawing weth to L1 and sending message to swap to dai');
  const [secretForDepositingSwappedDai, secretHashForDepositingSwappedDai] = await generateClaimSecret();

  const l2UniswapInteractionReceipt = await uniswapL2Contract.methods
    .swap_private(
      wethCrossChainHarness.l2Token.address,
      wethCrossChainHarness.l2Bridge.address,
      wethAmountToBridge,
      daiCrossChainHarness.l2Bridge.address,
      nonceForWETHTransferToPublicApproval,
      uniswapFeeTier,
      minimumOutputAmount,
      secretHashForDepositingSwappedDai,
      ownerEthAddress,
    )
    .send({ authWitnesses: [transferToPublicAuhtwit] })
    .wait();

  const swapPrivateFunction = 'swap_private(address,uint256,uint24,address,uint256,bytes32,address)';
  const swapPrivateContent = sha256ToField([
    Buffer.from(toFunctionSelector(swapPrivateFunction).substring(2), 'hex'),
    wethCrossChainHarness.tokenPortalAddress.toBuffer32(),
    new Fr(wethAmountToBridge),
    new Fr(uniswapFeeTier),
    daiCrossChainHarness.tokenPortalAddress.toBuffer32(),
    new Fr(minimumOutputAmount),
    secretHashForDepositingSwappedDai,
    ownerEthAddress.toBuffer32(),
  ]);

  const swapPrivateLeaf = computeL2ToL1MessageHash({
    l2Sender: uniswapL2Contract.address,
    l1Recipient: EthAddress.fromString(uniswapPortal.address),
    content: swapPrivateContent,
    rollupVersion: new Fr(version),
    chainId: new Fr(l1Client.chain.id),
  });

  const withdrawContent = sha256ToField([
    Buffer.from(toFunctionSelector('withdraw(address,uint256,address)').substring(2), 'hex'),
    uniswapPortalAddress.toBuffer32(),
    new Fr(wethAmountToBridge),
    uniswapPortalAddress.toBuffer32(),
  ]);

  const withdrawLeaf = computeL2ToL1MessageHash({
    l2Sender: wethCrossChainHarness.l2Bridge.address,
    l1Recipient: wethCrossChainHarness.tokenPortalAddress,
    content: withdrawContent,
    rollupVersion: new Fr(version),
    chainId: new Fr(l1Client.chain.id),
  });

  // ensure that user's funds were burnt
  await wethCrossChainHarness.expectPrivateBalanceOnL2(ownerAddress, wethL2BalanceBeforeSwap - wethAmountToBridge);
  // ensure that uniswap contract didn't eat the funds.
  await wethCrossChainHarness.expectPublicBalanceOnL2(uniswapL2Contract.address, 0n);

  // Since the outbox is only consumable when the block is proven, we need to set the block to be proven
  await cheatCodes.rollup.markAsProven(await rollup.getBlockNumber());

  // 5. Consume L2 to L1 message by calling uniswapPortal.swap_private()
  logger.info('Execute withdraw and swap on the uniswapPortal!');
  const daiL1BalanceOfPortalBeforeSwap = await daiCrossChainHarness.getL1BalanceOf(
    daiCrossChainHarness.tokenPortalAddress,
  );
  const swapResult = await computeL2ToL1MembershipWitness(
    aztecNode,
    l2UniswapInteractionReceipt.blockNumber!,
    swapPrivateLeaf,
  );
  const withdrawResult = await computeL2ToL1MembershipWitness(
    aztecNode,
    l2UniswapInteractionReceipt.blockNumber!,
    withdrawLeaf,
  );

  const swapPrivateL2MessageIndex = swapResult!.l2MessageIndex;
  const swapPrivateSiblingPath = swapResult!.siblingPath;

  const withdrawL2MessageIndex = withdrawResult!.l2MessageIndex;
  const withdrawSiblingPath = withdrawResult!.siblingPath;

  const withdrawMessageMetadata = {
    _l2BlockNumber: BigInt(l2UniswapInteractionReceipt.blockNumber!),
    _leafIndex: BigInt(withdrawL2MessageIndex),
    _path: withdrawSiblingPath
      .toBufferArray()
      .map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
  };

  const swapPrivateMessageMetadata = {
    _l2BlockNumber: BigInt(l2UniswapInteractionReceipt.blockNumber!),
    _leafIndex: BigInt(swapPrivateL2MessageIndex),
    _path: swapPrivateSiblingPath
      .toBufferArray()
      .map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
  };

  const swapArgs = [
    wethCrossChainHarness.tokenPortalAddress.toString(),
    wethAmountToBridge,
    Number(uniswapFeeTier),
    daiCrossChainHarness.tokenPortalAddress.toString(),
    minimumOutputAmount,
    secretHashForDepositingSwappedDai.toString(),
    true,
    [withdrawMessageMetadata, swapPrivateMessageMetadata],
  ] as const;

  // this should also insert a message into the inbox.
  const txReceipt = await daiCrossChainHarness.l1Client.waitForTransactionReceipt({
    hash: await uniswapPortal.write.swapPrivate(swapArgs),
  });

  // We get the msg leaf from event so that we can later wait for it to be available for consumption
  const inboxAddress = daiCrossChainHarness.l1ContractAddresses.inboxAddress.toString();
  const txLog = extractEvent(txReceipt.logs, inboxAddress, InboxAbi, 'MessageSent');
  const tokenOutMsgHash = Fr.fromHexString(txLog.args.hash);
  const tokenOutMsgIndex = txLog.args.index;

  // weth was swapped to dai and send to portal
  const daiL1BalanceOfPortalAfter = await daiCrossChainHarness.getL1BalanceOf(
    daiCrossChainHarness.tokenPortalAddress,
  );
  expect(daiL1BalanceOfPortalAfter).toBeGreaterThan(daiL1BalanceOfPortalBeforeSwap);
  const daiAmountToBridge = BigInt(daiL1BalanceOfPortalAfter - daiL1BalanceOfPortalBeforeSwap);

  // Wait for the message to be available for consumption
  await daiCrossChainHarness.makeMessageConsumable(tokenOutMsgHash);

  // 6. claim dai on L2
  logger.info('Consuming messages to mint dai on L2');
  await daiCrossChainHarness.consumeMessageOnAztecAndMintPrivately({
    claimAmount: daiAmountToBridge,
    claimSecret: secretForDepositingSwappedDai,
    messageLeafIndex: tokenOutMsgIndex,
    recipient: ownerAddress,
  });
  await daiCrossChainHarness.expectPrivateBalanceOnL2(ownerAddress, daiL2BalanceBeforeSwap + daiAmountToBridge);

  const wethL2BalanceAfterSwap = await wethCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);
  const daiL2BalanceAfterSwap = await daiCrossChainHarness.getL2PrivateBalanceOf(ownerAddress);

  logger.info('WETH balance before swap: ' + wethL2BalanceBeforeSwap.toString());
  logger.info('DAI balance before swap  : ' + daiL2BalanceBeforeSwap.toString());
  logger.info('***** 🧚‍♀️ SWAP L2 assets on L1 Uniswap 🧚‍♀️ *****');
  logger.info('WETH balance after swap : ', wethL2BalanceAfterSwap.toString());
  logger.info('DAI balance after swap  : ', daiL2BalanceAfterSwap.toString());
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/shared/uniswap_l1_l2.ts#L176-L366" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/shared/uniswap_l1_l2.ts#L176-L366</a></sub></sup>


## Public flow test

```typescript title="uniswap_public" showLineNumbers 
// it('should uniswap trade on L1 from L2 funds publicly (swaps WETH -> DAI)', async () => {
//   const wethL1BeforeBalance = await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress);

//   // 1. Approve and deposit weth to the portal and move to L2
//   const [secretForMintingWeth, secretHashForMintingWeth] = wethCrossChainHarness.generateClaimSecret();

//   const wethDepositMsgHash = await wethCrossChainHarness.sendTokensToPortalPublic(
//     wethAmountToBridge,
//     secretHashForMintingWeth,
//   );
//   // funds transferred from owner to token portal
//   expect(await wethCrossChainHarness.getL1BalanceOf(ownerEthAddress)).toBe(
//     wethL1BeforeBalance - wethAmountToBridge,
//   );
//   expect(await wethCrossChainHarness.getL1BalanceOf(wethCrossChainHarness.tokenPortalAddress)).toBe(
//     wethAmountToBridge,
//   );

//   // Wait for the message to be available for consumption
//   await wethCrossChainHarness.makeMessageConsumable(wethDepositMsgHash);

//   // Get message leaf index, needed for claiming in public
//   const wethDepositMaybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness(
//     'latest',
//     wethDepositMsgHash,
//     0n,
//   );
//   assert(wethDepositMaybeIndexAndPath !== undefined, 'Message not found in tree');
//   const wethDepositMessageLeafIndex = wethDepositMaybeIndexAndPath[0];

//   // 2. Claim WETH on L2
//   logger.info('Minting weth on L2');
//   await wethCrossChainHarness.consumeMessageOnAztecAndMintPublicly(
//     wethAmountToBridge,
//     secretForMintingWeth,
//     wethDepositMessageLeafIndex,
//   );
//   await wethCrossChainHarness.expectPublicBalanceOnL2(ownerAddress, wethAmountToBridge);

//   // Store balances
//   const wethL2BalanceBeforeSwap = await wethCrossChainHarness.getL2PublicBalanceOf(ownerAddress);
//   const daiL2BalanceBeforeSwap = await daiCrossChainHarness.getL2PublicBalanceOf(ownerAddress);

//   // 3. Owner gives uniswap approval to transfer funds on its behalf
//   const nonceForWETHTransferApproval = new Fr(1n);

//   await ownerWallet
//     .setPublicAuthWit(
//       {
//         caller: uniswapL2Contract.address,
//         action: wethCrossChainHarness.l2Token.methods
//           .transfer_in_public(
//             ownerAddress,
//             uniswapL2Contract.address,
//             wethAmountToBridge,
//             nonceForWETHTransferApproval,
//           )
//           .request(),
//       },
//       true,
//     )
//     .send()
//     .wait();

//   // 4. Swap on L1 - sends L2 to L1 message to withdraw WETH to L1 and another message to swap assets.
//   const [secretForDepositingSwappedDai, secretHashForDepositingSwappedDai] =
//     daiCrossChainHarness.generateClaimSecret();

//   // 4.1 Owner approves user to swap on their behalf:
//   const nonceForSwap = new Fr(3n);
//   const action = uniswapL2Contract
//     .withWallet(sponsorWallet)
//     .methods.swap_public(
//       ownerAddress,
//       wethCrossChainHarness.l2Bridge.address,
//       wethAmountToBridge,
//       daiCrossChainHarness.l2Bridge.address,
//       nonceForWETHTransferApproval,
//       uniswapFeeTier,
//       minimumOutputAmount,
//       ownerAddress,
//       secretHashForDepositingSwappedDai,
//       ownerEthAddress,
//       nonceForSwap,
//     );
//   await ownerWallet.setPublicAuthWit({ caller: sponsorAddress, action }, true).send().wait();

//   // 4.2 Call swap_public from user2 on behalf of owner
//   const uniswapL2Interaction = await action.send().wait();

//   const swapPublicContent = sha256ToField([
//     Buffer.from(
//       toFunctionSelector('swap_public(address,uint256,uint24,address,uint256,bytes32,bytes32,address)').substring(
//         2,
//       ),
//       'hex',
//     ),
//     wethCrossChainHarness.tokenPortalAddress.toBuffer32(),
//     new Fr(wethAmountToBridge),
//     new Fr(uniswapFeeTier),
//     daiCrossChainHarness.tokenPortalAddress.toBuffer32(),
//     new Fr(minimumOutputAmount),
//     ownerAddress,
//     secretHashForDepositingSwappedDai,
//     ownerEthAddress.toBuffer32(),
//   ]);

//   const swapPublicLeaf = sha256ToField([
//     uniswapL2Contract.address,
//     new Fr(1), // aztec version
//     EthAddress.fromString(uniswapPortal.address).toBuffer32(),
//     new Fr(publicClient.chain.id), // chain id
//     swapPublicContent,
//   ]);

//   const withdrawContent = sha256ToField([
//     Buffer.from(toFunctionSelector('withdraw(address,uint256,address)').substring(2), 'hex'),
//     uniswapPortalAddress.toBuffer32(),
//     new Fr(wethAmountToBridge),
//     uniswapPortalAddress.toBuffer32(),
//   ]);

//   const withdrawLeaf = sha256ToField([
//     wethCrossChainHarness.l2Bridge.address,
//     new Fr(1), // aztec version
//     wethCrossChainHarness.tokenPortalAddress.toBuffer32(),
//     new Fr(publicClient.chain.id), // chain id
//     withdrawContent,
//   ]);

//   // check weth balance of owner on L2 (we first bridged `wethAmountToBridge` into L2 and now withdrew it!)
//   await wethCrossChainHarness.expectPublicBalanceOnL2(ownerAddress, wethL2BalanceBeforeSwap - wethAmountToBridge);

//   // 5. Perform the swap on L1 with the `uniswapPortal.swap_private()` (consuming L2 to L1 messages)
//   logger.info('Execute withdraw and swap on the uniswapPortal!');
//   const daiL1BalanceOfPortalBeforeSwap = await daiCrossChainHarness.getL1BalanceOf(
//     daiCrossChainHarness.tokenPortalAddress,
//   );

//   const [swapPrivateL2MessageIndex, swapPrivateSiblingPath] = await aztecNode.getL2ToL1MessageMembershipWitness(
//     uniswapL2Interaction.blockNumber!,
//     swapPublicLeaf,
//   );
//   const [withdrawL2MessageIndex, withdrawSiblingPath] = await aztecNode.getL2ToL1MessageMembershipWitness(
//     uniswapL2Interaction.blockNumber!,
//     withdrawLeaf,
//   );

//   const withdrawMessageMetadata = {
//     _l2BlockNumber: BigInt(uniswapL2Interaction.blockNumber!),
//     _leafIndex: BigInt(withdrawL2MessageIndex),
//     _path: withdrawSiblingPath
//       .toBufferArray()
//       .map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
//   };

//   const swapPrivateMessageMetadata = {
//     _l2BlockNumber: BigInt(uniswapL2Interaction.blockNumber!),
//     _leafIndex: BigInt(swapPrivateL2MessageIndex),
//     _path: swapPrivateSiblingPath
//       .toBufferArray()
//       .map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
//   };

//   const swapArgs = [
//     wethCrossChainHarness.tokenPortalAddress.toString(),
//     wethAmountToBridge,
//     Number(uniswapFeeTier),
//     daiCrossChainHarness.tokenPortalAddress.toString(),
//     minimumOutputAmount,
//     ownerAddress.toString(),
//     secretHashForDepositingSwappedDai.toString(),
//     true,
//     [withdrawMessageMetadata, swapPrivateMessageMetadata],
//   ] as const;

//   // this should also insert a message into the inbox.
//   const txHash = await uniswapPortal.write.swapPublic(swapArgs, {} as any);

//   // We get the msg leaf from event so that we can later wait for it to be available for consumption
//   let outTokenDepositMsgHash: Fr;
//   {
//     const txReceipt = await daiCrossChainHarness.publicClient.waitForTransactionReceipt({
//       hash: txHash,
//     });

//     const txLog = txReceipt.logs[9];
//     const topics = decodeEventLog({
//       abi: InboxAbi,
//       data: txLog.data,
//       topics: txLog.topics,
//     });
//     outTokenDepositMsgHash = Fr.fromHexString(topics.args.hash);
//   }

//   // weth was swapped to dai and send to portal
//   const daiL1BalanceOfPortalAfter = await daiCrossChainHarness.getL1BalanceOf(
//     daiCrossChainHarness.tokenPortalAddress,
//   );
//   expect(daiL1BalanceOfPortalAfter).toBeGreaterThan(daiL1BalanceOfPortalBeforeSwap);
//   const daiAmountToBridge = BigInt(daiL1BalanceOfPortalAfter - daiL1BalanceOfPortalBeforeSwap);

//   // Wait for the message to be available for consumption
//   await daiCrossChainHarness.makeMessageConsumable(outTokenDepositMsgHash);

//   // Get message leaf index, needed for claiming in public
//   const outTokenDepositMaybeIndexAndPath = await aztecNode.getL1ToL2MessageMembershipWitness(
//     'latest',
//     outTokenDepositMsgHash,
//     0n,
//   );
//   assert(outTokenDepositMaybeIndexAndPath !== undefined, 'Message not found in tree');
//   const outTokenDepositMessageLeafIndex = outTokenDepositMaybeIndexAndPath[0];

//   // 6. claim dai on L2
//   logger.info('Consuming messages to mint dai on L2');
//   await daiCrossChainHarness.consumeMessageOnAztecAndMintPublicly(
//     daiAmountToBridge,
//     secretForDepositingSwappedDai,
//     outTokenDepositMessageLeafIndex,
//   );
//   await daiCrossChainHarness.expectPublicBalanceOnL2(ownerAddress, daiL2BalanceBeforeSwap + daiAmountToBridge);

//   const wethL2BalanceAfterSwap = await wethCrossChainHarness.getL2PublicBalanceOf(ownerAddress);
//   const daiL2BalanceAfterSwap = await daiCrossChainHarness.getL2PublicBalanceOf(ownerAddress);

//   logger.info('WETH balance before swap: ', wethL2BalanceBeforeSwap.toString());
//   logger.info('DAI balance before swap  : ', daiL2BalanceBeforeSwap.toString());
//   logger.info('***** 🧚‍♀️ SWAP L2 assets on L1 Uniswap 🧚‍♀️ *****');
//   logger.info('WETH balance after swap : ', wethL2BalanceAfterSwap.toString());
//   logger.info('DAI balance after swap  : ', daiL2BalanceAfterSwap.toString());
// });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/shared/uniswap_l1_l2.ts#L369-L602" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/shared/uniswap_l1_l2.ts#L369-L602</a></sub></sup>


