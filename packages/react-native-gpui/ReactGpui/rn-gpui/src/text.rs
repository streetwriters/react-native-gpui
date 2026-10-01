//! Phase-1 text: approximate measurement and GPUI paint (design doc §18.14,
//! TODO 1.11).
//!
//! Measurement is called by C++ `TextLayoutManager::measure` on the Fabric/JS
//! thread, so the handler is pure arithmetic: it must not touch GPUI (design
//! doc §18.0). TODO 2.8 replaces the approximation with GPUI's own shaper so
//! that measurement and paint agree exactly.

use crate::style;
use gpui::{div, font, prelude::*, px, App, Font, FontWeight, IntoElement, SharedString};
use gpui::{StyledText, TextRun};
use rn_gpui_sys::ffi::{MeasureResult, ParagraphFlat};
use std::sync::Arc;

/// Approximate advance width per character, as a fraction of the font size.
/// Good enough for Yoga in Phase 1; TODO 2.8 removes it.
const CHAR_WIDTH_RATIO: f32 = 0.55;

fn font_size_of(fragment_size: f32) -> f32 {
    if fragment_size > 0. {
        fragment_size
    } else {
        14.
    }
}

/// Installs the measure handler. Called once, on the GPUI main thread, before
/// any surface starts.
pub fn install_measure_handler(cx: &mut App) {
    let text_system: Arc<gpui::TextSystem> = cx.text_system().clone();
    let _ = rn_gpui_sys::MEASURE_HANDLER.set(Box::new(
        move |p: &ParagraphFlat, max_width: f32, _max_height: f32| {
            let _ = &text_system; // used by TODO 2.8
            let mut width = 0f32;
            let mut height = 0f32;
            for fragment in &p.fragments {
                let size = font_size_of(fragment.font_size);
                let line_height = if fragment.line_height > 0. {
                    fragment.line_height
                } else {
                    size * 1.2
                };
                let text_width = fragment.text.chars().count() as f32 * size * CHAR_WIDTH_RATIO;
                let lines = if max_width.is_finite() && max_width > 0. {
                    (text_width / max_width).ceil().max(1.)
                } else {
                    1.
                };
                width = width.max(if max_width.is_finite() {
                    text_width.min(max_width)
                } else {
                    text_width
                });
                height += lines * line_height;
            }
            MeasureResult {
                width: width.ceil(),
                height: height.ceil(),
            }
        },
    ));
}

/// Phase-1 paint: one `StyledText` per paragraph, constrained to the Yoga
/// width. Runs tile the text exactly (GPUI panics otherwise in debug builds).
pub fn paragraph_element(p: &ParagraphFlat, width: f32) -> impl IntoElement {
    let mut text = String::new();
    let mut runs = Vec::new();
    for fragment in &p.fragments {
        let family = if fragment.font_family.is_empty() {
            ".SystemUIFont"
        } else {
            fragment.font_family.as_str()
        };
        let mut run_font: Font = font(family);
        run_font.weight = FontWeight(fragment.font_weight as f32);
        runs.push(TextRun {
            // `TextRun::len` counts utf8 bytes, not chars.
            len: fragment.text.len(),
            font: run_font,
            color: style::color(if fragment.color == 0 {
                0xFF00_0000
            } else {
                fragment.color
            }),
            background_color: None,
            underline: None,
            strikethrough: None,
        });
        text.push_str(&fragment.text);
    }

    let size = p
        .fragments
        .first()
        .map(|fragment| font_size_of(fragment.font_size))
        .unwrap_or(14.);

    let mut element = div().w(px(width)).text_size(px(size));
    if !text.is_empty() {
        element = element.child(StyledText::new(SharedString::from(text)).with_runs(runs));
    }
    element
}
