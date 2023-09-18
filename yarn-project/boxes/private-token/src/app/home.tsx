import { Loader } from '@aztec/aztec-ui';
import { CompleteAddress } from '@aztec/aztec.js';
import { useState } from 'react';
import { SANDBOX_URL } from '../config.js';
import { WalletDropdown } from './components/wallet_dropdown.js';
import { Contract } from './contract.js';
import styles from './home.module.scss';

export function Home() {
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<CompleteAddress>();
  const [selectWalletError, setSelectedWalletError] = useState('');

  const handleSelectWallet = (address: CompleteAddress | undefined) => {
    setSelectedWallet(address);
    setIsLoadingWallet(false);
  };

  const handleSelectWalletError = (msg: string) => {
    setSelectedWalletError(msg);
    setIsLoadingWallet(false);
  };

  return (
    <main className={styles.main}>
      <img src="aztec_logo.svg" alt="Aztec" className={styles.logo} />
      <>
        {isLoadingWallet && <Loader />}
        {!isLoadingWallet && (
          <>
            {!!selectWalletError && (
              <>
                {`Failed to load accounts. Error: ${selectWalletError}`}
                <br />
                {`Make sure the Aztec Sandbox is running at: ${SANDBOX_URL}`}
              </>
            )}
            {!selectWalletError && !selectedWallet && `No accounts.`}
            {!selectWalletError && !!selectedWallet && <Contract wallet={selectedWallet} />}
          </>
        )}
        <WalletDropdown
          selected={selectedWallet}
          onSelectChange={handleSelectWallet}
          onError={handleSelectWalletError}
        />
      </>
    </main>
  );
}
