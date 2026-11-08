import NativeNotifications, {
  type EventSpec,
  type NotificationSpec,
} from './NativeNotifications';

export type NotificationAction = {
  id: string;
  title: string;
  /** Makes the action ask for text, which arrives as `input` on the event. */
  input?: { placeholder: string; buttonTitle?: string };
};

export type NotificationRequest = {
  /** Shown and scheduled notifications with the same id replace each other. */
  id?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  silent?: boolean;
  data?: Record<string, string>;
  actions?: NotificationAction[];
};

export type Notification = NotificationRequest & { id: string };

export type Repeat = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type Trigger = {
  /** The first time to fire, in milliseconds since the epoch. */
  timestamp: number;
  repeat?: Repeat;
};

export type ScheduledNotification = {
  notification: Notification;
  trigger: Trigger;
};

export type Permission = 'granted' | 'denied' | 'notDetermined';

export type NotificationEvent = {
  /**
   * `press` is a tap on the notification, `action` a tap on one of its
   * actions, `dismiss` a swipe away and `delivered` the notification being
   * posted. Taps bring the app to the front.
   */
  type: 'press' | 'action' | 'dismiss' | 'delivered';
  notification: Notification;
  actionId?: string;
  input?: string;
};

let counter = 0;

function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

function toSpec(request: NotificationRequest): NotificationSpec {
  return {
    id: request.id ?? newId(),
    title: request.title,
    subtitle: request.subtitle,
    body: request.body,
    silent: request.silent,
    data: request.data ? JSON.stringify(request.data) : undefined,
    actions: request.actions?.map(({ id, title, input }) => ({
      id,
      title,
      inputPlaceholder: input?.placeholder,
      inputButtonTitle: input?.buttonTitle,
    })),
  };
}

function fromSpec(spec: NotificationSpec): Notification {
  const notification: Notification = { id: spec.id };
  if (spec.title != null) notification.title = spec.title;
  if (spec.subtitle != null) notification.subtitle = spec.subtitle;
  if (spec.body != null) notification.body = spec.body;
  if (spec.silent != null) notification.silent = spec.silent;
  if (spec.data != null) {
    try {
      notification.data = JSON.parse(spec.data);
    } catch {
      notification.data = {};
    }
  }
  if (spec.actions != null) {
    notification.actions = spec.actions.map(action => ({
      id: action.id,
      title: action.title,
      ...(action.inputPlaceholder != null
        ? {
            input: {
              placeholder: action.inputPlaceholder,
              ...(action.inputButtonTitle != null
                ? { buttonTitle: action.inputButtonTitle }
                : {}),
            },
          }
        : {}),
    }));
  }
  return notification;
}

function fromEvent(event: EventSpec): NotificationEvent {
  const result: NotificationEvent = {
    type: event.type as NotificationEvent['type'],
    notification: fromSpec(event.notification),
  };
  if (event.actionId != null) result.actionId = event.actionId;
  if (event.input != null) result.input = event.input;
  return result;
}

/** Shows a notification now and resolves with its id. */
export async function show(request: NotificationRequest): Promise<string> {
  const spec = toSpec(request);
  await NativeNotifications.show(spec);
  return spec.id;
}

/**
 * Schedules a notification and resolves with its id. Scheduling an id that is
 * already scheduled replaces it. A time in the past is rejected unless the
 * trigger repeats, in which case the next occurrence is used.
 *
 * Scheduled notifications are held by the running app: they are not kept across
 * a restart, so schedule them again at launch.
 */
export async function schedule(
  request: NotificationRequest,
  trigger: Trigger,
): Promise<string> {
  const spec = toSpec(request);
  await NativeNotifications.schedule(spec, {
    timestamp: trigger.timestamp,
    repeat: trigger.repeat,
  });
  return spec.id;
}

/** Cancels a scheduled notification and removes a delivered one. */
export function cancel(id: string): Promise<void> {
  return NativeNotifications.cancel(id);
}

/** Cancels one scheduled notification, or all of them without an id. */
export function cancelScheduled(id?: string): Promise<void> {
  return NativeNotifications.cancelScheduled(id ?? null);
}

/** Removes one delivered notification, or all of them without an id. */
export function cancelDisplayed(id?: string): Promise<void> {
  return NativeNotifications.cancelDisplayed(id ?? null);
}

export function cancelAll(): Promise<void> {
  return NativeNotifications.cancelAll();
}

/** Scheduled notifications, soonest first. */
export async function getScheduled(): Promise<ScheduledNotification[]> {
  const list = await NativeNotifications.getScheduled();
  return list.map(({ notification, trigger }) => ({
    notification: fromSpec(notification),
    trigger: {
      timestamp: trigger.timestamp,
      ...(trigger.repeat != null ? { repeat: trigger.repeat as Repeat } : {}),
    },
  }));
}

/** Notifications still in the notification centre. */
export async function getDisplayed(): Promise<Notification[]> {
  return (await NativeNotifications.getDisplayed()).map(fromSpec);
}

export async function getPermission(): Promise<Permission> {
  return (await NativeNotifications.getPermission()) as Permission;
}

/** Asks the user for permission once; later calls report the answer. */
export async function requestPermission(): Promise<Permission> {
  return (await NativeNotifications.requestPermission()) as Permission;
}

/** Opens the system's notification settings. */
export function openSettings(): Promise<void> {
  return NativeNotifications.openSettings();
}

/**
 * The tap that launched the app, once. Resolves with `null` when the app was
 * started some other way or the tap was already read.
 */
export async function getInitialEvent(): Promise<NotificationEvent | null> {
  const event = await NativeNotifications.getInitialEvent();
  return event ? fromEvent(event) : null;
}

export function onEvent(listener: (event: NotificationEvent) => void): {
  remove: () => void;
} {
  const subscription = NativeNotifications.onEvent(event =>
    listener(fromEvent(event)),
  );
  return { remove: () => subscription.remove() };
}

export default {
  show,
  schedule,
  cancel,
  cancelScheduled,
  cancelDisplayed,
  cancelAll,
  getScheduled,
  getDisplayed,
  getPermission,
  requestPermission,
  openSettings,
  getInitialEvent,
  onEvent,
};
