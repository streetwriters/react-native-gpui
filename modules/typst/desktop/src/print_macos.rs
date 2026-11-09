use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject};
use objc2::{msg_send, MainThreadMarker};
use objc2_foundation::{NSNumber, NSString, NSURL};
use rn_gpui_module::ModuleError;

use crate::{failure, TypstPrintOptions, TypstPrintResult};

#[link(name = "PDFKit", kind = "framework")]
extern "C" {}

const SCALE_DOWN_TO_FIT: isize = 2;

fn unsupported_range() -> ModuleError {
    ModuleError::with_code("ERR_PRINT_RANGE", "the page range is not valid")
}

fn print_error(message: impl ToString) -> ModuleError {
    ModuleError::with_code("ERR_PRINT", message.to_string())
}

fn class(name: &std::ffi::CStr) -> Result<&'static AnyClass, ModuleError> {
    AnyClass::get(name).ok_or_else(|| print_error(format!("{name:?} is not available")))
}

pub fn parse_range(range: &str, pages: usize) -> Result<Vec<usize>, ModuleError> {
    let mut selected = Vec::new();
    for part in range.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        let (from, to) = match part.split_once('-') {
            Some((a, b)) => (a.trim(), b.trim()),
            None => (part, part),
        };
        let from: usize = from.parse().map_err(|_| unsupported_range())?;
        let to: usize = if to.is_empty() {
            pages
        } else {
            to.parse().map_err(|_| unsupported_range())?
        };
        if from == 0 || to < from || from > pages {
            return Err(unsupported_range());
        }
        for page in from..=to.min(pages) {
            selected.push(page - 1);
        }
    }
    if selected.is_empty() {
        return Err(unsupported_range());
    }
    Ok(selected)
}

pub fn print(path: &str, options: &TypstPrintOptions) -> Result<TypstPrintResult, ModuleError> {
    let Some(_main) = MainThreadMarker::new() else {
        return Err(print_error("printing has to run on the main thread"));
    };
    if !std::path::Path::new(path).is_file() {
        return Err(print_error(format!("{path} does not exist")));
    }
    unsafe {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let allocated: Allocated<AnyObject> = msg_send![class(c"PDFDocument")?, alloc];
        let loaded: Option<Retained<AnyObject>> = msg_send![allocated, initWithURL: &*url];
        let Some(loaded) = loaded else {
            return Err(print_error(format!("{path} is not a readable PDF")));
        };
        let count: usize = msg_send![&*loaded, pageCount];
        let document = match options
            .page_range
            .as_deref()
            .filter(|r| !r.trim().is_empty())
        {
            None => loaded,
            Some(range) => {
                let pages = parse_range(range, count)?;
                let allocated: Allocated<AnyObject> = msg_send![class(c"PDFDocument")?, alloc];
                let subset: Retained<AnyObject> = msg_send![allocated, init];
                for (position, index) in pages.iter().enumerate() {
                    let page: Option<Retained<AnyObject>> =
                        msg_send![&*loaded, pageAtIndex: *index];
                    let Some(page) = page else { continue };
                    let copy: Retained<AnyObject> = msg_send![&*page, copy];
                    let _: () = msg_send![&*subset, insertPage: &*copy, atIndex: position];
                }
                subset
            }
        };

        let shared: Retained<AnyObject> = msg_send![class(c"NSPrintInfo")?, sharedPrintInfo];
        let info: Retained<AnyObject> = msg_send![&*shared, copy];
        let dictionary: Retained<AnyObject> = msg_send![&*info, dictionary];
        let copies = NSNumber::new_i64(options.copies.max(1.0) as i64);
        let key = NSString::from_str("NSCopies");
        let _: () = msg_send![&*dictionary, setObject: &*copies, forKey: &*key];
        if let Some(output) = &options.output_path {
            let save = NSString::from_str("NSPrintSaveJob");
            let _: () = msg_send![&*info, setJobDisposition: &*save];
            let target = NSURL::fileURLWithPath(&NSString::from_str(output));
            let key = NSString::from_str("NSJobSavingURL");
            let _: () = msg_send![&*dictionary, setObject: &*target, forKey: &*key];
        }
        let operation: Option<Retained<AnyObject>> = msg_send![
            &*document,
            printOperationForPrintInfo: &*info,
            scalingMode: SCALE_DOWN_TO_FIT,
            autoRotate: true
        ];
        let Some(operation) = operation else {
            return Err(print_error("the print operation could not be created"));
        };
        if let Some(title) = &options.title {
            let title = NSString::from_str(title);
            let _: () = msg_send![&*operation, setJobTitle: &*title];
        }
        let show = options.panel && options.output_path.is_none();
        let _: () = msg_send![&*operation, setShowsPrintPanel: show];
        let _: () = msg_send![&*operation, setShowsProgressPanel: show];
        let printed: bool = msg_send![&*operation, runOperation];
        Ok(TypstPrintResult {
            status: if printed { "printed" } else { "cancelled" }.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_page_ranges() {
        assert_eq!(parse_range("1-3,5", 10).unwrap(), vec![0, 1, 2, 4]);
        assert_eq!(parse_range("2-", 4).unwrap(), vec![1, 2, 3]);
        assert_eq!(parse_range("3", 4).unwrap(), vec![2]);
        assert_eq!(parse_range("2-99", 4).unwrap(), vec![1, 2, 3]);
        for bad in ["", "0", "3-1", "9", "a", "1,,x"] {
            assert!(parse_range(bad, 4).is_err(), "{bad}");
        }
    }
}
