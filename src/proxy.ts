import * as RpcRequest from "ox/RpcRequest";
import type { ChildMessageSchema, ParentMessageSchema } from "./parent.js";
import type { EIP1193Provider } from "mipd";
import { nanoid } from "nanoid";

export class ProviderRpcError extends Error {
  code: number;
  override message: string;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.message = message;
    this.data = data;
  }
}

export function createProviderProxy(parameters: {
  parent: Window;
  uuid: string;
}): EIP1193Provider {
  const { parent, uuid } = parameters;
  const store = RpcRequest.createStore();
  const requests = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error?: any) => void }
  >();
  const listenerMap = new Map<string, Map<string, (data: any) => void>>();

  window.addEventListener(
    "message",
    (event: MessageEvent<ParentMessageSchema>) => {
      if (event.data.type === "eip6963:announceProvider") return;

      if (event.data.providerUuid !== uuid) return;

      if (event.data.type === "rpcresponse") {
        const { id, result, error } = event.data.response;
        const request = requests.get(id);
        if (!request) return;
        if (error)
          request.reject(
            new ProviderRpcError(error.code, error.message, error.data),
          );
        else request.resolve(result);
        requests.delete(id);
      }

      if (event.data.type === "rpcevent") {
        const listeners = listenerMap.get(event.data.event);
        const listener = listeners?.get(event.data.handlerId);

        if (!listener) return;

        listener(event.data.data);
      }
    },
  );

  return {
    request: (request) => {
      const payload = store.prepare(request);

      const promise = new Promise((resolve, reject) => {
        requests.set(payload.id, { resolve, reject });
      });

      parent.postMessage(
        {
          type: "rpcrequest",
          providerUuid: uuid,
          request: payload,
        } satisfies ChildMessageSchema,
        "*",
      );

      return promise as never;
    },
    on: (event, callback) => {
      if (!listenerMap.has(event)) listenerMap.set(event, new Map());
      const handlerId = nanoid();
      listenerMap.get(event)?.set(handlerId, callback);

      parent.postMessage(
        {
          type: "rpcsubscribe",
          providerUuid: uuid,
          event,
          handlerId,
        } satisfies ChildMessageSchema,
        "*",
      );
    },
    removeListener: (event, callback) => {
      const listeners = listenerMap.get(event);
      if (!listeners) return;
      const handlerId = listeners
        .entries()
        .find(([_, listener]) => listener === callback)?.[0];
      if (!handlerId) return;
      listeners.delete(handlerId);

      parent.postMessage(
        {
          type: "rpcunsubscribe",
          providerUuid: uuid,
          event,
          handlerId,
        } satisfies ChildMessageSchema,
        "*",
      );
    },
  };
}
