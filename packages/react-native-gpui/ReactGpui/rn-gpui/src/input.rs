//! TextInput's bridge to GPUI's platform text-input session (including IME).

use crate::node_view::RNNodeView;
use crate::store::store_from;
use gpui::{
    Bounds, Context, EntityInputHandler, Pixels, Point, TextInputConfiguration, UTF16Selection,
    Window,
};
use std::ops::Range;

pub(crate) fn byte_at_utf16(text: &str, offset: usize) -> usize {
    let mut units = 0;
    for (byte, ch) in text.char_indices() {
        if units >= offset {
            return byte;
        }
        let next = units + ch.len_utf16();
        if next > offset {
            return byte;
        }
        units = next;
    }
    text.len()
}

fn utf16_at_byte(text: &str, offset: usize) -> usize {
    let offset = offset.min(text.len());
    text.char_indices()
        .take_while(|(byte, _)| *byte < offset)
        .map(|(_, ch)| ch.len_utf16())
        .sum()
}

fn byte_range(text: &str, range: Range<usize>) -> Range<usize> {
    let start = byte_at_utf16(text, range.start);
    let end = byte_at_utf16(text, range.end.max(range.start));
    start..end.max(start)
}

pub(crate) fn reconcile_selection(
    text: &str,
    current: Range<usize>,
    explicit_utf16: Option<Range<usize>>,
    initialize: bool,
) -> Range<usize> {
    if let Some(selection) = explicit_utf16 {
        byte_range(text, selection)
    } else if initialize {
        text.len()..text.len()
    } else {
        current.start.min(text.len())..current.end.min(text.len())
    }
}

pub(crate) fn should_apply_text_update(native_event_count: i32, props_event_count: i32) -> bool {
    props_event_count >= native_event_count
}

fn utf16_range(text: &str, range: Range<usize>) -> Range<usize> {
    utf16_at_byte(text, range.start)..utf16_at_byte(text, range.end)
}

fn selected_range(this: &RNNodeView) -> Range<usize> {
    this.input_selection.start.min(this.input_text.len())
        ..this.input_selection.end.min(this.input_text.len())
}

fn replacement_range(
    text: &str,
    selection: &Range<usize>,
    marked: &mut Option<Range<usize>>,
    range_utf16: Option<Range<usize>>,
) -> Range<usize> {
    range_utf16
        .map(|range| byte_range(text, range))
        .or_else(|| marked.take())
        .unwrap_or_else(|| selection.clone())
}

fn replace_plain_text(
    text: &mut String,
    selection: &mut Range<usize>,
    marked: &mut Option<Range<usize>>,
    range_utf16: Option<Range<usize>>,
    inserted: &str,
) {
    let range = replacement_range(text, selection, marked, range_utf16);
    text.replace_range(range.clone(), inserted);
    let cursor = range.start + inserted.len();
    *selection = cursor..cursor;
    *marked = None;
}

fn replace_marked_text(
    text: &mut String,
    selection: &mut Range<usize>,
    marked: &mut Option<Range<usize>>,
    range_utf16: Option<Range<usize>>,
    inserted: &str,
    selected_range_utf16: Option<Range<usize>>,
) {
    let range = replacement_range(text, selection, marked, range_utf16);
    text.replace_range(range.clone(), inserted);
    let composing = range.start..range.start + inserted.len();
    *marked = (!inserted.is_empty()).then_some(composing.clone());
    *selection = selected_range_utf16
        .map(|selected| {
            let selected = byte_range(inserted, selected);
            range.start + selected.start..range.start + selected.end
        })
        .unwrap_or(composing.end..composing.end);
}

fn clear_text_state(
    text: &mut String,
    selection: &mut Range<usize>,
    marked: &mut Option<Range<usize>>,
) -> bool {
    if text.is_empty() {
        return false;
    }
    text.clear();
    *selection = 0..0;
    *marked = None;
    true
}

fn emit_change(this: &mut RNNodeView, window: &mut Window, cx: &mut Context<RNNodeView>) {
    this.input_event_count += 1;
    let text = this.input_text.clone();
    let selection = utf16_range(&text, selected_range(this));
    if let Some(store) = store_from(cx) {
        let host = store.read(cx).host.clone();
        host.dispatch_event(
            this.tag,
            "topChange",
            &serde_json::json!({
                "text": text,
                "eventCount": this.input_event_count,
            }),
        );
        host.dispatch_event(
            this.tag,
            "topSelectionChange",
            &serde_json::json!({"selection": {"start": selection.start, "end": selection.end}}),
        );
        store.read(cx).frame_hook.arm(window);
    }
    cx.notify();
}

fn emit_selection(this: &RNNodeView, window: &mut Window, cx: &mut Context<RNNodeView>) {
    let selection = utf16_range(&this.input_text, selected_range(this));
    if let Some(store) = store_from(cx) {
        let host = store.read(cx).host.clone();
        host.dispatch_event(
            this.tag,
            "topSelectionChange",
            &serde_json::json!({"selection": {"start": selection.start, "end": selection.end}}),
        );
        store.read(cx).frame_hook.arm(window);
    }
    cx.notify();
}

pub fn clear_text_input(this: &mut RNNodeView, window: &mut Window, cx: &mut Context<RNNodeView>) {
    if this.component != "TextInput"
        || !clear_text_state(
            &mut this.input_text,
            &mut this.input_selection,
            &mut this.input_marked,
        )
    {
        return;
    }
    this.sync_input_paragraph();
    emit_change(this, window, cx);
}

impl EntityInputHandler for RNNodeView {
    fn text_for_range(
        &mut self,
        range_utf16: Range<usize>,
        actual_range: &mut Option<Range<usize>>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<String> {
        let range = byte_range(&self.input_text, range_utf16);
        *actual_range = Some(utf16_range(&self.input_text, range.clone()));
        Some(self.input_text[range].to_owned())
    }

    fn selected_text_range(
        &mut self,
        _ignore_disabled_input: bool,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: utf16_range(&self.input_text, selected_range(self)),
            reversed: false,
        })
    }

    fn marked_text_range(
        &self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Range<usize>> {
        self.input_marked
            .as_ref()
            .map(|range| utf16_range(&self.input_text, range.clone()))
    }

    fn unmark_text(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        self.input_marked = None;
        cx.notify();
    }

    fn replace_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        text: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.input_editable {
            return;
        }
        if !self.input_multiline && (text.contains('\n') || text.contains('\r')) {
            if let Some(store) = store_from(cx) {
                let host = store.read(cx).host.clone();
                host.dispatch_event(
                    self.tag,
                    "topSubmitEditing",
                    &serde_json::json!({
                        "text": self.input_text,
                        "eventCount": self.input_event_count,
                    }),
                );
            }
            return;
        }
        replace_plain_text(
            &mut self.input_text,
            &mut self.input_selection,
            &mut self.input_marked,
            range_utf16,
            text,
        );
        self.sync_input_paragraph();
        emit_change(self, window, cx);
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        new_selected_range_utf16: Option<Range<usize>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.input_editable {
            return;
        }
        replace_marked_text(
            &mut self.input_text,
            &mut self.input_selection,
            &mut self.input_marked,
            range_utf16,
            new_text,
            new_selected_range_utf16,
        );
        self.sync_input_paragraph();
        emit_change(self, window, cx);
    }

    fn bounds_for_range(
        &mut self,
        range_utf16: Range<usize>,
        element_bounds: Bounds<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        // GPUI's IME needs a stable rectangle for the active input. Text shaping
        // supplies finer glyph bounds in the renderer; until then the input
        // surface is the conservative composition rectangle.
        let _ = range_utf16;
        Some(element_bounds)
    }

    fn character_index_for_point(
        &mut self,
        point: Point<Pixels>,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<usize> {
        let origin = self.absolute_origin(cx);
        let (scale_x, scale_y) = self.cumulative_scale(cx);
        let font_size = self
            .paragraph
            .as_ref()
            .and_then(|paragraph| paragraph.fragments.first())
            .map(|fragment| fragment.font_size.max(14.0))
            .unwrap_or(14.0);
        let line_height = self
            .paragraph
            .as_ref()
            .and_then(|paragraph| paragraph.fragments.first())
            .map(|fragment| {
                if fragment.line_height > 0.0 {
                    fragment.line_height
                } else {
                    font_size * 1.2
                }
            })
            .unwrap_or(font_size * 1.2);
        let local_x = (f32::from(point.x - origin.x) / scale_x.max(0.0001) - 4.0).max(0.0);
        let local_y = (f32::from(point.y - origin.y) / scale_y.max(0.0001)).max(0.0);
        let target_line = if self.input_multiline {
            (local_y / line_height.max(1.0)).floor() as usize
        } else {
            0
        };
        let mut byte_start = 0;
        let mut line_text = self.input_text.as_str();
        if self.input_multiline {
            for (index, line) in self.input_text.split_inclusive('\n').enumerate() {
                if index == target_line {
                    line_text = line.trim_end_matches('\n');
                    break;
                }
                byte_start += line.len();
                line_text = "";
            }
        }
        let column = (local_x / (font_size * 0.5).max(1.0)).round() as usize;
        let byte_in_line = line_text
            .char_indices()
            .nth(column)
            .map(|(byte, _)| byte)
            .unwrap_or(line_text.len());
        Some(utf16_at_byte(&self.input_text, byte_start + byte_in_line))
    }

    fn set_selected_text_range(
        &mut self,
        range_utf16: Range<usize>,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.input_selection = byte_range(&self.input_text, range_utf16);
        emit_selection(self, _window, cx);
    }

    fn text_length_utf16(
        &mut self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<usize> {
        Some(self.input_text.encode_utf16().count())
    }

    fn accepts_text_input(&self, _window: &mut Window, _cx: &mut Context<Self>) -> bool {
        self.input_editable
    }

    fn text_input_configuration(
        &mut self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> TextInputConfiguration {
        TextInputConfiguration::default()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        byte_at_utf16, clear_text_state, reconcile_selection, replace_marked_text,
        replace_plain_text, should_apply_text_update, utf16_at_byte,
    };

    #[test]
    fn utf16_offsets_round_trip_as_unicode_scalar_boundaries() {
        let text = "a😀é";
        for offset in [0, 1, 3, 4] {
            let byte = byte_at_utf16(text, offset);
            assert_eq!(utf16_at_byte(text, byte), offset);
        }
        // A UTF-16 position inside a surrogate pair clamps to the scalar start.
        assert_eq!(byte_at_utf16(text, 2), 1);
    }

    #[test]
    fn plain_replacement_handles_a_selected_surrogate_pair() {
        let mut text = "A😀Z".to_owned();
        let mut selection = 1..5;
        let mut marked = None;

        replace_plain_text(&mut text, &mut selection, &mut marked, Some(1..3), "é");

        assert_eq!(text, "AéZ");
        assert_eq!(selection, 3..3);
        assert_eq!(marked, None);
    }

    #[test]
    fn marked_composition_replaces_its_previous_marked_text() {
        let mut text = "Hi ".to_owned();
        let mut selection = 3..3;
        let mut marked = None;

        replace_marked_text(&mut text, &mut selection, &mut marked, None, "k", None);
        assert_eq!(text, "Hi k");
        assert_eq!(marked, Some(3..4));

        replace_marked_text(
            &mut text,
            &mut selection,
            &mut marked,
            None,
            "か",
            Some(1..1),
        );
        assert_eq!(text, "Hi か");
        assert_eq!(marked, Some(3..6));
        assert_eq!(selection, 6..6);

        replace_plain_text(&mut text, &mut selection, &mut marked, None, "");
        assert_eq!(text, "Hi ");
        assert_eq!(marked, None);
    }

    #[test]
    fn prop_updates_preserve_internal_selection_unless_rn_sets_one() {
        let middle = 1..1;
        assert_eq!(
            reconcile_selection("hello", middle.clone(), None, false),
            middle
        );
        assert_eq!(reconcile_selection("hello", 4..4, Some(1..3), false), 1..3);
        assert_eq!(reconcile_selection("hello", 0..0, None, true), 5..5);
        assert_eq!(reconcile_selection("hi", 4..4, None, false), 2..2);
    }

    #[test]
    fn stale_props_do_not_replace_text_after_a_newer_native_edit() {
        assert!(!should_apply_text_update(3, 2));
        assert!(should_apply_text_update(3, 3));
        assert!(should_apply_text_update(3, 4));
    }

    #[test]
    fn clear_command_resets_text_selection_and_composition() {
        let mut text = "A😀".to_owned();
        let mut selection = 1..5;
        let mut marked = Some(1..5);
        assert!(clear_text_state(&mut text, &mut selection, &mut marked));
        assert_eq!(text, "");
        assert_eq!(selection, 0..0);
        assert_eq!(marked, None);
        assert!(!clear_text_state(&mut text, &mut selection, &mut marked));
    }
}
