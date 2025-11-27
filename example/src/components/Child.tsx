import { createStore } from "mipd-postmessage/child";
import React from "react";
import * as Mipd from "mipd";

const store = createStore();

export function Child() {
  const providers = React.useSyncExternalStore(
    store.subscribe,
    store.getProviders,
  );

  const connectWallet = React.useCallback(
    async (provider: Mipd.EIP6963ProviderDetail) => {
      const accounts = await provider.provider.request({
        method: "eth_requestAccounts",
      });

      console.log("accounts", accounts);
    },
    [],
  );

  return (
    <div>
      <span>child</span>
      <ul>
        {providers.map((provider) => (
          <li key={provider.info.uuid}>
            {provider.info.name}
            <button type="button" onClick={() => connectWallet(provider)}>
              connect
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
