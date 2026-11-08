import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  getPrf,
  installSoftAuthenticator,
  isAvailable,
  onStatus,
  register,
  removeSoftAuthenticator,
} from '@react-native-gpui/webauthn';

const RP = 'app.notesnook.com';
const PIN = '1234';

const errorCode = async (call: () => Promise<unknown>) => {
  try {
    await call();
    return 'none';
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
};

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Runs the security key flow of the app lock against the software
 * authenticator: a resident credential, the PIN, and the PRF secret derived
 * twice from the same credential.
 */
export function WebauthnFixture() {
  const [lines, setLines] = useState<Array<string>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };
      const states: Array<string> = [];
      const subscription = onStatus(state => states.push(state));
      try {
        await installSoftAuthenticator(PIN);
        record(`available ${(await isAvailable()) ? 'ok' : 'BAD'}`);

        const user = new Uint8Array([1, 2, 3, 4]);
        const base = {
          rpId: RP,
          rpName: 'Notesnook',
          userId: user,
          userName: 'me',
        };
        record(
          `noPin ${(await errorCode(() => register(base))) === 'ERR_WEBAUTHN_PIN_REQUIRED' ? 'ok' : 'BAD'}`,
        );
        record(
          `wrongPin ${(await errorCode(() => register({ ...base, pin: '0000' }))) === 'ERR_WEBAUTHN_PIN_INVALID' ? 'ok' : 'BAD'}`,
        );

        const made = await register({ ...base, pin: PIN });
        record(
          `register ${made.credentialId.length === 32 && made.prfEnabled && made.transports[0] === 'usb' ? 'ok' : 'BAD'}`,
        );

        const salt = new Uint8Array(32).fill(9);
        const first = await getPrf({
          rpId: RP,
          credentialId: made.credentialId,
          salt,
          pin: PIN,
        });
        const second = await getPrf({
          rpId: RP,
          credentialId: made.credentialId,
          salt,
          pin: PIN,
        });
        record(
          `prfSame ${first.length === 32 && same(first, second) ? 'ok' : 'BAD'}`,
        );
        const other = await getPrf({
          rpId: RP,
          credentialId: made.credentialId,
          salt: new Uint8Array(32).fill(7),
          pin: PIN,
        });
        record(`prfSalt ${same(first, other) ? 'BAD' : 'ok'}`);

        record(
          `unknown ${
            (await errorCode(() =>
              getPrf({
                rpId: RP,
                credentialId: new Uint8Array(32),
                salt,
                pin: PIN,
              }),
            )) === 'ERR_WEBAUTHN_NO_CREDENTIALS'
              ? 'ok'
              : 'BAD'
          }`,
        );
        await new Promise(resolve => setTimeout(resolve, 200));
        record(`touch ${states.includes('touch') ? 'ok' : 'BAD'}`);
        record('done ok');
      } catch (error) {
        record(`FAILED ${String(error)}`);
      } finally {
        subscription.remove();
        await removeSoftAuthenticator().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.root}>
      <Text testID="webauthn-title" style={styles.title}>
        Webauthn
      </Text>
      {lines.map(line => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', padding: 24, gap: 6 },
  title: { color: '#111111', fontSize: 16 },
  line: { color: '#111111', fontSize: 12 },
});
