use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::{Mutex, OnceLock};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, ProtocolObject};
use objc2::{define_class, AnyThread, MainThreadMarker};
use objc2_app_kit::NSApplication;
use objc2_foundation::{
    NSArray, NSBundle, NSDictionary, NSError, NSObject, NSObjectProtocol, NSOperationQueue, NSSet,
    NSString,
};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationAction, UNNotificationActionOptions, UNNotificationCategory,
    UNNotificationCategoryOptions, UNNotificationPresentationOptions, UNNotificationRequest,
    UNNotificationResponse, UNNotificationSettings, UNNotificationSound,
    UNTextInputNotificationAction, UNTextInputNotificationResponse, UNUserNotificationCenter,
    UNUserNotificationCenterDelegate,
};

use super::{Done, Platform};
use crate::{hub, EventSpec, NotificationActionSpec, NotificationSpec};

const DEFAULT_ACTION: &str = "com.apple.UNNotificationDefaultActionIdentifier";
const DISMISS_ACTION: &str = "com.apple.UNNotificationDismissActionIdentifier";
const DATA_KEY: &str = "rn-gpui-data";

pub fn is_bundled() -> bool {
    let bundle = NSBundle::mainBundle();
    bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
}

fn center() -> Retained<UNUserNotificationCenter> {
    UNUserNotificationCenter::currentNotificationCenter()
}

fn ns(value: &str) -> Retained<NSString> {
    NSString::from_str(value)
}

fn category_id(actions: &[NotificationActionSpec]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for action in actions {
        for part in [
            action.id.as_str(),
            action.title.as_str(),
            action.input_placeholder.as_deref().unwrap_or(""),
            action.input_button_title.as_deref().unwrap_or(""),
        ] {
            for byte in part.bytes().chain(std::iter::once(0)) {
                hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
            }
        }
    }
    format!("rn-gpui.{hash:016x}")
}

fn category(id: &str, actions: &[NotificationActionSpec]) -> Retained<UNNotificationCategory> {
    let built: Vec<Retained<UNNotificationAction>> = actions
        .iter()
        .map(|action| match &action.input_placeholder {
            Some(placeholder) => {
                let title = action.input_button_title.as_deref().unwrap_or(&action.title);
                UNTextInputNotificationAction::actionWithIdentifier_title_options_textInputButtonTitle_textInputPlaceholder(
                    &ns(&action.id),
                    &ns(&action.title),
                    UNNotificationActionOptions::empty(),
                    &ns(title),
                    &ns(placeholder),
                )
                .into_super()
            }
            None => UNNotificationAction::actionWithIdentifier_title_options(
                &ns(&action.id),
                &ns(&action.title),
                UNNotificationActionOptions::empty(),
            ),
        })
        .collect();
    let array = NSArray::from_retained_slice(&built);
    UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
        &ns(id),
        &array,
        &NSArray::new(),
        UNNotificationCategoryOptions::CustomDismissAction,
    )
}

pub struct Center {
    categories: Mutex<HashMap<String, Vec<NotificationActionSpec>>>,
}

impl Center {
    pub fn new() -> Self {
        install_delegate();
        Self {
            categories: Mutex::new(HashMap::new()),
        }
    }

    fn register_category(&self, actions: &[NotificationActionSpec]) -> String {
        let id = category_id(actions);
        let mut known = self.categories.lock().expect("categories");
        if !known.contains_key(&id) {
            known.insert(id.clone(), actions.to_vec());
            let all: Vec<Retained<UNNotificationCategory>> = known
                .iter()
                .map(|(id, actions)| category(id, actions))
                .collect();
            center().setNotificationCategories(&NSSet::from_retained_slice(&all));
        }
        id
    }
}

fn status_name(status: UNAuthorizationStatus) -> &'static str {
    match status {
        UNAuthorizationStatus::NotDetermined => "notDetermined",
        UNAuthorizationStatus::Denied => "denied",
        _ => "granted",
    }
}

fn read_permission(done: Done<&'static str>) {
    let done = Mutex::new(Some(done));
    let block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        if let Some(done) = done.lock().expect("completion").take() {
            done(status_name(status));
        }
    });
    center().getNotificationSettingsWithCompletionHandler(&block);
}

impl Platform for Center {
    fn show(&self, notification: NotificationSpec, done: Done<Result<(), String>>) {
        let content = UNMutableNotificationContent::new();
        if let Some(title) = &notification.title {
            content.setTitle(&ns(title));
        }
        if let Some(subtitle) = &notification.subtitle {
            content.setSubtitle(&ns(subtitle));
        }
        if let Some(body) = &notification.body {
            content.setBody(&ns(body));
        }
        if notification.silent != Some(true) {
            content.setSound(Some(&UNNotificationSound::defaultSound()));
        }
        if let Some(data) = &notification.data {
            let key = ns(DATA_KEY);
            let value = ns(data);
            let info: Retained<NSDictionary<AnyObject, AnyObject>> = unsafe {
                NSDictionary::dictionaryWithObject_forKey(
                    &*(&*value as *const NSString as *const AnyObject),
                    ProtocolObject::from_ref(&*key),
                )
            };
            unsafe { content.setUserInfo(&info) };
        }
        let actions = notification.actions.as_deref().unwrap_or(&[]);
        content.setCategoryIdentifier(&ns(&self.register_category(actions)));

        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &ns(&notification.id),
            &content,
            None,
        );
        let done = Mutex::new(Some(done));
        let block = RcBlock::new(move |error: *mut NSError| {
            let result = match unsafe { error.as_ref() } {
                Some(error) => Err(error.localizedDescription().to_string()),
                None => Ok(()),
            };
            if let Some(done) = done.lock().expect("completion").take() {
                done(result);
            }
        });
        center().addNotificationRequest_withCompletionHandler(&request, Some(&block));
    }

    fn remove_delivered(&self, id: Option<String>) {
        match id {
            Some(id) => center().removeDeliveredNotificationsWithIdentifiers(
                &NSArray::from_retained_slice(&[ns(&id)]),
            ),
            None => center().removeAllDeliveredNotifications(),
        }
    }

    fn delivered(&self, done: Done<Vec<NotificationSpec>>) {
        let done = Mutex::new(Some(done));
        let block = RcBlock::new(move |list: NonNull<NSArray<UNNotification>>| {
            let list = unsafe { list.as_ref() };
            let notifications = list.iter().map(|n| describe(&n)).collect();
            if let Some(done) = done.lock().expect("completion").take() {
                done(notifications);
            }
        });
        center().getDeliveredNotificationsWithCompletionHandler(&block);
    }

    fn permission(&self, done: Done<&'static str>) {
        read_permission(done);
    }

    fn request_permission(&self, done: Done<&'static str>) {
        let done = Mutex::new(Some(done));
        let block = RcBlock::new(move |_granted: Bool, _error: *mut NSError| {
            if let Some(done) = done.lock().expect("completion").take() {
                read_permission(done);
            }
        });
        center().requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert
                | UNAuthorizationOptions::Sound
                | UNAuthorizationOptions::Badge,
            &block,
        );
    }

    fn open_settings(&self) {
        super::script::open_settings();
    }
}

fn describe(notification: &UNNotification) -> NotificationSpec {
    let request = notification.request();
    let content = request.content();
    let text = |value: Retained<NSString>| {
        let value = value.to_string();
        (!value.is_empty()).then_some(value)
    };
    let key = ns(DATA_KEY);
    let data = content
        .userInfo()
        .objectForKey(unsafe { &*(&*key as *const NSString as *const AnyObject) })
        .and_then(|value| value.downcast_ref::<NSString>().map(|s| s.to_string()));
    NotificationSpec {
        id: request.identifier().to_string(),
        title: text(content.title()),
        subtitle: text(content.subtitle()),
        body: text(content.body()),
        silent: None,
        data,
        actions: None,
    }
}

fn focus_app() {
    let work = RcBlock::new(|| {
        let Some(marker) = MainThreadMarker::new() else {
            return;
        };
        let app = NSApplication::sharedApplication(marker);
        app.unhide(None);
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);
        if let Some(window) = app.mainWindow().or_else(|| app.keyWindow()) {
            window.deminiaturize(None);
            window.makeKeyAndOrderFront(None);
        }
    });
    unsafe { NSOperationQueue::mainQueue().addOperationWithBlock(&work) };
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "RNGpuiNotificationDelegate"]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Delegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            handler: &block2::DynBlock<dyn Fn()>,
        ) {
            let identifier = response.actionIdentifier().to_string();
            let notification = describe(&response.notification());
            let input = response
                .downcast_ref::<UNTextInputNotificationResponse>()
                .map(|r| r.userText().to_string());
            let (kind, action) = match identifier.as_str() {
                DEFAULT_ACTION => ("press", None),
                DISMISS_ACTION => ("dismiss", None),
                _ => ("action", Some(identifier)),
            };
            if kind != "dismiss" {
                focus_app();
            }
            hub::emit(EventSpec {
                r#type: kind.to_string(),
                notification,
                action_id: action,
                input,
            });
            handler.call(());
        }
    }
);

struct Installed(#[allow(dead_code)] Retained<Delegate>);
unsafe impl Send for Installed {}
unsafe impl Sync for Installed {}

static DELEGATE: OnceLock<Installed> = OnceLock::new();

pub fn install_delegate() {
    DELEGATE.get_or_init(|| {
        let delegate: Retained<Delegate> = unsafe { objc2::msg_send![Delegate::alloc(), init] };
        center().setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        Installed(delegate)
    });
}
