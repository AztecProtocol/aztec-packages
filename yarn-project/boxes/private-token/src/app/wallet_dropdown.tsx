import { AztecAddress, CompleteAddress } from '@aztec/aztec.js';
import { AztecRPC } from '@aztec/types';
import { useEffect, useState } from 'react';

interface Props {
  selected: AztecAddress | undefined;
  rpcClient: AztecRPC;
  onSelectChange: (value: AztecAddress) => void;
  onError: (msg: string) => void;
}

export function WalletDropdown({ selected, rpcClient, onSelectChange, onError }: Props) {
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
      onSelectChange(fetchedOptions[0]?.address);
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
          onChange={e => onSelectChange(AztecAddress.fromString(e.target.value))}
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
