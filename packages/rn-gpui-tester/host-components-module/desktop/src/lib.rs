//! The tester's host component fixtures.

rn_gpui_module::include_specs!();

use std::rc::Rc;

use gpui::{div, point, prelude::*, px, rgb, AnyElement, PathBuilder, Window};
use react_native_gpui::host_component::register_component;

/// The chart's points, normalised to the box they are drawn in.
type Series = Rc<[(f32, f32)]>;

fn series_of(points: &[FixtureChartPoints]) -> Series {
    points
        .iter()
        .map(|point| (point.x as f32, point.y as f32))
        .collect::<Vec<_>>()
        .into()
}

/// The event a point reports: its index and its own coordinates.
fn point_event(series: &[(f32, f32)], index: usize) -> OnPointSelected {
    let (x, y) = series.get(index).copied().unwrap_or((0.0, 0.0));
    OnPointSelected {
        index: index as i32,
        x: f64::from(x),
        y: f64::from(y),
    }
}

/// A GPUI-element host component: a line chart.
struct Chart {
    series: Series,
    /// The token this chart last reported for, so a `reportToken` change
    /// reports once rather than on every frame.
    reported_token: i32,
    /// The point a command last selected, drawn as a marker.
    selected: Option<usize>,
}

impl FixtureChartSpec for Chart {
    fn create(props: &FixtureChartProps, _cx: &mut FixtureChartContext) -> Self {
        Self {
            series: series_of(props.points()),
            reported_token: props.report_token(),
            selected: None,
        }
    }

    fn update(
        &mut self,
        props: &FixtureChartProps,
        changed: FixtureChartChanged,
        cx: &mut FixtureChartContext,
    ) {
        if changed.points() {
            self.series = series_of(props.points());
        }
        if changed.report_token() && props.report_token() != self.reported_token {
            self.reported_token = props.report_token();
            cx.events().point_selected(point_event(&self.series, 0));
        }
    }

    fn render(
        &mut self,
        props: &FixtureChartProps,
        _window: &mut Window,
        _cx: &mut FixtureChartContext,
    ) -> AnyElement {
        let series = self.series.clone();
        let selected = self.selected;
        let color = props.line_color() as u32 & 0x00ff_ffff;
        let title = props.title().to_string();
        div()
            .size_full()
            .relative()
            .bg(rgb(0x0f172a))
            .child(
                gpui::canvas(
                    move |bounds, _window, _cx| (bounds, series.clone()),
                    move |_bounds, (bounds, series), window, _cx| {
                        let width = f32::from(bounds.size.width);
                        let height = f32::from(bounds.size.height);
                        if series.is_empty() || width <= 0.0 || height <= 0.0 {
                            return;
                        }
                        let fold =
                            |pick: fn(&(f32, f32)) -> f32| {
                                series.iter().map(pick).fold(
                                    (f32::INFINITY, f32::NEG_INFINITY),
                                    |(low, high), value| (low.min(value), high.max(value)),
                                )
                            };
                        let (min_x, max_x) = fold(|point| point.0);
                        let (min_y, max_y) = fold(|point| point.1);
                        let x_range = (max_x - min_x).max(1.0);
                        let y_range = (max_y - min_y).max(1.0);
                        let to_window = |&(x, y): &(f32, f32)| {
                            point(
                                bounds.origin.x + px((x - min_x) / x_range * width),
                                bounds.origin.y + px((1.0 - (y - min_y) / y_range) * height),
                            )
                        };
                        let mut builder = PathBuilder::stroke(px(2.0));
                        for (index, entry) in series.iter().enumerate() {
                            let at = to_window(entry);
                            if index == 0 {
                                builder.move_to(at);
                            } else {
                                builder.line_to(at);
                            }
                        }
                        if let Ok(path) = builder.build() {
                            window.paint_path(path, rgb(color));
                        }
                        if let Some(entry) = selected.and_then(|index| series.get(index)) {
                            let at = to_window(entry);
                            let marker = gpui::Bounds {
                                origin: point(at.x - px(4.0), at.y - px(4.0)),
                                size: gpui::size(px(8.0), px(8.0)),
                            };
                            window.paint_quad(gpui::fill(marker, rgb(0xffffff)));
                        }
                    },
                )
                .size_full(),
            )
            .when(!title.is_empty(), |element| {
                element.child(
                    div()
                        .absolute()
                        .top_1()
                        .left_1()
                        .text_color(rgb(0xe2e8f0))
                        .text_size(px(11.0))
                        .child(title),
                )
            })
            .into_any_element()
    }

    fn select_point(&mut self, index: i32, cx: &mut FixtureChartContext) {
        if index < 0 || index as usize >= self.series.len() {
            return;
        }
        self.selected = Some(index as usize);
        cx.events()
            .point_selected(point_event(&self.series, index as usize));
    }

    fn report_series(&mut self, cx: &mut FixtureChartContext) {
        let index = self.selected.unwrap_or(0);
        cx.events().point_selected(point_event(&self.series, index));
    }
}

/// The size a measured label wants: its text at a fixed character width, on one
/// line. Fixed so a test can compute exactly what Yoga should lay out around.
fn measured_size(text: &str, character_width: f64, line_height: f64) -> (f32, f32) {
    (
        (text.chars().count() as f64 * character_width) as f32,
        line_height as f32,
    )
}

/// A measured host component: a label whose size comes from its text.
struct MeasuredLabel {
    size: (f32, f32),
}

impl MeasuredLabel {
    fn measure(props: &FixtureMeasuredLabelProps) -> (f32, f32) {
        measured_size(props.text(), props.character_width(), props.line_height())
    }
}

impl FixtureMeasuredLabelSpec for MeasuredLabel {
    fn create(props: &FixtureMeasuredLabelProps, cx: &mut FixtureMeasuredLabelContext) -> Self {
        let size = Self::measure(props);
        cx.set_intrinsic_size(size.0, size.1);
        Self { size }
    }

    fn update(
        &mut self,
        props: &FixtureMeasuredLabelProps,
        _changed: FixtureMeasuredLabelChanged,
        cx: &mut FixtureMeasuredLabelContext,
    ) {
        let size = Self::measure(props);
        if size != self.size {
            self.size = size;
            cx.set_intrinsic_size(size.0, size.1);
        }
    }

    fn render(
        &mut self,
        props: &FixtureMeasuredLabelProps,
        _window: &mut Window,
        _cx: &mut FixtureMeasuredLabelContext,
    ) -> AnyElement {
        div()
            .size_full()
            .flex()
            .items_center()
            .bg(rgb(0x334155))
            .text_color(rgb(0xf8fafc))
            .text_size(px(12.0))
            .child(props.text().to_string())
            .into_any_element()
    }
}

/// The room a card's chrome takes: a title strip above the children and a border
/// on the other three sides.
fn card_insets(chrome_height: f64, chrome_width: f64) -> (f32, f32, f32, f32) {
    let (top, side) = (chrome_height as f32, chrome_width as f32);
    (top, side, side, side)
}

/// A container host component: chrome drawn around React children.
struct Card;

impl Card {
    fn report_insets(props: &FixtureCardProps, cx: &mut FixtureCardContext) {
        let (top, right, bottom, left) = card_insets(props.chrome_height(), props.chrome_width());
        cx.set_insets(top, right, bottom, left);
    }
}

impl FixtureCardSpec for Card {
    fn create(props: &FixtureCardProps, cx: &mut FixtureCardContext) -> Self {
        Self::report_insets(props, cx);
        Self
    }

    fn update(
        &mut self,
        props: &FixtureCardProps,
        changed: FixtureCardChanged,
        cx: &mut FixtureCardContext,
    ) {
        if changed.chrome_height() || changed.chrome_width() {
            Self::report_insets(props, cx);
        }
    }

    fn render(
        &mut self,
        props: &FixtureCardProps,
        _window: &mut Window,
        _cx: &mut FixtureCardContext,
    ) -> AnyElement {
        let title = props.title().to_string();
        let height = props.chrome_height() as f32;
        let side = props.chrome_width() as f32;
        div()
            .size_full()
            .relative()
            .bg(rgb(0x1e293b))
            .when(!title.is_empty(), |element| {
                element.child(
                    div()
                        .absolute()
                        .top_0()
                        .left_0()
                        .w_full()
                        .h(px(height))
                        .flex()
                        .items_center()
                        .pl(px(side))
                        .bg(rgb(0x475569))
                        .text_color(rgb(0xf1f5f9))
                        .text_size(px(12.0))
                        .child(title),
                )
            })
            .into_any_element()
    }
}

/// Registers the fixtures. Autolink calls this through the crate's
/// `rn_gpui_register()`, exactly like a published package.
pub fn rn_gpui_register() {
    register_component(fixture_chart_component::<Chart>());
    register_component(fixture_measured_label_component::<MeasuredLabel>());
    register_component(fixture_card_component::<Card>());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_point_event_carries_the_points_own_coordinates() {
        let series = [(0.0, 1.0), (2.0, 4.0)];
        let event = point_event(&series, 1);
        assert_eq!(event.index, 1);
        assert_eq!((event.x, event.y), (2.0, 4.0));
    }

    #[test]
    fn a_point_event_for_a_missing_point_is_the_origin() {
        let event = point_event(&[], 3);
        assert_eq!((event.index, event.x, event.y), (3, 0.0, 0.0));
    }

    #[test]
    fn a_measured_label_needs_its_text_at_the_character_width() {
        assert_eq!(measured_size("abcd", 10.0, 20.0), (40.0, 20.0));
        assert_eq!(measured_size("é", 8.0, 20.0), (8.0, 20.0));
        assert_eq!(measured_size("", 8.0, 20.0), (0.0, 20.0));
    }

    #[test]
    fn a_card_clears_its_title_strip_and_borders_its_other_sides() {
        assert_eq!(card_insets(28.0, 12.0), (28.0, 12.0, 12.0, 12.0));
        assert_eq!(card_insets(0.0, 0.0), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn the_series_keeps_every_point_in_order() {
        let points = [
            FixtureChartPoints { x: 0.0, y: 1.0 },
            FixtureChartPoints { x: 1.0, y: 3.0 },
        ];
        assert_eq!(&*series_of(&points), &[(0.0, 1.0), (1.0, 3.0)]);
    }
}
