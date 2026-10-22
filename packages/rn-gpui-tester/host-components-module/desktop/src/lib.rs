//! The tester's host component fixtures.
//!
//! One component of each kind the design describes:
//!
//! * `FixtureChart` is a GPUI-element component: a small line chart drawn with
//!   GPUI paths, sized by its React style, with props, one event and two
//!   commands. It is what proves a package can render its own content inside a
//!   React Native tree with no generated C++ at all.
//! * `FixtureMeasuredLabel` measures itself and reports the size through Fabric
//!   state, so its parent lays out around it one commit later.
//! * `FixtureCard` is a container: it draws chrome around React children and
//!   reports the room that chrome takes, so the children land inside it.
//!
//! All three are registered from `rn_gpui_register()`, the same hook a module
//! uses, and all three are declared in `react-native.config.js` so autolink
//! checks the declaration and the registration agree.

use gpui::{
    div, point, prelude::*, px, rgb, AnyElement, App, PathBuilder, Window,
};
use react_native_gpui::host_component::{
    register_host_component_without_app, Children, HostComponent, HostComponentOptions,
    HostContext, Props,
};
use serde_json::{json, Value};

/// The chart's props, read once per props change rather than per frame.
#[derive(Clone, Debug, Default)]
struct ChartProps {
    points: Vec<(f32, f32)>,
    title: String,
    line_color: u32,
    report_token: i32,
}

impl ChartProps {
    fn from_props(props: &Props) -> Self {
        Self {
            points: props
                .array("points")
                .iter()
                .filter_map(|value| {
                    let x = value.get("x")?.as_f64()? as f32;
                    let y = value.get("y")?.as_f64()? as f32;
                    Some((x, y))
                })
                .collect(),
            title: props.string("title").unwrap_or_default().to_string(),
            // RN delivers an `Int32` colour as a signed number when its top bit
            // is set (0xFF2563EB arrives as -14,254,101), so it is reinterpreted
            // rather than saturated: `as u32` on the f64 would clamp it to 0.
            line_color: props
                .number("lineColor")
                .map(|value| value as i64 as u32)
                .unwrap_or(0xff2563eb),
            report_token: props.number("reportToken").unwrap_or(0.0) as i32,
        }
    }
}

/// A GPUI-element host component: a line chart.
struct FixtureChart {
    props: ChartProps,
    /// The token this chart last reported for, so a `reportToken` change
    /// reports once rather than on every frame.
    reported_token: i32,
    /// The point a tap last selected, drawn as a marker.
    selected: Option<usize>,
}

impl HostComponent for FixtureChart {
    fn create(props: Props, _cx: &mut HostContext) -> Self {
        let props = ChartProps::from_props(&props);
        Self {
            reported_token: props.report_token,
            props,
            selected: None,
        }
    }

    fn update(&mut self, props: Props, cx: &mut HostContext) {
        let next = ChartProps::from_props(&props);
        // A prop change is what reports the series: the fixture's way of proving
        // an event reaches JS from a Rust component.
        if next.report_token != self.reported_token {
            self.reported_token = next.report_token;
            cx.emit("pointSelected", self.event_payload(0));
        }
        self.props = next;
    }

    fn render(
        &mut self,
        _children: Children,
        _window: &mut Window,
        _cx: &mut HostContext,
    ) -> AnyElement {
        // The node's frame is the chart's box; drawing in the unit square keeps
        // the fixture independent of its size.
        let color = self.props.line_color;
        let selected = self.selected;
        let points: Vec<(f32, f32)> = self.props.points.clone();
        let title = self.props.title.clone();
        div()
            .size_full()
            .relative()
            .bg(rgb(0x0f172a))
            .child(
                gpui::canvas(
                    move |bounds, _window, _cx| (bounds, points.clone()),
                    move |_bounds, (bounds, points), window, _cx| {
                        let width = f32::from(bounds.size.width);
                        let height = f32::from(bounds.size.height);
                        if points.is_empty() || width <= 0.0 || height <= 0.0 {
                            return;
                        }
                        // X is the point's own coordinate, Y is normalised
                        // against the series' range, so the fixture draws
                        // whatever a test passes without a scale prop.
                        let min_y = points
                            .iter()
                            .map(|(_, y)| *y)
                            .fold(f32::INFINITY, f32::min);
                        let max_y = points
                            .iter()
                            .map(|(_, y)| *y)
                            .fold(f32::NEG_INFINITY, f32::max);
                        let range = (max_y - min_y).max(1.0);
                        let min_x = points
                            .iter()
                            .map(|(x, _)| *x)
                            .fold(f32::INFINITY, f32::min);
                        let max_x = points
                            .iter()
                            .map(|(x, _)| *x)
                            .fold(f32::NEG_INFINITY, f32::max);
                        let x_range = (max_x - min_x).max(1.0);
                        let to_window = |(x, y): (f32, f32)| {
                            let fx = (x - min_x) / x_range;
                            let fy = (y - min_y) / range;
                            point(
                                bounds.origin.x + px(fx * width),
                                bounds.origin.y + px((1.0 - fy) * height),
                            )
                        };
                        let mut builder = PathBuilder::stroke(px(2.0));
                        for (index, entry) in points.iter().enumerate() {
                            let at = to_window(*entry);
                            if index == 0 {
                                builder.move_to(at);
                            } else {
                                builder.line_to(at);
                            }
                        }
                        if let Ok(path) = builder.build() {
                            window.paint_path(path, rgb(color));
                        }
                        if let Some(index) = selected {
                            if let Some(entry) = points.get(index) {
                                let at = to_window(*entry);
                                let marker = gpui::Bounds {
                                    origin: point(at.x - px(4.0), at.y - px(4.0)),
                                    size: gpui::size(px(8.0), px(8.0)),
                                };
                                window.paint_quad(gpui::fill(marker, rgb(0xffffff)));
                            }
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

    fn command(&mut self, name: &str, args: Vec<Value>, cx: &mut HostContext) {
        match name {
            "selectPoint" => {
                let index = args.first().and_then(Value::as_i64).unwrap_or(-1);
                if index < 0 || index as usize >= self.props.points.len() {
                    log::warn!("[fixture-chart] selectPoint {index} is out of range");
                    return;
                }
                self.selected = Some(index as usize);
                // A command that changes what the component draws notifies
                // through an event, because a host component has no entity to
                // notify; the event is what makes the app re-render if it cares.
                cx.emit("pointSelected", self.event_payload(index as usize));
            }
            "reportSeries" => {
                cx.emit("pointSelected", self.event_payload(self.selected.unwrap_or(0)));
            }
            other => log::warn!("[fixture-chart] unknown command {other}"),
        }
    }
}

impl FixtureChart {
    fn event_payload(&self, index: usize) -> Value {
        let (x, y) = self.props.points.get(index).copied().unwrap_or((0.0, 0.0));
        json!({ "index": index as i32, "x": x, "y": y })
    }
}

/// A measured host component: a label whose size comes from its text.
struct FixtureMeasuredLabel {
    text: String,
    character_width: f32,
    line_height: f32,
}

impl FixtureMeasuredLabel {
    fn size(&self) -> (f32, f32) {
        (
            self.text.chars().count() as f32 * self.character_width,
            self.line_height,
        )
    }
}

impl HostComponent for FixtureMeasuredLabel {
    fn create(props: Props, cx: &mut HostContext) -> Self {
        let label = Self::from_props(&props);
        // The design's one-frame rule: report now so Yoga has a size on the
        // next commit, and give a sensible size in this one.
        let (width, height) = label.size();
        cx.set_intrinsic_size(width, height);
        label
    }

    fn update(&mut self, props: Props, cx: &mut HostContext) {
        let next = Self::from_props(&props);
        let before = self.size();
        *self = next;
        let after = self.size();
        if after != before {
            cx.set_intrinsic_size(after.0, after.1);
        }
    }

    fn render(
        &mut self,
        _children: Children,
        _window: &mut Window,
        _cx: &mut HostContext,
    ) -> AnyElement {
        div()
            .size_full()
            .flex()
            .items_center()
            .bg(rgb(0x334155))
            .text_color(rgb(0xf8fafc))
            .text_size(px(12.0))
            .child(self.text.clone())
            .into_any_element()
    }
}

impl FixtureMeasuredLabel {
    fn from_props(props: &Props) -> Self {
        Self {
            text: props.string("text").unwrap_or_default().to_string(),
            character_width: props.number("characterWidth").unwrap_or(8.0),
            line_height: props.number("lineHeight").unwrap_or(20.0),
        }
    }
}

/// A container host component: a card drawn around React children.
///
/// Its chrome is a title strip above and a border around the children, and it
/// reports the room that chrome takes so the children are laid out inside what
/// is left (design 2, section 6.1). The insets are fixed, and the props can
/// change them, so a test can compute exactly where a child should land.
struct FixtureCard {
    title: String,
    chrome_height: f32,
    chrome_width: f32,
}

impl HostComponent for FixtureCard {
    fn create(props: Props, cx: &mut HostContext) -> Self {
        let card = Self::from_props(&props);
        card.report_insets(cx);
        card
    }

    fn update(&mut self, props: Props, cx: &mut HostContext) {
        let next = Self::from_props(&props);
        let changed = next.chrome_height != self.chrome_height
            || next.chrome_width != self.chrome_width;
        *self = next;
        if changed {
            self.report_insets(cx);
        }
    }

    fn render(
        &mut self,
        _children: Children,
        _window: &mut Window,
        _cx: &mut HostContext,
    ) -> AnyElement {
        // The children are placed by core, inside the inset box; this draws only
        // the chrome, which is why it is a sibling of the content rather than a
        // wrapper around it.
        let title = self.title.clone();
        let height = self.chrome_height;
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
                        .pl(px(self.chrome_width))
                        .bg(rgb(0x475569))
                        .text_color(rgb(0xf1f5f9))
                        .text_size(px(12.0))
                        .child(title),
                )
            })
            .into_any_element()
    }
}

impl FixtureCard {
    fn from_props(props: &Props) -> Self {
        Self {
            title: props.string("title").unwrap_or_default().to_string(),
            chrome_height: props.number("chromeHeight").unwrap_or(28.0),
            chrome_width: props.number("chromeWidth").unwrap_or(12.0),
        }
    }

    fn report_insets(&self, cx: &mut HostContext) {
        // The title strip is above the children, and the border is on both
        // sides and below.
        cx.set_insets(
            self.chrome_height,
            self.chrome_width,
            self.chrome_width,
            self.chrome_width,
        );
    }
}

/// Registers the fixtures. Autolink calls this through the crate's
/// `rn_gpui_register()`, exactly like a published package.
pub fn rn_gpui_register() {
    register_host_component_without_app::<FixtureChart>(
        "FixtureChart",
        HostComponentOptions::default(),
    );
    register_host_component_without_app::<FixtureMeasuredLabel>(
        "FixtureMeasuredLabel",
        HostComponentOptions {
            measured: true,
            ..Default::default()
        },
    );
    register_host_component_without_app::<FixtureCard>(
        "FixtureCard",
        HostComponentOptions {
            container: true,
            ..Default::default()
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> HostContext {
        HostContext::for_test(1)
    }

    #[test]
    fn the_chart_reads_its_series_and_colour_from_props() {
        let props = Props::from_json(
            r#"{"points":[{"x":0,"y":1},{"x":1,"y":3}],"title":"t","lineColor":-1}"#,
        );
        let chart = ChartProps::from_props(&props);
        assert_eq!(chart.points, vec![(0.0, 1.0), (1.0, 3.0)]);
        assert_eq!(chart.title, "t");
        assert_eq!(chart.line_color, u32::MAX);
    }

    #[test]
    fn a_chart_ignores_points_it_cannot_read() {
        let props = Props::from_json(r#"{"points":[{"x":0},{"x":1,"y":2},3]}"#);
        let chart = ChartProps::from_props(&props);
        assert_eq!(chart.points, vec![(1.0, 2.0)]);
    }

    #[test]
    fn selecting_a_point_emits_the_event_with_its_coordinates() {
        let mut cx = context();
        let mut chart = FixtureChart::create(
            Props::from_json(r#"{"points":[{"x":0,"y":1},{"x":2,"y":4}]}"#),
            &mut cx,
        );
        let _ = cx.take_reported();
        chart.command("selectPoint", vec![json!(1)], &mut cx);
        let (_, events) = cx.take_reported();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "pointSelected");
        assert_eq!(events[0].1, json!({ "index": 1, "x": 2.0, "y": 4.0 }));
        assert_eq!(chart.selected, Some(1));
    }

    #[test]
    fn an_out_of_range_selection_emits_nothing() {
        let mut cx = context();
        let mut chart = FixtureChart::create(
            Props::from_json(r#"{"points":[{"x":0,"y":1}]}"#),
            &mut cx,
        );
        let _ = cx.take_reported();
        chart.command("selectPoint", vec![json!(9)], &mut cx);
        chart.command("selectPoint", vec![json!(-1)], &mut cx);
        assert!(cx.take_reported().1.is_empty());
        assert_eq!(chart.selected, None);
    }

    #[test]
    fn changing_the_report_token_emits_once() {
        let mut cx = context();
        let mut chart = FixtureChart::create(
            Props::from_json(r#"{"points":[{"x":0,"y":1}],"reportToken":1}"#),
            &mut cx,
        );
        let _ = cx.take_reported();
        // The same props: no event.
        chart.update(
            Props::from_json(r#"{"points":[{"x":0,"y":1}],"reportToken":1}"#),
            &mut cx,
        );
        assert!(cx.take_reported().1.is_empty());
        chart.update(
            Props::from_json(r#"{"points":[{"x":0,"y":1}],"reportToken":2}"#),
            &mut cx,
        );
        assert_eq!(cx.take_reported().1.len(), 1);
    }

    #[test]
    fn the_measured_label_reports_the_size_its_text_needs() {
        let mut cx = context();
        FixtureMeasuredLabel::create(
            Props::from_json(r#"{"text":"abcd","characterWidth":10,"lineHeight":20}"#),
            &mut cx,
        );
        assert_eq!(cx.take_reported().0, Some((40.0, 20.0)));
    }

    #[test]
    fn the_measured_label_defaults_match_the_documented_values() {
        let mut cx = context();
        FixtureMeasuredLabel::create(Props::from_json(r#"{"text":"ab"}"#), &mut cx);
        assert_eq!(cx.take_reported().0, Some((16.0, 20.0)));
    }

    #[test]
    fn changing_measured_text_reports_a_new_size_and_only_when_it_changes() {
        let mut cx = context();
        let mut label = FixtureMeasuredLabel::create(Props::from_json(r#"{"text":"ab"}"#), &mut cx);
        let _ = cx.take_reported();
        // A prop object that changes but not the text: no size report.
        label.update(Props::from_json(r#"{"text":"ab"}"#), &mut cx);
        assert!(cx.take_reported().0.is_none());
        label.update(Props::from_json(r#"{"text":"abcd"}"#), &mut cx);
        assert_eq!(cx.take_reported().0, Some((32.0, 20.0)));
    }

    #[test]
    fn the_container_reports_the_chrome_its_children_must_clear() {
        let mut cx = HostContext::for_test(1);
        FixtureCard::create(
            Props::from_json(r#"{"title":"t","chromeHeight":28,"chromeWidth":12}"#),
            &mut cx,
        );
        let insets = cx.take_insets().expect("a container reports its chrome");
        assert_eq!(insets.top, 28.0, "the title strip is above the children");
        assert_eq!(insets.left, 12.0);
        assert_eq!(insets.right, 12.0);
        assert_eq!(insets.bottom, 12.0);
    }

    #[test]
    fn changing_chrome_only_reports_new_insets_when_the_chrome_changed() {
        let mut cx = HostContext::for_test(1);
        let mut card = FixtureCard::create(Props::from_json(r#"{"title":"a"}"#), &mut cx);
        let _ = cx.take_insets();
        // A title change does not move the chrome.
        card.update(Props::from_json(r#"{"title":"b"}"#), &mut cx);
        assert_eq!(cx.take_insets(), None);
        card.update(
            Props::from_json(r#"{"title":"b","chromeHeight":40}"#),
            &mut cx,
        );
        let insets = cx.take_insets().expect("chrome changed");
        assert_eq!(insets.top, 40.0);
    }

    #[test]
    fn registration_declares_the_chart_unmeasured_and_the_label_measured() {
        rn_gpui_register();
        assert!(react_native_gpui::host_component::is_host_component("FixtureChart"));
        assert!(!react_native_gpui::host_component::is_measured_host_component("FixtureChart"));
        assert!(react_native_gpui::host_component::is_measured_host_component(
            "FixtureMeasuredLabel"
        ));
        assert!(!react_native_gpui::host_component::renders_native_surface("FixtureChart"));
        assert!(react_native_gpui::host_component::host_components()
            .iter()
            .any(|(name, options)| name == "FixtureCard" && options.container));
    }
}
