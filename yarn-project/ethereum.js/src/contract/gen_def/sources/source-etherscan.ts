/*
  Copyright (c) 2019 xf00f

  This file is part of web3x and is released under the MIT License.
  https://opensource.org/licenses/MIT
*/

import { ContractAbiDefinition } from '../../abi/index.js';

function getHost(net: string) {
  switch (net) {
    case 'mainnet':
      return 'etherscan.io';
    case 'kovan':
      return 'kovan.etherscan.io';
    case 'ropsten':
      return 'ropsten.etherscan.io';
    default:
      throw new Error(`Unknown network ${net}`);
  }
}

function getApiHost(net: string) {
  switch (net) {
    case 'mainnet':
      return 'api.etherscan.io';
    case 'kovan':
      return 'api-kovan.etherscan.io';
    case 'ropsten':
      return 'api-ropsten.etherscan.io';
    default:
      throw new Error(`Unknown network ${net}`);
  }
}

async function getAbi(net: string, address: string): Promise<ContractAbiDefinition> {
  const host = getApiHost(net);
  const abiUrl = `http://${host}/api?module=contract&action=getabi&address=${address}&format=raw`;
  const response = await fetch(abiUrl);
  return await response.json();
}

async function getInitData(net: string, address: string) {
  const host = getHost(net);
  const response: string = await fetch(`https://${host}/address/${address}`).then(r => r.text());
  const initCodeMd = response.match(/<div id='verifiedbytecode2'>([0-9a-f]+)</);

  if (!initCodeMd) {
    return;
  }

  const initCode = '0x' + initCodeMd![1];

  const ctorParamsMd = response.match(
    /last bytes of the Contract Creation Code above.*?margin-top: 5px;'>([0-9a-f]+)</,
  );

  if (ctorParamsMd) {
    const ctorParams = ctorParamsMd![1];
    if (!initCode.endsWith(ctorParams)) {
      throw new Error('Expected ctor params to be appended to end of init code.');
    }
    return initCode.slice(0, -ctorParams.length);
  }

  return initCode;
}

export async function getFromEtherscan(net: string, address: string) {
  const abi = await getAbi(net, address);
  const initData = await getInitData(net, address);

  return { abi, initData };
}
