import * as Mipd from "mipd";
import type { ChildMessageSchema, ParentMessageSchema } from "./parent.js";
import { createProviderProxy } from "./proxy.js";

export type RequestProvidersParameters = (
  providerDetail: Mipd.EIP6963ProviderDetail,
) => void;
export type RequestProvidersReturnType = (() => void) | undefined;

/**
 * Watches for EIP-1193 Providers to be announced.
 */
export function requestProviders(
  listener: RequestProvidersParameters,
): RequestProvidersReturnType {
  if (typeof window === undefined) return;

  const handler = (event: MessageEvent<ParentMessageSchema>) => {
    if (event.data.type !== "eip6963:announceProvider") return;
    const providerProxy = createProviderProxy({
      parent: window.parent,
      uuid: event.data.info.uuid,
    });
    listener({
      info: event.data.info,
      provider: providerProxy,
    });
  };

  window.addEventListener("message", handler);

  window.parent.postMessage(
    {
      type: "eip6963:requestProvider",
    } satisfies ChildMessageSchema,
    "*",
  );

  return () => {
    window.removeEventListener("message", handler);
  };
}

export function createStore(): Mipd.Store {
  const listeners: Set<Mipd.Listener> = new Set();
  let providerDetails: readonly Mipd.EIP6963ProviderDetail[] = [];

  const request = () =>
    requestProviders((providerDetail) => {
      if (
        providerDetails.some(
          ({ info }) => info.uuid === providerDetail.info.uuid,
        )
      )
        return;

      providerDetails = [...providerDetails, providerDetail];
      listeners.forEach((listener) =>
        listener(providerDetails, { added: [providerDetail] }),
      );
    });
  let unwatch = request();

  return {
    _listeners() {
      return listeners;
    },
    clear() {
      listeners.forEach((listener) =>
        listener([], { removed: [...providerDetails] }),
      );
      providerDetails = [];
    },
    destroy() {
      this.clear();
      listeners.clear();
      unwatch?.();
    },
    findProvider({ rdns }) {
      return providerDetails.find(
        (providerDetail) => providerDetail.info.rdns === rdns,
      );
    },
    getProviders() {
      return providerDetails;
    },
    reset() {
      this.clear();
      unwatch?.();
      unwatch = request();
    },
    subscribe(listener, { emitImmediately } = {}) {
      listeners.add(listener);
      if (emitImmediately)
        listener(providerDetails, { added: providerDetails });
      return () => listeners.delete(listener);
    },
  };
}
