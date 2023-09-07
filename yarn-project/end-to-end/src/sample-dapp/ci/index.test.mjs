import { deploy } from '../deploy.mjs';
import { main } from '../index.mjs';

describe('sample-dapp', () => {
  it('deploys and runs without errors', async () => {
    await deploy();
    await main();
  }, 60_000);
});
