//! `NSSharingServicePicker` below the middle of the window.

use cocoa::base::{id, nil};
use cocoa::foundation::{NSArray, NSPoint, NSRect, NSSize, NSString};
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel};
use objc::{class, msg_send, sel, sel_impl};
use std::cell::RefCell;
use std::ffi::c_void;
use std::sync::Once;

type Done = Box<dyn FnOnce(Option<String>)>;

thread_local! {
    static OPEN: RefCell<bool> = const { RefCell::new(false) };
    static DELEGATE: RefCell<Option<id>> = const { RefCell::new(None) };
}

fn delegate_class() -> &'static Class {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| {
        let mut declaration = ClassDecl::new("RNGpuiShareDelegate", class!(NSObject))
            .expect("the share delegate class is registered once");
        declaration.add_ivar::<*mut c_void>("done");
        // SAFETY: the method's signature matches `NSSharingServicePickerDelegate`.
        unsafe {
            declaration.add_method(
                sel!(sharingServicePicker:didChooseSharingService:),
                did_choose as extern "C" fn(&Object, Sel, id, id),
            );
        }
        declaration.register();
    });
    Class::get("RNGpuiShareDelegate").expect("the share delegate class exists")
}

extern "C" fn did_choose(this: &Object, _selector: Sel, _picker: id, service: id) {
    OPEN.with(|open| *open.borrow_mut() = false);
    // SAFETY: `done` holds the `Box<Done>` leaked in `present`; it is taken
    // once, here, and the pointer cleared.
    let done = unsafe {
        let pointer: *mut c_void = *this.get_ivar("done");
        let this = this as *const Object as *mut Object;
        (*this).set_ivar("done", std::ptr::null_mut::<c_void>());
        if pointer.is_null() {
            return;
        }
        Box::from_raw(pointer.cast::<Done>())
    };
    let title = if service.is_null() {
        None
    } else {
        // SAFETY: `service` is a live `NSSharingService`.
        unsafe {
            let title: id = msg_send![service, title];
            let bytes: *const std::os::raw::c_char = msg_send![title, UTF8String];
            (!bytes.is_null()).then(|| {
                std::ffi::CStr::from_ptr(bytes)
                    .to_string_lossy()
                    .into_owned()
            })
        }
    };
    (*done)(title);
}

/// Opens the picker; `done` gets the chosen service's name, or `None` when it
/// was dismissed.
pub fn present(window: &gpui::Window, message: Option<String>, url: Option<String>, done: Done) {
    let Ok(native) = crate::desktop::platform_window::ns_window(window) else {
        done(None);
        return;
    };
    // SAFETY: AppKit is only messaged from the main thread, where GPUI runs this.
    unsafe {
        let mut items: Vec<id> = Vec::new();
        if let Some(message) = &message {
            items.push(NSString::alloc(nil).init_str(message));
        }
        if let Some(url) = &url {
            let text = NSString::alloc(nil).init_str(url);
            let ns_url: id = msg_send![class!(NSURL), URLWithString: text];
            items.push(if ns_url == nil { text } else { ns_url });
        }
        if items.is_empty() {
            done(None);
            return;
        }
        let array = NSArray::arrayWithObjects(nil, &items);
        let picker: id = msg_send![class!(NSSharingServicePicker), alloc];
        let picker: id = msg_send![picker, initWithItems: array];
        let delegate: id = msg_send![delegate_class(), new];
        let boxed: *mut Done = Box::into_raw(Box::new(done));
        (*delegate).set_ivar("done", boxed.cast::<c_void>());
        let _: () = msg_send![picker, setDelegate: delegate];
        DELEGATE.with(|slot| *slot.borrow_mut() = Some(delegate));
        let view: id = msg_send![native, contentView];
        let bounds: NSRect = msg_send![view, bounds];
        let anchor = NSRect::new(
            NSPoint::new(bounds.size.width / 2.0, bounds.size.height / 2.0),
            NSSize::new(1.0, 1.0),
        );
        OPEN.with(|open| *open.borrow_mut() = true);
        // NSMinYEdge: the menu opens below the anchor.
        let _: () =
            msg_send![picker, showRelativeToRect: anchor ofView: view preferredEdge: 1usize];
    }
}

/// Whether the picker is on screen.
#[cfg(feature = "test-driver")]
pub fn is_open() -> bool {
    OPEN.with(|open| *open.borrow())
}

/// Reports the picker's delegate callback as the OS makes it: a chosen service
/// by its `NSSharingServiceName`, or `None` for a dismissal. The sheet itself is
/// not driven, because its menu tracking cannot be reached by synthetic events.
#[cfg(feature = "test-driver")]
pub fn simulate_choice(service_name: Option<&str>) -> bool {
    let Some(delegate) = DELEGATE.with(|delegate| *delegate.borrow()) else {
        return false;
    };
    // SAFETY: main thread; the delegate was leaked in `present` and is alive.
    unsafe {
        let service: id = match service_name {
            Some(name) => {
                let name = NSString::alloc(nil).init_str(name);
                msg_send![class!(NSSharingService), sharingServiceNamed: name]
            }
            None => nil,
        };
        did_choose(
            &*delegate,
            sel!(sharingServicePicker:didChooseSharingService:),
            nil,
            service,
        );
    }
    true
}
