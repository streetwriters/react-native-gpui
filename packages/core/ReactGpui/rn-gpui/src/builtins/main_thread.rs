//! Runs a job on the GPUI main thread and returns what it produced.
//!
//! `ModuleThread::Main` runs a job on the main thread but does not hand it the
//! `gpui::App`, so a built-in service that needs the app context posts its work
//! and awaits the result, exactly as the desktop-shell module does.

use futures::channel::oneshot;
use gpui::App;
use rn_gpui_module::ModuleError;

pub(crate) async fn on_main<T: Send + 'static>(
    command: impl FnOnce(&mut App) -> T + Send + 'static,
) -> Result<T, ModuleError> {
    let (sender, receiver) = oneshot::channel();
    crate::desktop::post_to_main(Box::new(move |cx| {
        let _ = sender.send(command(cx));
    }));
    receiver
        .await
        .map_err(|_| ModuleError::new("the desktop shell is not running"))
}
