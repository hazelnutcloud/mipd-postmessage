import type * as Mipd from "mipd";
import type { RpcRequest } from "ox/RpcRequest";
import type { RpcResponse } from "ox/RpcResponse";
import { nanoid } from "nanoid";

export type ChildMessageSchema =
  | {
    type: "eip6963:requestProvider";
  }
  | {
    type: "rpcrequest";
    providerUuid: string;
    request: RpcRequest;
  }
  | {
    type: "rpcsubscribe";
    providerUuid: string;
    event: string;
    handlerId: string;
  }
  | {
    type: "rpcunsubscribe";
    providerUuid: string;
    event: string;
    handlerId: string;
  };

export type ParentMessageSchema =
  | {
    type: "eip6963:announceProvider";
    info: Mipd.EIP6963ProviderInfo;
  }
  | {
    type: "rpcresponse";
    providerUuid: string;
    response: RpcResponse;
  }
  | {
    type: "rpcevent";
    providerUuid: string;
    handlerId: string;
    event: string;
    data: any;
  };

export function expose(parameters: {
  store: Mipd.Store;
  child: Window;
  origin: string;
}) {
  const { store, child, origin } = parameters;

  const subscribers = new Map<string, (data: any) => void>();
  const providers = new Map<string, Mipd.EIP6963ProviderDetail>();

  const setAndPostProvider = (provider: Mipd.EIP6963ProviderDetail) => {
    if (providers.values().find((p) => p.info.uuid === provider.info.uuid)) {
      // we've already posted this provider
      return;
    }

    const id = nanoid();
    providers.set(id, provider);
    child.postMessage(
      {
        type: "eip6963:announceProvider",
        info: {
          ...provider.info,
          uuid: id
        }
      } satisfies ParentMessageSchema,
      origin,
    );
  };

  window.addEventListener(
    "message",
    async (event: MessageEvent<ChildMessageSchema>) => {
      if (event.origin !== origin) {
        return;
      }

      if (event.data.type === "eip6963:requestProvider") {
        for (const provider of store.getProviders()) {
          setAndPostProvider(provider);
        }
      }

      if (event.data.type === "rpcrequest") {
        const { providerUuid, request } = event.data;
        const provider = providers.get(providerUuid);
        if (!provider) return;

        try {
          const res = await provider.provider.request({
            method: request.method as any,
            params: request.params as any,
          });
          child.postMessage(
            {
              type: "rpcresponse",
              providerUuid,
              response: {
                id: request.id,
                jsonrpc: "2.0",
                result: res,
              },
            } satisfies ParentMessageSchema,
            origin,
          );
        } catch (error: any) {
          if (typeof error === "object" && error["code"] && error["message"]) {
            child.postMessage(
              {
                type: "rpcresponse",
                providerUuid,
                response: {
                  id: request.id,
                  jsonrpc: "2.0",
                  error: {
                    code: error["code"],
                    message: error["message"],
                    data: error["data"],
                  },
                },
              } satisfies ParentMessageSchema,
              origin,
            );
          }
        }
      }

      if (event.data.type === "rpcsubscribe") {
        const { event: eventName, handlerId, providerUuid } = event.data;
        const provider = store
          .getProviders()
          .find((p) => p.info.uuid === providerUuid);
        if (!provider) return;

        const handler = (data: any) => {
          child.postMessage(
            {
              type: "rpcevent",
              event: eventName,
              data,
              handlerId,
              providerUuid,
            } satisfies ParentMessageSchema,
            origin,
          );
        };

        subscribers.set(handlerId, handler);

        provider.provider.on(eventName as any, handler);
      }

      if (event.data.type === "rpcunsubscribe") {
        const { event: eventName, handlerId, providerUuid } = event.data;
        const provider = store
          .getProviders()
          .find((p) => p.info.uuid === providerUuid);
        if (!provider) return;

        provider.provider.removeListener(
          eventName as any,
          subscribers.get(handlerId),
        );

        subscribers.delete(handlerId);
      }
    },
  );

  store.subscribe((providers) => {
    for (const provider of providers) {
      setAndPostProvider(provider);
    }
  });
}
