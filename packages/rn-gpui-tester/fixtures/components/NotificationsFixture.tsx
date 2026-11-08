import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import notifications, {
  type NotificationEvent,
} from '@react-native-gpui/notifications';

function waitFor(
  match: (event: NotificationEvent) => boolean,
  timeout = 8000,
): Promise<NotificationEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove();
      reject(new Error('TIMEOUT waiting for an event'));
    }, timeout);
    const subscription = notifications.onEvent(event => {
      if (!match(event)) return;
      clearTimeout(timer);
      subscription.remove();
      resolve(event);
    });
  });
}

/**
 * Exercises every call of the notifications module and prints one line per
 * claim. Delivery goes through whatever the platform offers for the running
 * binary, so the claims are about the module's own behaviour: ids, scheduling,
 * repeats, cancelling and events.
 */
export function NotificationsFixture() {
  const [lines, setLines] = useState<Array<string>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };
      const run = `fixture-${Date.now()}`;

      await notifications.cancelAll();

      const permission = await notifications.getPermission();
      record(
        `permission ${['granted', 'denied', 'notDetermined'].includes(permission) ? 'ok' : `BAD ${permission}`}`,
      );

      const delivered = waitFor(
        event => event.type === 'delivered' && event.notification.id === run,
      );
      const id = await notifications.show({
        id: run,
        title: 'Fixture',
        body: 'shown now',
        silent: true,
      });
      const event = await delivered;
      record(
        `show ${id === run && event.notification.body === 'shown now' ? 'ok' : 'BAD'}`,
      );

      const generated = await notifications.show({ title: 'Generated id' });
      record(`generatedId ${generated.length > 0 ? 'ok' : 'BAD'}`);

      const soon = `${run}-soon`;
      const fired = waitFor(
        e => e.type === 'delivered' && e.notification.id === soon,
      );
      const at = Date.now() + 1500;
      await notifications.schedule(
        {
          id: soon,
          title: 'Scheduled',
          body: 'fires soon',
          silent: true,
          data: { type: 'reminder', payload: 'x' },
          actions: [
            { id: 'snooze', title: 'Snooze' },
            {
              id: 'reply',
              title: 'Reply',
              input: { placeholder: 'Type', buttonTitle: 'Send' },
            },
          ],
        },
        { timestamp: at },
      );
      const pending = (await notifications.getScheduled()).find(
        s => s.notification.id === soon,
      );
      record(
        `scheduled ${
          pending?.trigger.timestamp === at &&
          pending.notification.data?.payload === 'x' &&
          pending.notification.actions?.[1]?.input?.placeholder === 'Type'
            ? 'ok'
            : 'BAD'
        }`,
      );
      const firedEvent = await fired;
      record(
        `fired ${firedEvent.notification.data?.type === 'reminder' ? 'ok' : 'BAD'}`,
      );
      const after = await notifications.getScheduled();
      record(
        `oneShotRemoved ${after.some(s => s.notification.id === soon) ? 'BAD' : 'ok'}`,
      );

      const past = await notifications
        .schedule({ id: `${run}-past` }, { timestamp: Date.now() - 1000 })
        .then(
          () => 'BAD',
          () => 'ok',
        );
      record(`pastRejected ${past}`);

      const day = 24 * 60 * 60 * 1000;
      await notifications.schedule(
        { id: `${run}-daily`, silent: true },
        { timestamp: Date.now() - 3 * day + 60_000, repeat: 'daily' },
      );
      await notifications.schedule(
        { id: `${run}-monthly`, silent: true },
        { timestamp: Date.now() + 10 * day, repeat: 'monthly' },
      );
      const list = await notifications.getScheduled();
      const daily = list.find(s => s.notification.id === `${run}-daily`);
      record(
        `repeat ${daily?.trigger.repeat === 'daily' && list[0]?.notification.id === `${run}-daily` ? 'ok' : 'BAD'}`,
      );

      await notifications.cancelScheduled(`${run}-daily`);
      const left = (await notifications.getScheduled()).map(
        s => s.notification.id,
      );
      record(
        `cancelScheduled ${left.join() === `${run}-monthly` ? 'ok' : 'BAD'}`,
      );

      await notifications.cancel(`${run}-monthly`);
      record(
        `cancel ${(await notifications.getScheduled()).length === 0 ? 'ok' : 'BAD'}`,
      );

      await notifications.schedule(
        { id: `${run}-a` },
        { timestamp: Date.now() + day },
      );
      await notifications.schedule(
        { id: `${run}-b` },
        { timestamp: Date.now() + day },
      );
      await notifications.cancelAll();
      record(
        `cancelAll ${(await notifications.getScheduled()).length === 0 ? 'ok' : 'BAD'}`,
      );

      await notifications.cancelDisplayed();
      record(
        `displayed ${Array.isArray(await notifications.getDisplayed()) ? 'ok' : 'BAD'}`,
      );
      record(
        `initialEvent ${(await notifications.getInitialEvent()) === null ? 'ok' : 'BAD'}`,
      );
      record(
        `settings ${typeof notifications.openSettings === 'function' ? 'ok' : 'BAD'}`,
      );
    })().catch(error => {
      if (!cancelled)
        setLines(current => [...current, `FAILED ${(error as Error).message}`]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text testID="notifications-title" style={styles.title}>
        Notifications
      </Text>
      {lines.map(line => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, gap: 6 },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '600', marginBottom: 8 },
  line: { color: '#94a3b8', fontSize: 13, fontFamily: 'Courier' },
});
