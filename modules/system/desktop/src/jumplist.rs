use rn_gpui_module::{ModuleError, Value};

#[cfg_attr(not(windows), allow(dead_code))]
pub struct Task {
    pub title: String,
    pub arguments: String,
    pub description: Option<String>,
    pub icon_path: Option<String>,
    pub icon_index: i32,
}

fn field<'a>(entry: &'a Value, key: &str) -> Option<&'a Value> {
    match entry {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value),
        _ => None,
    }
}

pub fn set(entries: &[Value]) -> Result<(), ModuleError> {
    let mut tasks = Vec::new();
    for entry in entries {
        let text = |key: &str| match field(entry, key) {
            Some(Value::String(text)) => Some(text.clone()),
            _ => None,
        };
        let title = text("title")
            .filter(|title| !title.is_empty())
            .ok_or_else(|| crate::failure("a jump list task needs a title"))?;
        let arguments = match field(entry, "args") {
            Some(Value::Array(args)) => args
                .iter()
                .filter_map(|arg| match arg {
                    Value::String(arg) => Some(quote(arg)),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" "),
            _ => String::new(),
        };
        tasks.push(Task {
            title,
            arguments,
            description: text("description"),
            icon_path: text("iconPath"),
            icon_index: match field(entry, "iconIndex") {
                Some(Value::Number(index)) => *index as i32,
                _ => 0,
            },
        });
    }
    imp::set(&tasks)
}

/// One argument as the Windows command line parser reads it back.
fn quote(argument: &str) -> String {
    if !argument.is_empty() && !argument.contains([' ', '\t', '"']) {
        return argument.to_string();
    }
    let mut quoted = String::from("\"");
    let mut slashes = 0;
    for character in argument.chars() {
        match character {
            '\\' => slashes += 1,
            '"' => {
                quoted.push_str(&"\\".repeat(slashes * 2 + 1));
                quoted.push('"');
                slashes = 0;
            }
            _ => {
                quoted.push_str(&"\\".repeat(slashes));
                quoted.push(character);
                slashes = 0;
            }
        }
    }
    quoted.push_str(&"\\".repeat(slashes * 2));
    quoted.push('"');
    quoted
}

#[cfg(test)]
mod tests {
    use super::quote;

    #[test]
    fn arguments_are_quoted_for_the_windows_command_line() {
        assert_eq!(quote("new"), "new");
        assert_eq!(quote("two words"), "\"two words\"");
        assert_eq!(quote(""), "\"\"");
        assert_eq!(quote("say \"hi\""), "\"say \\\"hi\\\"\"");
        assert_eq!(quote(r"C:\dir\"), r"C:\dir\");
        assert_eq!(quote(r"C:\my dir\"), r#""C:\my dir\\""#);
    }
}

#[cfg(windows)]
mod imp {
    use super::Task;
    use rn_gpui_module::ModuleError;
    use windows::core::PWSTR;
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemAlloc, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;
    use windows::Win32::UI::Shell::Common::IObjectArray;
    use windows::Win32::UI::Shell::Common::IObjectCollection;
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
    };

    fn fail(error: windows::core::Error) -> ModuleError {
        crate::failure(format!("the jump list could not be set: {error}"))
    }

    unsafe fn title_value(title: &str) -> Result<PROPVARIANT, ModuleError> {
        let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = wide.len() * 2;
        let memory = CoTaskMemAlloc(bytes) as *mut u16;
        if memory.is_null() {
            return Err(crate::failure("out of memory"));
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), memory, wide.len());
        let mut value = PROPVARIANT::default();
        let inner = &mut *value.Anonymous.Anonymous;
        inner.vt = VT_LPWSTR;
        inner.Anonymous.pwszVal = PWSTR(memory);
        Ok(value)
    }

    pub fn set(tasks: &[Task]) -> Result<(), ModuleError> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let list: ICustomDestinationList =
                CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER).map_err(fail)?;
            let mut slots = 0u32;
            let _removed: IObjectArray = list.BeginList(&mut slots).map_err(fail)?;
            let collection: IObjectCollection =
                CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)
                    .map_err(fail)?;
            let executable =
                std::env::current_exe().map_err(|error| crate::failure(error.to_string()))?;
            let executable = HSTRING::from(executable.as_os_str());
            for task in tasks {
                let link: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(fail)?;
                link.SetPath(&executable).map_err(fail)?;
                link.SetArguments(&HSTRING::from(task.arguments.as_str()))
                    .map_err(fail)?;
                if let Some(description) = &task.description {
                    link.SetDescription(&HSTRING::from(description.as_str()))
                        .map_err(fail)?;
                }
                let icon = task
                    .icon_path
                    .as_deref()
                    .map(HSTRING::from)
                    .unwrap_or_else(|| executable.clone());
                link.SetIconLocation(&icon, task.icon_index).map_err(fail)?;
                let store: IPropertyStore = link.cast().map_err(fail)?;
                let value = title_value(&task.title)?;
                store.SetValue(&PKEY_Title, &value).map_err(fail)?;
                store.Commit().map_err(fail)?;
                collection.AddObject(&link).map_err(fail)?;
            }
            let array: IObjectArray = collection.cast().map_err(fail)?;
            list.AddUserTasks(&array).map_err(fail)?;
            list.CommitList().map_err(fail)
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Task;
    use rn_gpui_module::ModuleError;

    pub fn set(_tasks: &[Task]) -> Result<(), ModuleError> {
        Err(crate::unsupported("the jump list"))
    }
}
