---
id: network
title: Network
---

The proxy and DNS settings of the HTTP client that `fetch`, `XMLHttpRequest` and the loading of remote images and fonts share. A change applies to requests that start after it.

## Example

```tsx
import { Network } from '@react-native-gpui/core/desktop';

await Network.setProxy('http=proxy.example:8080;https=proxy.example:8443');
await Network.setProxy({
  rules: 'http://proxy.example:8080',
  bypass: '<local>, *.corp.example, 10.0.0.0/8',
});
await Network.setProxy('direct');
await Network.setProxy('system');

await Network.setDnsOverHttps('https://cloudflare-dns.com/dns-query');
await Network.setDnsOverHttps([
  'https://mozilla.cloudflare-dns.com/dns-query',
  'https://dns.quad9.net/dns-query',
]);
await Network.setDnsOverHttps(null);
```

An app that offers proxy rules and a secure DNS switch in its settings maps them directly: a rules string (`''` for none) is `Network.setProxy(rules || 'direct')`, and the switch is `Network.setDnsOverHttps(on ? [first, second] : null)`.

WebSocket connections do not use these settings yet.

---

# Reference

## Methods

### `setProxy()`

```tsx
Network.setProxy(config: 'system' | 'direct' | string | { rules: string; bypass?: string }): Promise<void>;
```

Sets where new requests go. It rejects when the rules cannot be read.

- `'system'` is the default. On macOS it follows the system's proxy settings (HTTP, HTTPS and SOCKS, and their exceptions), read again every few seconds. On Windows and Linux it follows the `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` environment variables.
- `'direct'`, `''` and `'direct://'` send requests straight to their servers, whatever the system or the environment says.
- A string, or the `rules` of an object, is a proxy URL (`http://host:8080`, `https://host`, `socks5://host:1080`, a bare `host:port` for HTTP) or Chromium proxy rules: `[scheme=]proxy[;[scheme=]proxy]`, where `scheme` is `http`, `https`, `ftp` or `socks`, and a proxy is `[http://|https://|socks4://|socks5://|direct://]host[:port]`. A rule without a scheme applies to every scheme. When a rule lists several proxies separated by commas, the first is used. SOCKS proxies resolve host names themselves.
- `bypass` lists hosts that skip the proxy, separated by commas or semicolons: a host pattern with `*` (`*.example.com`), `.example.com` for its subdomains, `host:port`, `scheme://host`, an IPv4 network `10.0.0.0/8`, or `<local>` for names without a dot. Loopback addresses (`localhost`, `127.0.0.0/8`, `::1`) never use the proxy.

---

### `setDnsOverHttps()`

```tsx
Network.setDnsOverHttps(urls: string | string[] | null): Promise<void>;
```

Resolves the host names of new requests through DNS-over-HTTPS servers, such as `https://cloudflare-dns.com/dns-query`, in place of the system resolver. `null` goes back to the system resolver. Every URL must be `https`.

With several servers they are tried in order: a request whose host name a server could not resolve asks the next one, and after the last it asks the system resolver, as Chromium's automatic secure DNS mode does. So a server that is down does not take the app offline. The retry happens only before anything of the response has arrived. The servers' own names are looked up by the system, so give their addresses when that must not leak. A request through an HTTP proxy is resolved by the proxy for the host it names, so this affects it only for the proxy's own name.

---

### `getSettings()`

```tsx
Network.getSettings(): Promise<{ mode: 'system' | 'direct' | 'fixed'; rules: string; bypass: string; dnsOverHttps: string; dnsOverHttpsServers: string[] }>;
```

The settings now in effect. `dnsOverHttps` is the first DNS server, and `dnsOverHttpsServers` lists them all. The app remembers them across launches by calling `setProxy` and `setDnsOverHttps` at startup.

---

### `proxyForUrl()`

```tsx
Network.proxyForUrl(url: string): Promise<string>;
```

The proxy a request to `url` goes through: `'DIRECT'` or the proxy's URL. Useful to check rules and bypass lists.
