use tauri::{Manager, Runtime, Window, plugin::Plugin};

pub struct PinchZoomDisablePlugin;

impl Default for PinchZoomDisablePlugin {
    fn default() -> Self {
        Self
    }
}

impl<R: Runtime> Plugin<R> for PinchZoomDisablePlugin {
    fn name(&self) -> &'static str {
        "Does not matter here"
    }

    fn window_created(&mut self, window: Window<R>) {
        let Some(webview_window) = window.get_webview_window(window.label()) else {
            return;
        };

        let _ = webview_window.with_webview(|_webview| {
            #[cfg(target_os = "linux")]
            unsafe {
                use gtk::GestureZoom;
                use gtk::glib::ObjectExt;
                use webkit2gtk::glib::gobject_ffi;

                if let Some(data) = _webview.inner().data::<GestureZoom>("wk-view-zoom-gesture") {
                    gobject_ffi::g_signal_handlers_destroy(data.as_ptr().cast());
                }
            }

            #[cfg(target_os = "macos")]
            unsafe {
                use objc2::msg_send;
                use objc2::rc::Retained;
                use objc2::runtime::AnyObject;
                use objc2_foundation::{NSNumber, NSString};
                use objc2_web_kit::WKWebView;

                // Get the WKWebView pointer and disable magnification gestures
                // This prevents Cmd+Ctrl+scroll and pinch-to-zoom from changing the zoom level
                let wk_webview: Retained<WKWebView> =
                    Retained::retain(_webview.inner().cast()).unwrap();
                wk_webview.setAllowsMagnification(false);

                // Enable getUserMedia / mediaDevices on the WKWebView. macOS WebKit
                // disables these by default; the flags below are private preferences
                // but they are how Safari Technology Preview and Electron expose
                // microphone/camera access to web content.
                let configuration = wk_webview.configuration();
                let preferences = configuration.preferences();
                let preferences_obj: &AnyObject = &*preferences;
                let yes: Retained<NSNumber> = NSNumber::numberWithBool(true);
                for key in [
                    "mediaDevicesEnabled",
                    "mediaCaptureEnabled",
                    "mediaStreamEnabled",
                    "peerConnectionEnabled",
                ] {
                    let key_str: Retained<NSString> = NSString::from_str(key);
                    let _: () = msg_send![
                        preferences_obj,
                        setValue: &*yes,
                        forKey: &*key_str,
                    ];
                }
            }
        });
    }
}
