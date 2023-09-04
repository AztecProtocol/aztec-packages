import { AztecAddress, CompleteAddress } from '@aztec/aztec.js';
import { useEffect, useState } from 'react';

interface Props {
  selected: AztecAddress | undefined;
  onSelectChange: (value: AztecAddress) => void;
  onError: (msg: string) => void;
}

export function WalletDropdown({ selected, onSelectChange, onError }: Props) {
  const [wallets, setOptions] = useState<CompleteAddress[] | undefined>();

  useEffect(() => {
    if (wallets) {
      return;
    }
    const loadOptions = async () => {
      const fetchedOptions = [await CompleteAddress.random()];
      // TODO
      // const fetchedOptions = await rpcClient.getAccounts();
      setOptions(fetchedOptions);
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
        {!wallets && 'not hooked in yet'}
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
