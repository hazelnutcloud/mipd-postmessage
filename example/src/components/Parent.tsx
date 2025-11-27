import { createStore } from "mipd";
import { expose } from "mipd-postmessage/parent";
import React from "react";

const store = createStore();
const child = new URL("http://localhost:5174?mode=child");

export function Parent() {
  const providers = React.useSyncExternalStore(
    store.subscribe,
    store.getProviders,
  );
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;

    expose({
      child: iframeRef.current.contentWindow,
      store,
      origin: child.origin,
    });
  }, [iframeRef]);

  return (
    <div>
      <span>parent</span>
      <ul>
        {providers.map((provider) => (
          <li key={provider.info.uuid}>{provider.info.name}</li>
        ))}
      </ul>
      <iframe src={child.href} ref={iframeRef}></iframe>
    </div>
  );
}
