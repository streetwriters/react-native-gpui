---
id: desktop-notifications
title: Notifications
---

`@react-native-gpui/notifications` shows desktop notifications and schedules them for later, including daily, weekly and monthly repeats. Taps on a notification, and on its actions, arrive as events and bring the app to the front.

```shell
npm install @react-native-gpui/notifications
```

```js
import notifications from '@react-native-gpui/notifications';

if ((await notifications.requestPermission()) === 'granted') {
  await notifications.show({ title: 'Saved', body: 'Your note is synced.' });
}

await notifications.schedule(
  {
    id: 'reminder-1',
    title: 'Stand-up',
    body: 'Starts in five minutes',
    data: { noteId: '42' },
    actions: [{ id: 'snooze', title: 'Remind me in 5 minutes' }],
  },
  { timestamp: Date.now() + 60_000, repeat: 'daily' },
);

const subscription = notifications.onEvent(event => {
  if (event.type === 'action' && event.actionId === 'snooze') {
    // event.notification.data.noteId
  }
});
```

## Showing

`show(request)` posts a notification now and resolves with its id; without an `id` one is generated. A request has these fields, all optional:

| Field      | Description                                                                           |
| ---------- | ------------------------------------------------------------------------------------- |
| `id`       | Replaces a notification with the same id.                                             |
| `title`    | The first line.                                                                       |
| `subtitle` | A line under the title.                                                               |
| `body`     | The message.                                                                          |
| `silent`   | Skips the sound.                                                                      |
| `data`     | A map of strings handed back on events.                                               |
| `actions`  | Buttons, each `{id, title}`; add `input: {placeholder, buttonTitle}` to ask for text. |

## Scheduling

`schedule(request, {timestamp, repeat})` fires at `timestamp`, in milliseconds since the epoch. `repeat` is `hourly`, `daily`, `weekly` or `monthly`; repeats keep the local time of day, and a monthly one keeps its day of the month, using the last day of shorter months. A time in the past rejects, except for a repeating trigger, which starts at its next occurrence.

Scheduled notifications are held by the running app. They are not kept across a restart, so schedule them again at launch. Notifications are not posted while the app is not running.

| Call                   | Effect                                              |
| ---------------------- | --------------------------------------------------- |
| `cancel(id)`           | Cancels the scheduled and removes the delivered one |
| `cancelScheduled(id?)` | One scheduled notification, or all                  |
| `cancelDisplayed(id?)` | One delivered notification, or all                  |
| `cancelAll()`          | Everything                                          |
| `getScheduled()`       | Scheduled notifications, soonest first              |
| `getDisplayed()`       | Notifications still in the notification centre      |

## Permission

`getPermission()` resolves with `granted`, `denied` or `notDetermined`; `requestPermission()` asks once and resolves with the answer. `openSettings()` opens the system's notification settings.

## Events

`onEvent(listener)` receives `{type, notification, actionId?, input?}` and returns a subscription with `remove()`.

| `type`      | When                                                     |
| ----------- | -------------------------------------------------------- |
| `delivered` | A notification was posted.                               |
| `press`     | The notification was tapped. The app comes to the front. |
| `action`    | An action was tapped; `actionId`, and `input` for text.  |
| `dismiss`   | The notification was dismissed.                          |

`getInitialEvent()` resolves with the tap that launched the app, once, or `null`.

## Platforms

On macOS the notifications go through `UNUserNotificationCenter`, which requires the app to run as a bundle. A packaged app gets actions, taps, dismissals, permissions and the delivered list. An unbundled debug binary posts through AppleScript instead: no actions, taps, dismissals or permission state, `getPermission` reports `granted` and `getDisplayed` is empty. Other platforms are not supported yet, and `show` rejects.
