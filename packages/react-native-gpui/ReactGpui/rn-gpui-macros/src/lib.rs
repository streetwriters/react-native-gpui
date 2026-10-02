//! Procedural macros for native React Native modules implemented in Rust.

use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{parse_macro_input, ImplItem, ItemImpl, LitStr};

/// Declares sync `String -> String` methods on an inherent impl as a TurboModule.
/// The macro emits C ABI wrappers consumed by the C++ TurboModule host.
#[proc_macro_attribute]
pub fn rn_module(args: TokenStream, input: TokenStream) -> TokenStream {
    let name = parse_macro_input!(args as LitStr);
    let item = parse_macro_input!(input as ItemImpl);
    match expand_module(name, item) {
        Ok(tokens) => tokens.into(),
        Err(error) => error.into_compile_error().into(),
    }
}

fn expand_module(name: LitStr, item: ItemImpl) -> syn::Result<proc_macro2::TokenStream> {
    if item.trait_.is_some() {
        return Err(syn::Error::new_spanned(
            item,
            "#[rn_module] must be applied to an inherent impl block",
        ));
    }

    let self_ty = &item.self_ty;
    let type_name = match self_ty.as_ref() {
        syn::Type::Path(path) => path.path.segments.last().unwrap().ident.to_string(),
        other => {
            return Err(syn::Error::new_spanned(
                other,
                "expected a named module type",
            ))
        }
    };
    let symbol_prefix = type_name.to_ascii_lowercase();
    let module_name_ident = format_ident!("rn_gpui_{}_module_name", symbol_prefix);
    let mut generated = Vec::new();
    let mut method_names = Vec::new();
    let mut supported_methods = 0;

    for member in &item.items {
        let ImplItem::Fn(method) = member else {
            continue;
        };
        if method.sig.receiver().is_some() {
            return Err(syn::Error::new_spanned(
                &method.sig,
                "TurboModule methods must be associated functions without self",
            ));
        }
        if method.sig.inputs.len() != 1 {
            return Err(syn::Error::new_spanned(
                &method.sig,
                "the initial rn_module macro supports one String argument",
            ));
        }
        let input = method.sig.inputs.first().unwrap();
        let syn::FnArg::Typed(input) = input else {
            unreachable!()
        };
        let returns_string = match &method.sig.output {
            syn::ReturnType::Type(_, ty) => is_string_type(ty),
            syn::ReturnType::Default => false,
        };
        if !is_string_type(&input.ty) || !returns_string {
            return Err(syn::Error::new_spanned(
                &method.sig,
                "the initial rn_module macro supports only fn method(String) -> String",
            ));
        }
        let method_ident = &method.sig.ident;
        let export_ident = format_ident!("rn_gpui_{}_{}", symbol_prefix, method_ident);
        let method_name_ident = format_ident!("rn_gpui_{}_{}_name", symbol_prefix, method_ident);
        let free_ident = format_ident!("rn_gpui_{}_{}_free", symbol_prefix, method_ident);
        let argument = format_ident!("argument");
        method_names.push(LitStr::new(&method_ident.to_string(), method_ident.span()));
        generated.push(quote! {
            #[no_mangle]
            pub unsafe extern "C" fn #export_ident(#argument: *const ::std::ffi::c_char)
                -> *mut ::std::ffi::c_char
            {
                if #argument.is_null() { return ::std::ptr::null_mut(); }
                let input = unsafe { ::std::ffi::CStr::from_ptr(#argument) }
                    .to_string_lossy().into_owned();
                let result = <#self_ty>::#method_ident(input);
                match ::std::ffi::CString::new(result) {
                    Ok(value) => value.into_raw(),
                    Err(_) => ::std::ptr::null_mut(),
                }
            }

            #[no_mangle]
            pub extern "C" fn #method_name_ident() -> *const ::std::ffi::c_char {
                concat!(stringify!(#method_ident), "\0").as_ptr() as *const ::std::ffi::c_char
            }

            #[no_mangle]
            pub unsafe extern "C" fn #free_ident(value: *mut ::std::ffi::c_char) {
                if !value.is_null() {
                    drop(unsafe { ::std::ffi::CString::from_raw(value) });
                }
            }
        });
        supported_methods += 1;
    }

    if supported_methods == 0 {
        return Err(syn::Error::new_spanned(
            item,
            "#[rn_module] requires at least one supported sync method",
        ));
    }

    let descriptor_ident = format_ident!("{}_RN_MODULE_NAME", symbol_prefix.to_ascii_uppercase());
    let methods_ident = format_ident!("{}_RN_MODULE_METHODS", symbol_prefix.to_ascii_uppercase());
    let modules_ident = format_ident!("{}_RN_GPUI_MODULES", symbol_prefix.to_ascii_uppercase());
    Ok(quote! {
        #item
        pub const #descriptor_ident: &str = #name;
        pub const #methods_ident: &[&str] = &[#(#method_names),*];
        pub const #modules_ident: &[&str] = &[#name];
        #[no_mangle]
        pub extern "C" fn #module_name_ident() -> *const ::std::ffi::c_char {
            concat!(#name, "\0").as_ptr() as *const ::std::ffi::c_char
        }
        #(#generated)*
    })
}

fn is_string_type(ty: &syn::Type) -> bool {
    match ty {
        syn::Type::Path(path) => path.path.is_ident("String"),
        syn::Type::Reference(reference) => match reference.elem.as_ref() {
            syn::Type::Path(path) => path.path.is_ident("String"),
            _ => false,
        },
        _ => false,
    }
}
