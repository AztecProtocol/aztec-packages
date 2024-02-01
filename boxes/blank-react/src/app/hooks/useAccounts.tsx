import { pxe } from '../../config.js';
import { CompleteAddress } from '@aztec/aztec.js';
import { useEffect, useState } from 'react';

export function useAccount() {
  const [accounts, setAccounts] = useState<CompleteAddress[] | undefined>();

  const getAccounts = async () => {
    const acc = await pxe.getPxe().getRegisteredAccounts();
    setAccounts(acc || []);
  };

  useEffect(() => {
    if (!accounts) {
      getAccounts();
    }
  }, []);

  return accounts;
}
