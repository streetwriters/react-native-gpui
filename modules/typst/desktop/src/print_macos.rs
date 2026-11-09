use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject};
use objc2::{msg_send, MainThreadMarker};
use objc2_foundation::{NSNumber, NSString, NSURL};
use rn_gpui_module::ModuleError;

use crate::{failure, TypstPrintOptions, TypstPrintResult};

#[link(name = "PDFKit", kind = "framework")]
extern "C" {}

const SCALE_DOWN_TO_FIT: isize = 2;

fn class(name: &std::ffi::CStr) -> Result<&'static AnyClass, ModuleError> {
    AnyClass::get(name).ok_or_else(|| failure(format!("{name:?} is not available")))
}

pub fn print(path: &str, options: &TypstPrintOptions) -> Result<TypstPrintResult, ModuleError> {
    let Some(_main) = MainThreadMarker::new() else {
        return Err(failure("printing has to run on the main thread"));
    };
    if !std::path::Path::new(path).is_file() {
        return Err(failure(format!("{path} does not exist")));
    }
    unsafe {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let allocated: Allocated<AnyObject> = msg_send![class(c"PDFDocument")?, alloc];
        let document: Option<Retained<AnyObject>> = msg_send![allocated, initWithURL: &*url];
        let Some(document) = document else {
            return Err(failure(format!("{path} is not a readable PDF")));
        };
        let shared: Retained<AnyObject> = msg_send![class(c"NSPrintInfo")?, sharedPrintInfo];
        let info: Retained<AnyObject> = msg_send![&*shared, copy];
        let dictionary: Retained<AnyObject> = msg_send![&*info, dictionary];
        let copies = NSNumber::new_i64(options.copies.max(1.0) as i64);
        let copies_key = NSString::from_str("NSCopies");
        let _: () = msg_send![&*dictionary, setObject: &*copies, forKey: &*copies_key];
        let operation: Option<Retained<AnyObject>> = msg_send![
            &*document,
            printOperationForPrintInfo: &*info,
            scalingMode: SCALE_DOWN_TO_FIT,
            autoRotate: true
        ];
        let Some(operation) = operation else {
            return Err(failure("the print operation could not be created"));
        };
        if let Some(title) = &options.title {
            let title = NSString::from_str(title);
            let _: () = msg_send![&*operation, setJobTitle: &*title];
        }
        let _: () = msg_send![&*operation, setShowsPrintPanel: true];
        let _: () = msg_send![&*operation, setShowsProgressPanel: true];
        let printed: bool = msg_send![&*operation, runOperation];
        Ok(TypstPrintResult {
            status: if printed { "printed" } else { "cancelled" }.to_string(),
        })
    }
}
