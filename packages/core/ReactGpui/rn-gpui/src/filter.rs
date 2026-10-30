//! The `filter` style: its colour functions as one matrix GPUI applies to
//! every primitive under the node.

use gpui::{
    AnyElement, App, Bounds, ColorFilter, Element, ElementId, GlobalElementId, InspectorElementId,
    IntoElement, LayoutId, Pixels, Window,
};

/// The matrix for `[[name, amount], ...]`, `None` when no function changes
/// colour. `blur` is not a colour function and is left out.
pub(crate) fn parse(json: &str) -> Option<ColorFilter> {
    let functions: Vec<(String, f32)> = serde_json::from_str(json).ok()?;
    let mut filter = ColorFilter::IDENTITY;
    for (name, amount) in functions {
        let Some(next) = function(&name, amount) else {
            if name == "blur" {
                log::debug!("[filter] blur is not drawn");
            }
            continue;
        };
        filter = next.after(&filter);
    }
    (!filter.is_identity()).then_some(filter)
}

fn rgb(rows: [[f32; 3]; 3], offset: [f32; 3]) -> ColorFilter {
    ColorFilter {
        rows: [
            [rows[0][0], rows[0][1], rows[0][2], 0., offset[0]],
            [rows[1][0], rows[1][1], rows[1][2], 0., offset[1]],
            [rows[2][0], rows[2][1], rows[2][2], 0., offset[2]],
            [0., 0., 0., 1., 0.],
        ],
    }
}

/// One CSS filter function, per the Filter Effects spec's matrices.
fn function(name: &str, raw: f32) -> Option<ColorFilter> {
    if !raw.is_finite() {
        return None;
    }
    if name == "hueRotate" {
        // The amount is in degrees and may be negative.
        return hue_rotate(raw);
    }
    let amount = raw.max(0.0);
    let unit = amount.min(1.0);
    Some(match name {
        "brightness" => rgb(
            [[amount, 0., 0.], [0., amount, 0.], [0., 0., amount]],
            [0.; 3],
        ),
        "contrast" => {
            let offset = 0.5 - 0.5 * amount;
            rgb(
                [[amount, 0., 0.], [0., amount, 0.], [0., 0., amount]],
                [offset; 3],
            )
        }
        "grayscale" => {
            let k = 1.0 - unit;
            rgb(
                [
                    [
                        0.2126 + 0.7874 * k,
                        0.7152 - 0.7152 * k,
                        0.0722 - 0.0722 * k,
                    ],
                    [
                        0.2126 - 0.2126 * k,
                        0.7152 + 0.2848 * k,
                        0.0722 - 0.0722 * k,
                    ],
                    [
                        0.2126 - 0.2126 * k,
                        0.7152 - 0.7152 * k,
                        0.0722 + 0.9278 * k,
                    ],
                ],
                [0.; 3],
            )
        }
        "sepia" => {
            let k = 1.0 - unit;
            rgb(
                [
                    [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k],
                    [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k],
                    [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k],
                ],
                [0.; 3],
            )
        }
        "saturate" => rgb(
            [
                [
                    0.213 + 0.787 * amount,
                    0.715 - 0.715 * amount,
                    0.072 - 0.072 * amount,
                ],
                [
                    0.213 - 0.213 * amount,
                    0.715 + 0.285 * amount,
                    0.072 - 0.072 * amount,
                ],
                [
                    0.213 - 0.213 * amount,
                    0.715 - 0.715 * amount,
                    0.072 + 0.928 * amount,
                ],
            ],
            [0.; 3],
        ),
        "invert" => rgb(
            [
                [1. - 2. * unit, 0., 0.],
                [0., 1. - 2. * unit, 0.],
                [0., 0., 1. - 2. * unit],
            ],
            [unit; 3],
        ),
        "opacity" => ColorFilter {
            rows: [
                [1., 0., 0., 0., 0.],
                [0., 1., 0., 0., 0.],
                [0., 0., 1., 0., 0.],
                [0., 0., 0., unit, 0.],
            ],
        },
        _ => return None,
    })
}

fn hue_rotate(degrees: f32) -> Option<ColorFilter> {
    let (sin, cos) = degrees.to_radians().sin_cos();
    Some(rgb(
        [
            [
                0.213 + cos * 0.787 - sin * 0.213,
                0.715 - cos * 0.715 - sin * 0.715,
                0.072 - cos * 0.072 + sin * 0.928,
            ],
            [
                0.213 - cos * 0.213 + sin * 0.143,
                0.715 + cos * 0.285 + sin * 0.140,
                0.072 - cos * 0.072 - sin * 0.283,
            ],
            [
                0.213 - cos * 0.213 - sin * 0.787,
                0.715 - cos * 0.715 + sin * 0.715,
                0.072 + cos * 0.928 + sin * 0.072,
            ],
        ],
        [0.; 3],
    ))
}

/// `child` painted through `filter`.
pub(crate) struct Filtered {
    child: AnyElement,
    filter: ColorFilter,
}

impl Filtered {
    pub(crate) fn new(child: AnyElement, filter: ColorFilter) -> Self {
        Self { child, filter }
    }
}

impl IntoElement for Filtered {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for Filtered {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        (self.child.request_layout(window, cx), ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        _bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        let child = &mut self.child;
        window.with_color_filter(self.filter, |window| child.prepaint(window, cx));
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        _bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        _prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let child = &mut self.child;
        window.with_color_filter(self.filter, |window| child.paint(window, cx));
    }
}

/// `child` painted into an effect group of its own and composited at `opacity`.
pub(crate) struct Grouped {
    child: AnyElement,
    opacity: f32,
}

impl Grouped {
    pub(crate) fn new(child: AnyElement, opacity: f32) -> Self {
        Self { child, opacity }
    }
}

impl IntoElement for Grouped {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for Grouped {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        (self.child.request_layout(window, cx), ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        _bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        self.child.prepaint(window, cx);
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        _bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        _prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let child = &mut self.child;
        window.with_effect_group(self.opacity, |window| child.paint(window, cx));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(filter: &ColorFilter, color: [f32; 4]) -> [f32; 4] {
        let mut out = [0.; 4];
        for (row, out) in filter.rows.iter().zip(out.iter_mut()) {
            *out = row[0] * color[0]
                + row[1] * color[1]
                + row[2] * color[2]
                + row[3] * color[3]
                + row[4];
        }
        out
    }

    fn near(a: [f32; 4], b: [f32; 4]) {
        for (x, y) in a.iter().zip(b) {
            assert!((x - y).abs() < 0.01, "{a:?} vs {b:?}");
        }
    }

    #[test]
    fn an_empty_or_neutral_filter_is_none() {
        assert!(parse("[]").is_none());
        assert!(parse("[[\"brightness\",1.0]]").is_none());
        assert!(parse("[[\"blur\",4.0]]").is_none());
        assert!(parse("not json").is_none());
    }

    #[test]
    fn grayscale_collapses_red_to_its_luminance() {
        let filter = parse("[[\"grayscale\",1.0]]").unwrap();
        near(
            apply(&filter, [1., 0., 0., 1.]),
            [0.2126, 0.2126, 0.2126, 1.],
        );
    }

    #[test]
    fn invert_flips_each_channel() {
        let filter = parse("[[\"invert\",1.0]]").unwrap();
        near(apply(&filter, [1., 0.25, 0., 1.]), [0., 0.75, 1., 1.]);
    }

    #[test]
    fn opacity_scales_alpha_only() {
        let filter = parse("[[\"opacity\",0.5]]").unwrap();
        near(apply(&filter, [0.2, 0.4, 0.6, 1.]), [0.2, 0.4, 0.6, 0.5]);
    }

    #[test]
    fn contrast_pivots_on_mid_grey() {
        let filter = parse("[[\"contrast\",2.0]]").unwrap();
        near(apply(&filter, [0.5, 0.75, 0.25, 1.]), [0.5, 1.0, 0.0, 1.]);
    }

    #[test]
    fn functions_apply_in_order() {
        // Brightness doubles, then invert flips: 0.25 -> 0.5 -> 0.5; 0.5 -> 1 -> 0.
        let filter = parse("[[\"brightness\",2.0],[\"invert\",1.0]]").unwrap();
        near(apply(&filter, [0.25, 0.5, 0., 1.]), [0.5, 0., 1., 1.]);
    }

    #[test]
    fn a_full_turn_of_hue_changes_nothing() {
        assert!(parse("[[\"hueRotate\",360.0]]").map_or(true, |filter| {
            let out = apply(&filter, [0.8, 0.2, 0.4, 1.]);
            (out[0] - 0.8).abs() < 0.01 && (out[1] - 0.2).abs() < 0.01
        }));
    }
}
