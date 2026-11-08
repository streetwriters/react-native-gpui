/**
 * Proxy rules and DNS-over-HTTPS settings of the HTTP client. The e2e runs a
 * proxy on port 38517 and a server on 38518 on the loopback address.
 *
 * @format
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Network } from '@react-native-gpui/core/desktop';

const PROXY = 'http://127.0.0.1:38517';

async function get(url: string) {
  try {
    const response = await fetch(url);
    return `${response.status} ${await response.text()}`;
  } catch (error) {
    return `failed ${(error as Error).message}`;
  }
}

const SCENARIOS: Record<string, () => Promise<string>> = {
  proxy: async () => {
    await Network.setProxy(PROXY);
    return get('http://proxied.invalid/hello');
  },
  bypass: async () => {
    await Network.setProxy({ rules: PROXY, bypass: '*.invalid' });
    return get('http://proxied.invalid/hello');
  },
  rules: async () => {
    await Network.setProxy(`http=127.0.0.1:38517;https=127.0.0.1:1`);
    const secure = await Network.proxyForUrl('https://secure.invalid/');
    const plain = await get('http://rules.invalid/hello');
    return `${plain} | https via ${secure}`;
  },
  direct: async () => {
    await Network.setProxy('direct');
    return get('http://127.0.0.1:38518/hello');
  },
  doh: async () => {
    const rejected = await Network.setDnsOverHttps('http://dns.invalid/q').then(
      () => 'accepted',
      (error: Error) => `rejected ${error.message}`,
    );
    await Network.setDnsOverHttps('https://dns.invalid/dns-query');
    const set = (await Network.getSettings()).dnsOverHttps;
    await Network.setDnsOverHttps(null);
    const cleared = (await Network.getSettings()).dnsOverHttps;
    return `${rejected} | ${set} | [${cleared}]`;
  },
  dohRequest: async () => {
    await Network.setProxy('direct');
    await Network.setDnsOverHttps('https://127.0.0.1:38519/dns-query');
    const result = await get('http://doh-name.invalid:38518/hello');
    await Network.setDnsOverHttps(null);
    return result;
  },
  bypassList: async () => {
    await Network.setProxy({
      rules: 'proxy.example:3128',
      bypass: '<local>, .internal.example, *.corp.test:8443; 10.0.0.0/8',
    });
    const urls = [
      'http://plain/x',
      'http://a.internal.example/x',
      'http://internal.example/x',
      'http://x.corp.test:8443/x',
      'http://x.corp.test:80/x',
      'http://10.2.3.4/x',
      'http://11.2.3.4/x',
      'http://localhost/x',
      'http://public.example/x',
    ];
    const answers = await Promise.all(
      urls.map(url => Network.proxyForUrl(url)),
    );
    return answers.map(answer => (answer === 'DIRECT' ? 'D' : 'P')).join('');
  },
  invalid: () =>
    Network.setProxy('gopher=host:1').then(
      () => 'accepted',
      (error: Error) => `rejected ${error.message}`,
    ),
};

export default function NetworkFixture() {
  const [results, setResults] = useState<Record<string, string>>({});
  return (
    <View style={{ padding: 16, gap: 8 }}>
      {Object.keys(SCENARIOS).map(name => (
        <View key={name}>
          <Text
            testID={`net-run-${name}`}
            onPress={() =>
              SCENARIOS[name]().then(result =>
                setResults(previous => ({ ...previous, [name]: result })),
              )
            }
          >
            {name}
          </Text>
          <Text testID={`net-result-${name}`}>{results[name] ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}
