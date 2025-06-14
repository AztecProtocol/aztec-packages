import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  sepolia,
} from 'wagmi/chains';

if (!process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID) {
  throw new Error('Missing NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID environment variable');
}

export const config = getDefaultConfig({
  appName: 'Alpha Testnet Sequencer Access',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID,
  chains: [
    sepolia,
  ],
  ssr: true,
});
