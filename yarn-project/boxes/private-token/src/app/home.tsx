import { AztecAddress } from '@aztec/aztec.js';
import { useState } from 'react';
import Banner from './components/banner.js';
import Spinner from './components/spinner.js';
import Contract from './contract.js';
import { WalletDropdown } from './wallet_dropdown.js';

export default function Home() {
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<AztecAddress | undefined>();
  const [selectWalletError, setSelectedWalletError] = useState('');

  const handleSelectWallet = (address: AztecAddress | undefined) => {
    setSelectedWallet(address);
    setIsLoadingWallet(false);
  };

  const handleSelectWalletError = (msg: string) => {
    setSelectedWalletError(msg);
    setIsLoadingWallet(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between px-16">
      <div>
        <Banner background="black" direction="forward" />
        <Banner background="purple" direction="reverse" />
      </div>

      <div className="max-w-screen flex flex-col w-full items-center py-16 font-mono text-sm">
        <div className="flex justify-between items-center w-full py-8">
          <div className="h-20">
            <img src="aztec_logo.svg" alt="Aztec" className="h-full" />
          </div>
          <div>
            <WalletDropdown
              selected={selectedWallet}
              onSelectChange={handleSelectWallet}
              onError={handleSelectWalletError}
            />
          </div>
        </div>
        <div className="py-8">
          {isLoadingWallet && (
            <div className="w-12">
              <Spinner />
            </div>
          )}
          {!isLoadingWallet && (
            <div className="py-8">
              {!!selectWalletError && `Failed to load accounts: ${selectWalletError}`}
              {!selectWalletError && <Contract />}
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full items-center flex-col"></div>
      <div>
        <Banner background="purple" direction="forward" />
        <Banner background="black" direction="reverse" />
      </div>
    </main>
  );
}
