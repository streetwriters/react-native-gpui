import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

const base = 'http://127.0.0.1:38530';

function request(method: string, path: string) {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${base}${path}`);
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new Error('request failed'));
    xhr.send();
  });
}

export default function XhrHeadersFixture() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const get = await request('GET', '/headers');
      const head = await request('HEAD', '/headers');
      setLines([
        `all:${JSON.stringify(get.getAllResponseHeaders())}`,
        `etag:${get.getResponseHeader('ETag')}`,
        `length:${get.getResponseHeader('content-length')}`,
        `dup:${get.getResponseHeader('x-dup')}`,
        `missing:${get.getResponseHeader('x-missing')}`,
        `head:${head.getResponseHeader('x-object-size')}`,
        'done',
      ]);
    })().catch(error => setLines([`failed:${String(error)}`]));
  }, []);
  return (
    <View>
      {lines.map(line => (
        <Text key={line} testID={`xhr-${line.split(':')[0]}`}>
          {line}
        </Text>
      ))}
    </View>
  );
}
