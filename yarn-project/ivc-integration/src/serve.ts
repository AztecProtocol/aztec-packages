import createDebug from 'debug';

import { generate3FunctionTestingIVCStack, proveAndVerifyBrowser } from './index.js';

createDebug.enable('*');
const logger = createDebug('aztec:ivc-test');

document.addEventListener('DOMContentLoaded', function () {
  const button = document.createElement('button');
  button.innerText = 'Run Test';
  button.addEventListener('click', async () => {
    logger(`generating circuit and witness...`);
    [];
    const [bytecodes, witnessStack] = await generate3FunctionTestingIVCStack();
    logger(`done. proving and verifying...`);
    const verified = await proveAndVerifyBrowser(bytecodes, witnessStack);
    logger(`verified? ${verified}`);
  });
  document.body.appendChild(button);
});
