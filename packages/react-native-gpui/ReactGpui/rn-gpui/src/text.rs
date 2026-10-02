//! Paragraph shaping shared by Fabric measurement and GPUI painting.
//!
//! Fabric asks for text measurements from its JS/layout thread. The GPUI
//! `TextSystem` is an `Arc`-shared, synchronized service, so this module shapes
//! there and keeps the paintable result in a bounded cache for the UI thread.

use gpui::{
    canvas, font, point, prelude::*, px, App, ContentMask, Font, FontStyle, FontWeight,
    IntoElement, SharedString, StrikethroughStyle, TextAlign, TextRun, UnderlineStyle, WrappedLine,
};
use rn_gpui_sys::ffi::{MeasureResult, ParagraphFlat, TextFragmentFlat};
use std::{
    collections::HashMap,
    hash::Hash,
    sync::{Arc, Mutex, OnceLock},
};

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct FragmentKey {
    text: String,
    font_family: String,
    font_size: u32,
    font_weight: u16,
    italic: bool,
    color: u32,
    line_height: u32,
    letter_spacing: u32,
    underline: bool,
    strikethrough: bool,
}

impl From<&TextFragmentFlat> for FragmentKey {
    fn from(fragment: &TextFragmentFlat) -> Self {
        Self {
            text: fragment.text.clone(),
            font_family: fragment.font_family.clone(),
            font_size: fragment.font_size.to_bits(),
            font_weight: fragment.font_weight,
            italic: fragment.italic,
            color: fragment.color,
            line_height: fragment.line_height.to_bits(),
            letter_spacing: fragment.letter_spacing.to_bits(),
            underline: fragment.underline,
            strikethrough: fragment.strikethrough,
        }
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct ParagraphKey {
    fragments: Vec<FragmentKey>,
    width: u32,
    max_lines: i32,
    text_align: u8,
    ellipsize: u8,
}

impl ParagraphKey {
    fn new(paragraph: &ParagraphFlat, width: f32) -> Self {
        Self {
            fragments: paragraph.fragments.iter().map(FragmentKey::from).collect(),
            width: width.to_bits(),
            max_lines: paragraph.max_lines,
            text_align: paragraph.text_align,
            ellipsize: paragraph.ellipsize,
        }
    }
}

struct ShapedParagraph {
    lines: Vec<WrappedLine>,
    line_heights: Vec<f32>,
    width: f32,
    height: f32,
    text_align: TextAlign,
}

struct TextService {
    text_system: Arc<gpui::TextSystem>,
    cache: Mutex<HashMap<ParagraphKey, Arc<ShapedParagraph>>>,
}

static TEXT_SERVICE: OnceLock<Arc<TextService>> = OnceLock::new();
const MAX_CACHED_PARAGRAPHS: usize = 256;

fn font_size_of(size: f32) -> f32 {
    if size.is_finite() && size > 0.0 {
        size
    } else {
        14.0
    }
}

fn font_of(fragment: &TextFragmentFlat) -> Font {
    let family = if fragment.font_family.is_empty() {
        ".SystemUIFont"
    } else {
        fragment.font_family.as_str()
    };
    let mut font = font(family);
    font.weight = FontWeight(fragment.font_weight as f32);
    if fragment.italic {
        font.style = FontStyle::Italic;
    }
    font
}

/// Measure the insertion point with the same font shaping GPUI uses to paint
/// the input text, so proportional fonts and Unicode land the caret correctly.
pub(crate) fn input_caret_x(
    text_system: &gpui::WindowTextSystem,
    paragraph: &ParagraphFlat,
    line: &str,
    byte_index: usize,
) -> f32 {
    if line.is_empty() {
        return 0.0;
    }
    let Some(fragment) = paragraph.fragments.first() else {
        return 0.0;
    };
    let font = font_of(fragment);
    let text = SharedString::from(line.to_owned());
    let run = TextRun {
        len: text.len(),
        font,
        color: crate::style::color(fragment.color),
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    f32::from(
        text_system
            .shape_line(text, px(font_size_of(fragment.font_size)), &[run], None)
            .x_for_index(byte_index.min(line.len())),
    )
}

pub(crate) fn input_index_for_x(
    text_system: &gpui::WindowTextSystem,
    paragraph: &ParagraphFlat,
    line: &str,
    x: f32,
) -> usize {
    if line.is_empty() {
        return 0;
    }
    let Some(fragment) = paragraph.fragments.first() else {
        return 0;
    };
    let font = font_of(fragment);
    let text = SharedString::from(line.to_owned());
    let run = TextRun {
        len: text.len(),
        font,
        color: crate::style::color(fragment.color),
        background_color: None,
        underline: None,
        strikethrough: None,
    };
    text_system
        .shape_line(text, px(font_size_of(fragment.font_size)), &[run], None)
        .closest_index_for_x(px(x.max(0.0)))
}

fn make_runs(paragraph: &ParagraphFlat) -> (String, Vec<TextRun>) {
    let mut text = String::new();
    let mut runs = Vec::with_capacity(paragraph.fragments.len());
    for fragment in &paragraph.fragments {
        if fragment.text.is_empty() {
            continue;
        }
        let color = crate::style::color(if fragment.color == 0 {
            0xFF00_0000
        } else {
            fragment.color
        });
        runs.push(TextRun {
            len: fragment.text.len(),
            font: font_of(fragment),
            color,
            background_color: None,
            underline: fragment.underline.then_some(UnderlineStyle {
                thickness: px(1.0),
                color: None,
                wavy: false,
            }),
            strikethrough: fragment.strikethrough.then_some(StrikethroughStyle {
                thickness: px(1.0),
                color: None,
            }),
        });
        text.push_str(&fragment.text);
    }
    (text, runs)
}

fn text_align(value: u8) -> TextAlign {
    match value {
        2 => TextAlign::Center,
        3 | 6 => TextAlign::Right,
        _ => TextAlign::Left,
    }
}

impl TextService {
    fn shape(&self, paragraph: &ParagraphFlat, width: f32) -> Arc<ShapedParagraph> {
        let width = if width.is_finite() && width > 0.0 {
            width
        } else {
            f32::MAX
        };
        let key = ParagraphKey::new(paragraph, width);
        if let Some(shaped) = self.cache.lock().unwrap().get(&key).cloned() {
            return shaped;
        }

        let (mut text, mut runs) = make_runs(paragraph);
        let font_size = paragraph
            .fragments
            .iter()
            .find(|fragment| !fragment.text.is_empty())
            .map(|fragment| font_size_of(fragment.font_size))
            .unwrap_or(14.0);
        let base_font = paragraph
            .fragments
            .iter()
            .find(|fragment| !fragment.text.is_empty())
            .map(font_of)
            .unwrap_or_default();

        if paragraph.max_lines > 0 && !text.is_empty() && width < f32::MAX {
            let mut wrapper = self.text_system.line_wrapper(base_font, px(font_size));
            let truncation = match paragraph.ellipsize {
                1 => Some(gpui::TruncateFrom::Start),
                2 => Some(gpui::TruncateFrom::Middle),
                3 => Some(gpui::TruncateFrom::End), // clipped below to the same line limit
                _ => Some(gpui::TruncateFrom::End),
            };
            if let Some(direction) = truncation {
                let affix = if paragraph.ellipsize == 3 { "" } else { "…" };
                let (truncated, truncated_runs) = wrapper.truncate_wrapped_line(
                    SharedString::from(text),
                    px(width),
                    paragraph.max_lines as usize,
                    affix,
                    &runs,
                    direction,
                );
                text = truncated.to_string();
                runs = truncated_runs.into_owned();
            }
        }

        let window_text_system = gpui::WindowTextSystem::new(self.text_system.clone());
        let shaped_lines = window_text_system
            .shape_text(
                SharedString::from(text),
                px(font_size),
                &runs,
                (width < f32::MAX).then_some(px(width)),
                (paragraph.max_lines > 0).then_some(paragraph.max_lines as usize),
            )
            .unwrap_or_default();

        let explicit_line_height = paragraph
            .fragments
            .iter()
            .map(|fragment| fragment.line_height)
            .find(|height| height.is_finite() && *height > 0.0);
        let mut lines = Vec::with_capacity(shaped_lines.len());
        let mut line_heights = Vec::with_capacity(shaped_lines.len());
        let mut measured_width = 0.0f32;
        let mut measured_height = 0.0f32;
        for line in shaped_lines {
            let line_height = explicit_line_height
                .unwrap_or_else(|| f32::from(line.ascent() + line.descent()).max(1.0));
            let visual_lines = line.wrap_boundaries.len() + 1;
            measured_width = measured_width.max(f32::from(line.width()));
            measured_height += line_height * visual_lines as f32;
            lines.push(line);
            line_heights.push(line_height);
        }

        let shaped = Arc::new(ShapedParagraph {
            lines,
            line_heights,
            width: measured_width.min(width),
            height: measured_height,
            text_align: text_align(paragraph.text_align),
        });
        let mut cache = self.cache.lock().unwrap();
        if cache.len() >= MAX_CACHED_PARAGRAPHS {
            cache.clear();
        }
        cache.insert(key, shaped.clone());
        shaped
    }
}

/// Install the synchronized shaper before creating a React surface.
pub fn install_measure_handler(cx: &mut App) {
    let service = Arc::new(TextService {
        text_system: cx.text_system().clone(),
        cache: Mutex::new(HashMap::new()),
    });
    let _ = TEXT_SERVICE.set(service.clone());
    let _ = rn_gpui_sys::MEASURE_HANDLER.set(Box::new(move |paragraph, width, _height| {
        let shaped = service.shape(paragraph, width);
        MeasureResult {
            width: shaped.width.ceil(),
            height: shaped.height.ceil(),
        }
    }));
}

/// Paint the lines produced by the same cached GPUI layout used during Yoga measurement.
pub fn paragraph_element(paragraph: &ParagraphFlat, width: f32, height: f32) -> impl IntoElement {
    let shaped = TEXT_SERVICE
        .get()
        .map(|service| service.shape(paragraph, width))
        .unwrap_or_else(|| {
            Arc::new(ShapedParagraph {
                lines: Vec::new(),
                line_heights: Vec::new(),
                width,
                height,
                text_align: text_align(paragraph.text_align),
            })
        });
    let align = shaped.text_align;
    log::debug!(
        "[text] cached shape: {:.1}x{:.1} at width {:.1}; mounted {:.1}x{:.1}; {} hard lines",
        shaped.width,
        shaped.height,
        width,
        width,
        height,
        shaped.lines.len()
    );
    canvas(
        |_, _, _| (),
        move |bounds, (), window, cx| {
            let mut y = bounds.origin.y;
            window.with_content_mask(Some(ContentMask { bounds }), |window| {
                for (line, line_height) in shaped.lines.iter().zip(&shaped.line_heights) {
                    if line
                        .paint(
                            point(bounds.origin.x, y),
                            px(*line_height),
                            align,
                            Some(bounds),
                            window,
                            cx,
                        )
                        .is_err()
                    {
                        log::error!("failed to paint a shaped React Native text line");
                    }
                    y += px(*line_height * (line.wrap_boundaries.len() + 1) as f32);
                }
            });
        },
    )
    .w(px(width.max(0.0)))
    .h(px(height.max(0.0)))
}
