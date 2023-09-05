import { CompleteAddress } from '@aztec/aztec.js';
import { useEffect, useState } from 'react';
import { rpcClient } from '../config.js';

interface Props {
  selected: CompleteAddress | undefined;
  onSelectChange: (value: CompleteAddress) => void;
  onError: (msg: string) => void;
}

export function WalletDropdown({ selected, onSelectChange, onError }: Props) {
  const [wallets, setOptions] = useState<CompleteAddress[] | undefined>();

  useEffect(() => {
    // console.log('wallets', wallets);
    if (wallets) {
      return;
    }
    const loadOptions = async () => {
      const fetchedOptions = await rpcClient.getAccounts();
      setOptions(fetchedOptions);
      // console.log('fetchedOptions', fetchedOptions.map(x => (x.toString(), x.partialAddress)));
      onSelectChange(fetchedOptions[0]);
    };
    loadOptions().catch(e => {
      setOptions([]);
      onError(e.message);
    });
  });

  return (
    <div className="flex items-center">
      <div className="p-2">
        {'Wallet: '}
        {!wallets && 'not hooked in yet dan'}
      </div>
      {!!wallets && (
        <select
          className="min-w-64 border rounded px-3 py-2"
          onChange={e => {
                const selectedWallet = wallets.find(wallet => wallet.address.toString() === e.target.value);
            onSelectChange(selectedWallet!);
          }}
          value={selected?.toString()}
        >
          {wallets.map(({ address }: CompleteAddress) => {
            return (
              <option key={address.toShortString()} value={address.toString()}>
                {address.toShortString()}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
