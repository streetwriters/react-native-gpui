import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  View,
} from 'react-native';
const httpBase = 'http://127.0.0.1:43181';
const secureWebSocketUrl = 'wss://localhost:43182';
function NetworkingFixture() {
  const [results, setResults] = useState<string[]>([
    'Running networking checks…',
  ]);
  useEffect(() => {
    let active = true;
    const lines: string[] = [];
    const report = (name: string, ok: boolean, detail = '') => {
      const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
      lines.push(line);
      console.log(`[networking-probe] ${line}`);
      if (active) setResults([...lines]);
    };
    const checkHttp = async () => {
      try {
        const textResponse = await fetch(`${httpBase}/text`);
        report('fetch text', (await textResponse.text()) === 'network-text-ok');
        const jsonResponse = await fetch(`${httpBase}/json`);
        const json = (await jsonResponse.json()) as {
          ok: boolean;
        };
        report('fetch JSON', json.ok);
        const redirected = await fetch(`${httpBase}/redirect`);
        report(
          'redirect following',
          redirected.status === 200 &&
            redirected.url.endsWith('/text') &&
            (await redirected.text()) === 'network-text-ok',
        );
        const status = await fetch(`${httpBase}/status`);
        report(
          'non-2xx response body',
          status.status === 418 &&
            (await status.text()) === 'status-body-readable',
        );
        const networking = TurboModuleRegistry.getEnforcing('Networking') as {
          clearCookies(callback: (cleared: boolean) => void): void;
        };
        const form = new FormData();
        form.append('message', 'hello-from-form-data');
        // The fixture server owns the file it validates against, and Windows
        // has no `/tmp`, so it is asked for the URI instead of hard-coding one.
        const uploadFileUri = await (
          await fetch(`${httpBase}/upload-path`)
        ).text();
        form.append('attachment', {
          uri: uploadFileUri.trim(),
          name: 'fixture.txt',
          type: 'text/plain',
        });
        const upload = await fetch(`${httpBase}/upload`, {
          method: 'POST',
          body: form,
        });
        const uploadResult = await upload.text();
        report(
          'FormData upload',
          uploadResult === 'multipart-ok',
          uploadResult,
        );
        await fetch(`${httpBase}/cookie/set`, {
          credentials: 'include',
        });
        const cookie = await fetch(`${httpBase}/cookie/check`, {
          credentials: 'include',
        });
        report(
          'credentialed cookies',
          (await cookie.text()).includes('gpui-network=present'),
        );
        const omittedCookie = await fetch(`${httpBase}/cookie/check`, {
          credentials: 'omit',
        });
        report(
          'credentials: omit',
          (await omittedCookie.text()) === 'cookie-missing',
        );
        const blobResponse = await fetch(`${httpBase}/blob`);
        const blob = await blobResponse.blob();
        report(
          'Blob response',
          blob instanceof Blob && blob.size === 6,
          `${blob.size} bytes`,
        );
        const blobDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        report('Blob FileReader', blobDataUrl.endsWith('AAECf/7/'));
        const blobUpload = await fetch(`${httpBase}/blob-upload`, {
          method: 'POST',
          body: blob,
        });
        report(
          'Blob request body',
          (await blobUpload.text()) === 'blob-upload-ok',
        );
        const controller = new AbortController();
        const pending = fetch(`${httpBase}/slow`, {
          signal: controller.signal,
        });
        controller.abort();
        let aborted = false;
        try {
          await pending;
        } catch {
          aborted = true;
        }
        report('AbortController', aborted);
        await new Promise<void>(resolve => {
          const request = new XMLHttpRequest();
          let sawPartial = false;
          request.open('GET', `${httpBase}/stream`);
          request.onprogress = () => {
            sawPartial ||= request.responseText.includes('first-');
          };
          request.onload = () => {
            report(
              'incremental response events',
              sawPartial && request.responseText === 'first-second-third',
            );
            resolve();
          };
          request.onerror = () => {
            report('incremental response events', false, 'XHR failed');
            resolve();
          };
          request.send();
        });
        await new Promise<void>(resolve => {
          networking.clearCookies(cleared => {
            report('clearCookies', cleared);
            resolve();
          });
        });
        const clearedCookie = await fetch(`${httpBase}/cookie/check`, {
          credentials: 'include',
        });
        report(
          'cleared cookie jar',
          (await clearedCookie.text()) === 'cookie-missing',
        );
      } catch (error) {
        report('HTTP probe setup', false, String(error));
      }
    };
    checkHttp();
    let socket: WebSocket | undefined;
    let gotText = false;
    let gotBinary = false;
    let gotClose = false;
    try {
      socket = new WebSocket(secureWebSocketUrl);
      (
        socket as WebSocket & {
          binaryType: string;
        }
      ).binaryType = 'arraybuffer';
      socket.onopen = () => {
        socket?.send('network-ws-text');
        socket?.send(new Uint8Array([1, 2, 3, 254]).buffer);
      };
      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          gotText = event.data === 'network-ws-text';
        } else if (event.data instanceof ArrayBuffer) {
          const bytes = Array.from(new Uint8Array(event.data));
          gotBinary = bytes.join(',') === '1,2,3,254';
        }
        if (gotText && gotBinary) socket?.close(4001, 'probe complete');
      };
      socket.onclose = event => {
        gotClose = event.code === 4001 && event.reason === 'probe complete';
        report('wss text and binary frames', gotText && gotBinary);
        report(
          'WebSocket close code and reason',
          gotClose,
          `${event.code} ${event.reason}`,
        );
      };
      socket.onerror = () =>
        report('wss connection', false, 'connection error');
    } catch (error) {
      report('wss connection', false, String(error));
    }
    return () => {
      active = false;
      socket?.close();
    };
  }, []);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>React Native networking</Text>
      <Text style={styles.subtitle}>
        Local HTTP and trusted local WSS acceptance probe
      </Text>
      <View style={styles.card}>
        {results.map((result, index) => (
          <Text
            key={`${index}-${result}`}
            style={result.startsWith('FAIL') ? styles.fail : styles.pass}
          >
            {result}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#101521',
  },
  content: {
    padding: 32,
    gap: 20,
    alignItems: 'flex-start',
  },
  title: {
    color: '#f5f7ff',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#b9c4d8',
    fontSize: 15,
  },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 14,
    backgroundColor: '#1b2434',
  },
  pass: {
    color: '#7ee0aa',
    fontSize: 15,
  },
  fail: {
    color: '#ff7885',
    fontSize: 15,
  },
});
export default NetworkingFixture;
