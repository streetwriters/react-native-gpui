use gpui::{div, prelude::*, px, AnyElement, App, Window};
use react_native_gpui::extensions::{
    register_component_renderer, ComponentNode, ComponentRenderer,
};
use rn_gpui_sys::ffi::RectF;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex, OnceLock, Weak};

const COMPONENTS: &[&str] = &[
    "RNSVGSvgView",
    "RNSVGCircle",
    "RNSVGEllipse",
    "RNSVGLine",
    "RNSVGPath",
    "RNSVGRect",
    "RNSVGGroup",
    "RNSVGDefs",
    "RNSVGClipPath",
    "RNSVGLinearGradient",
    "RNSVGRadialGradient",
    "RNSVGText",
    "RNSVGTSpan",
    "RNSVGMask",
    "RNSVGSymbol",
    "RNSVGPattern",
    "RNSVGMarker",
    "RNSVGTextPath",
    "RNSVGUse",
];

struct SvgRenderer;

impl ComponentRenderer for SvgRenderer {
    // The SVG document is drawn from the shapes under its root.
    fn reads_children(&self) -> bool {
        true
    }

    fn render(
        &self,
        node: &ComponentNode,
        window: &mut Window,
        cx: &mut App,
    ) -> Option<AnyElement> {
        if node.component != "RNSVGSvgView" {
            return Some(div().into_any_element());
        }
        // The frame is in unscaled coordinates and this element is painted
        // scaled, exactly as `ComponentRenderer::render` documents, so the box
        // has to be scaled the same way core scales the element it would have
        // built. `size_full()` sized the image to its parent instead: the
        // document is rasterized at the window's scale factor, and an image
        // carries no intrinsic size, so every SVG stretched to fill whatever
        // surrounded it and painted over the text below it.
        let frame = node.frame;
        let (scale_x, scale_y) = node.scale;
        let width = frame.w * scale_x;
        let height = frame.h * scale_y;
        let scale = window.scale_factor();
        let image = cached_svg_image(node, frame, scale, cx)?;
        // Chrome paints an inline SVG at a whole CSS pixel: a box laid out at
        // 2.5 is drawn at 3. The image is placed the same way, so a 15 point
        // icon centred in a 20 point button lands where the web app's does.
        Some(
            gpui::canvas(
                |bounds, _, _| bounds,
                move |_, bounds, window, _| {
                    let snapped = gpui::Bounds::new(
                        gpui::point(
                            px((bounds.origin.x.as_f32() + 0.5).floor()),
                            px((bounds.origin.y.as_f32() + 0.5).floor()),
                        ),
                        bounds.size,
                    );
                    let _ = window.paint_image(
                        snapped,
                        snapped,
                        gpui::Corners::default(),
                        image.clone(),
                        0,
                        false,
                    );
                },
            )
            .w(px(width))
            .h(px(height))
            .into_any_element(),
        )
    }
}

pub fn rn_gpui_register() {
    for component in COMPONENTS {
        register_component_renderer(*component, Arc::new(SvgRenderer));
    }
}

/// Where one coverage sample sits, so a shape can be drawn once per sample.
#[derive(Clone, Copy)]
struct Sample {
    /// The sample's offset from the pixel centre, in device pixels.
    dx: f32,
    dy: f32,
    /// Device pixels per CSS pixel.
    scale: f32,
}

fn svg_document(node: &ComponentNode, frame: RectF, cx: &App, sample: Option<Sample>) -> String {
    let props = &node.props;
    let mut attributes = format!(
        "xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\"",
        svg_number(frame.w),
        svg_number(frame.h)
    );
    if sample.is_some() {
        attributes.push_str(" shape-rendering=\"crispEdges\"");
    }
    for (name, attribute) in [
        ("color", "color"),
        ("fill", "fill"),
        ("stroke", "stroke"),
        ("strokeWidth", "stroke-width"),
        ("fillOpacity", "fill-opacity"),
        ("strokeOpacity", "stroke-opacity"),
        ("opacity", "opacity"),
    ] {
        if let Some(value) = props.get(name).filter(|value| !value.is_null()) {
            if let Some(value) = svg_value(value) {
                attributes.push_str(&format!(" {attribute}=\"{}\"", svg_escape(&value)));
            }
        }
    }
    if let Some(cap) = props
        .get("strokeLinecap")
        .and_then(serde_json::Value::as_i64)
    {
        let cap = ["butt", "round", "square"]
            .get(cap as usize)
            .copied()
            .unwrap_or("butt");
        attributes.push_str(&format!(" stroke-linecap=\"{cap}\""));
    }
    if let Some(join) = props
        .get("strokeLinejoin")
        .and_then(serde_json::Value::as_i64)
    {
        let join = ["miter", "round", "bevel"]
            .get(join as usize)
            .copied()
            .unwrap_or("miter");
        attributes.push_str(&format!(" stroke-linejoin=\"{join}\""));
    }
    let view_box = match (
        props.get("vbWidth").and_then(serde_json::Value::as_f64),
        props.get("vbHeight").and_then(serde_json::Value::as_f64),
    ) {
        (Some(width), Some(height)) if width > 0.0 && height > 0.0 => {
            let min_x = props
                .get("minX")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0);
            let min_y = props
                .get("minY")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0);
            let align = props.get("align").and_then(serde_json::Value::as_str);
            let mode = match props
                .get("meetOrSlice")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0)
            {
                1 => "slice",
                2 => "none",
                _ => "meet",
            };
            Some((min_x, min_y, width, height, align, mode))
        }
        _ => None,
    };
    match (view_box, sample) {
        (Some((min_x, min_y, width, height, align, mode)), sample) => {
            // The sample's shift in user units: how many of them one device
            // pixel covers depends on how the view box is fitted to the frame.
            let (mut min_x, mut min_y) = (min_x, min_y);
            if let Some(sample) = sample {
                let fit_x = f64::from(frame.w * sample.scale) / width;
                let fit_y = f64::from(frame.h * sample.scale) / height;
                let (unit_x, unit_y) = match (align, mode) {
                    (Some("none"), _) | (Some(_), "none") => (fit_x, fit_y),
                    (_, "slice") => (fit_x.max(fit_y), fit_x.max(fit_y)),
                    _ => (fit_x.min(fit_y), fit_x.min(fit_y)),
                };
                min_x += f64::from(sample.dx) / unit_x;
                min_y += f64::from(sample.dy) / unit_y;
            }
            attributes.push_str(&format!(
                " viewBox=\"{} {} {} {}\"",
                svg_number(min_x as f32),
                svg_number(min_y as f32),
                svg_number(width as f32),
                svg_number(height as f32)
            ));
            if let Some(align) = align {
                attributes.push_str(&format!(
                    " preserveAspectRatio=\"{} {}\"",
                    svg_escape(align),
                    mode
                ));
            }
        }
        (None, Some(sample)) => {
            // Without a view box the user unit is the CSS pixel; one is added
            // only to carry the shift.
            attributes.push_str(&format!(
                " viewBox=\"{} {} {} {}\"",
                svg_number(sample.dx / sample.scale),
                svg_number(sample.dy / sample.scale),
                svg_number(frame.w),
                svg_number(frame.h)
            ));
        }
        (None, None) => {}
    }
    let mut document = format!("<svg {attributes}>");
    for child in &node.children {
        svg_node(child, cx, &mut document);
    }
    document.push_str("</svg>");
    document
}

fn svg_node(node: &ComponentNode, cx: &App, output: &mut String) {
    let props = &node.props;
    let element = match node.component.as_str() {
        "RNSVGCircle" => "circle",
        "RNSVGEllipse" => "ellipse",
        "RNSVGLine" => "line",
        "RNSVGPath" => "path",
        "RNSVGRect" => "rect",
        "RNSVGGroup" => "g",
        "RNSVGDefs" => "defs",
        "RNSVGClipPath" => "clipPath",
        "RNSVGLinearGradient" => "linearGradient",
        "RNSVGRadialGradient" => "radialGradient",
        "RNSVGMask" => "mask",
        "RNSVGSymbol" => "symbol",
        "RNSVGPattern" => "pattern",
        "RNSVGMarker" => "marker",
        "RNSVGText" => "text",
        "RNSVGTSpan" => "tspan",
        "RNSVGTextPath" => "textPath",
        "RNSVGUse" => "use",
        _ => "",
    };
    if element.is_empty() {
        for child in &node.children {
            svg_node(child, cx, output);
        }
        return;
    }
    let mut attributes = String::new();
    for name in [
        "id",
        "name",
        "href",
        "d",
        "x",
        "y",
        "x1",
        "y1",
        "x2",
        "y2",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "width",
        "height",
        "color",
        "fill",
        "stroke",
        "strokeWidth",
        "fillOpacity",
        "strokeOpacity",
        "strokeDasharray",
        "strokeDashoffset",
        "strokeMiterlimit",
        "opacity",
        "fontSize",
        "fontWeight",
        "fontFamily",
        "textLength",
        "dominantBaseline",
        "offset",
        "stopColor",
        "stopOpacity",
    ] {
        if !svg_property_is_set(props, name) {
            continue;
        }
        if let Some(value) = props.get(name) {
            let attribute = match name {
                "strokeWidth" => "stroke-width",
                "fillOpacity" => "fill-opacity",
                "strokeOpacity" => "stroke-opacity",
                "strokeDasharray" => "stroke-dasharray",
                "strokeDashoffset" => "stroke-dashoffset",
                "strokeMiterlimit" => "stroke-miterlimit",
                "fontSize" => "font-size",
                "fontWeight" => "font-weight",
                "fontFamily" => "font-family",
                "dominantBaseline" => "dominant-baseline",
                "stopColor" => "stop-color",
                "stopOpacity" => "stop-opacity",
                other => other,
            };
            let value = if value.is_null() && matches!(name, "fill" | "stroke") {
                Some("none".to_owned())
            } else {
                svg_value(value)
            };
            if let Some(value) = value {
                attributes.push_str(&format!(" {attribute}=\"{}\"", svg_escape(&value)));
            }
        }
    }
    if let Some(rule) = props
        .get("fillRule")
        .filter(|_| svg_property_is_set(props, "fillRule"))
        .and_then(serde_json::Value::as_i64)
    {
        attributes.push_str(&format!(
            " fill-rule=\"{}\"",
            if rule == 0 { "evenodd" } else { "nonzero" }
        ));
    }
    if let Some(cap) = props
        .get("strokeLinecap")
        .filter(|_| svg_property_is_set(props, "strokeLinecap"))
        .and_then(serde_json::Value::as_i64)
    {
        let cap = ["butt", "round", "square"]
            .get(cap as usize)
            .copied()
            .unwrap_or("butt");
        attributes.push_str(&format!(" stroke-linecap=\"{cap}\""));
    }
    if let Some(join) = props
        .get("strokeLinejoin")
        .filter(|_| svg_property_is_set(props, "strokeLinejoin"))
        .and_then(serde_json::Value::as_i64)
    {
        let join = ["miter", "round", "bevel"]
            .get(join as usize)
            .copied()
            .unwrap_or("miter");
        attributes.push_str(&format!(" stroke-linejoin=\"{join}\""));
    }
    if let Some(matrix) = props.get("matrix").and_then(serde_json::Value::as_array) {
        if matrix.len() >= 16 {
            let values = [0, 1, 4, 5, 12, 13].map(|index| matrix[index].as_f64().unwrap_or(0.0));
            attributes.push_str(&format!(
                " transform=\"matrix({} {} {} {} {} {})\"",
                values[0], values[1], values[2], values[3], values[4], values[5]
            ));
        }
    }
    output.push('<');
    output.push_str(element);
    output.push_str(&attributes);
    output.push('>');
    for child in &node.children {
        svg_node(child, cx, output);
    }
    output.push_str("</");
    output.push_str(element);
    output.push('>');
}

fn svg_property_is_set(props: &serde_json::Value, name: &str) -> bool {
    if !matches!(
        name,
        "fill"
            | "fillOpacity"
            | "fillRule"
            | "stroke"
            | "strokeWidth"
            | "strokeOpacity"
            | "strokeLinecap"
            | "strokeLinejoin"
            | "strokeDasharray"
            | "strokeDashoffset"
            | "strokeMiterlimit"
    ) {
        return true;
    }
    props
        .get("propList")
        .and_then(serde_json::Value::as_array)
        .is_none_or(|properties| {
            properties
                .iter()
                .any(|property| property.as_str() == Some(name))
        })
}

fn svg_value(value: &serde_json::Value) -> Option<String> {
    match value.get("type").and_then(serde_json::Value::as_i64) {
        Some(1) => {
            return value
                .get("brushRef")
                .and_then(serde_json::Value::as_str)
                .map(|id| format!("url(#{id})"))
        }
        Some(2) => return Some("currentColor".to_owned()),
        Some(3) => return Some("context-fill".to_owned()),
        Some(4) => return Some("context-stroke".to_owned()),
        _ => {}
    }

    if let Some(number) = value.as_f64() {
        if number < 0.0 && number.fract() == 0.0 {
            return Some(format!("#{:06x}", (number as i64 as u32) & 0x00ff_ffff));
        }
        if (0x0100_0000..=0xffff_ffff).contains(&(number as u64)) {
            let argb = number as u32;
            return Some(format!(
                "rgba({}, {}, {}, {})",
                (argb >> 16) & 0xff,
                (argb >> 8) & 0xff,
                argb & 0xff,
                ((argb >> 24) & 0xff) as f32 / 255.0
            ));
        }
        return Some(svg_number(number as f32));
    }
    if let Some(value) = value.as_str() {
        return Some(value.to_owned());
    }
    if let Some(value) = value.as_array() {
        return Some(
            value
                .iter()
                .filter_map(svg_value)
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    value
        .get("payload")
        .and_then(svg_value)
        .or_else(|| value.get("value").and_then(svg_value))
}

fn svg_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn svg_number(value: f32) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

/// Chrome rasterises with four coverage samples per pixel at these offsets (in
/// pixels from the centre): the standard Direct3D 4x pattern. A pixel is
/// therefore never covered by anything but 0, 1/4, 1/2, 3/4 or all, and the edge
/// of an icon takes the same five steps here.
const SAMPLE_OFFSETS: [(f32, f32); 4] = [
    (-2.0 / 16.0, -6.0 / 16.0),
    (6.0 / 16.0, -2.0 / 16.0),
    (-6.0 / 16.0, 2.0 / 16.0),
    (2.0 / 16.0, 6.0 / 16.0),
];

/// Draws the document at the window's scale, once per coverage sample without
/// antialiasing, and averages the samples.
fn sampled_image(
    node: &ComponentNode,
    frame: RectF,
    scale: f32,
    cx: &App,
) -> Option<Arc<gpui::RenderImage>> {
    let width = (frame.w * scale).round() as i32;
    let height = (frame.h * scale).round() as i32;
    if width < 1 || height < 1 {
        return None;
    }
    let size = gpui::size(gpui::DevicePixels(width), gpui::DevicePixels(height));
    let renderer = cx.svg_renderer();
    let mut sum = vec![0f32; width as usize * height as usize * 4];
    for (dx, dy) in SAMPLE_OFFSETS {
        let document = svg_document(node, frame, cx, Some(Sample { dx, dy, scale }));
        let parsed = renderer.parse_svg(document.as_bytes()).ok()?;
        let rendered = renderer
            .render_parsed(&parsed, gpui::SvgSize::ExactSize(size))
            .ok()?;
        let bytes = rendered.as_bytes(0)?;
        if bytes.len() != sum.len() {
            return None;
        }
        // BGRA with straight alpha; accumulate colour weighted by alpha.
        for (total, pixel) in sum.chunks_exact_mut(4).zip(bytes.chunks_exact(4)) {
            let alpha = f32::from(pixel[3]);
            total[0] += f32::from(pixel[0]) * alpha;
            total[1] += f32::from(pixel[1]) * alpha;
            total[2] += f32::from(pixel[2]) * alpha;
            total[3] += alpha;
        }
    }
    let samples = SAMPLE_OFFSETS.len() as f32;
    let mut out = Vec::with_capacity(sum.len());
    for total in sum.chunks_exact(4) {
        if total[3] <= 0.0 {
            out.extend_from_slice(&[0, 0, 0, 0]);
            continue;
        }
        let blue = (total[0] / total[3]).round().clamp(0.0, 255.0);
        let green = (total[1] / total[3]).round().clamp(0.0, 255.0);
        let red = (total[2] / total[3]).round().clamp(0.0, 255.0);
        // Half coverage is 127.5 of 255, which the alpha channel cannot hold.
        // Chrome blends the exact half, and the result then rounds away from
        // the ink's own side: toward light under dark ink and toward dark
        // under light ink, so the alpha rounds the other way to match.
        let alpha = total[3] / samples;
        let alpha = if (alpha.fract() - 0.5).abs() < 1e-3 {
            let luma = 0.299 * red + 0.587 * green + 0.114 * blue;
            if luma < 128.0 {
                alpha.floor()
            } else {
                alpha.ceil()
            }
        } else {
            alpha.round()
        };
        out.extend_from_slice(&[
            blue as u8,
            green as u8,
            red as u8,
            alpha.clamp(0.0, 255.0) as u8,
        ]);
    }
    let buffer = image::ImageBuffer::from_raw(width as u32, height as u32, out)?;
    Some(Arc::new(gpui::RenderImage::new(
        smallvec::SmallVec::from_const([image::Frame::new(buffer)]),
    )))
}

fn cached_svg_image(
    node: &ComponentNode,
    frame: RectF,
    scale: f32,
    cx: &App,
) -> Option<Arc<gpui::RenderImage>> {
    type SvgCache = HashMap<(u64, u32, u32, u32), Weak<gpui::RenderImage>>;
    static CACHE: OnceLock<Mutex<SvgCache>> = OnceLock::new();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    svg_document(node, frame, cx, None).hash(&mut hasher);
    let key = (
        hasher.finish(),
        frame.w.to_bits(),
        frame.h.to_bits(),
        scale.to_bits(),
    );
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(image) = cache.get(&key).and_then(Weak::upgrade) {
        return Some(image);
    }
    let image = sampled_image(node, frame, scale, cx)?;
    cache.insert(key, Arc::downgrade(&image));
    if cache.len() > 512 {
        cache.retain(|_, image| image.strong_count() > 0);
    }
    Some(image)
}

#[cfg(test)]
mod svg_paint_tests {
    use super::{svg_property_is_set, svg_value};
    use serde_json::json;

    #[test]
    fn brushes_keep_current_color_and_reference_semantics() {
        assert_eq!(
            svg_value(&json!({"type": 2})).as_deref(),
            Some("currentColor")
        );
        assert_eq!(
            svg_value(&json!({"type": 1, "brushRef": "gradient"})).as_deref(),
            Some("url(#gradient)")
        );
        assert_eq!(
            svg_value(&json!({"type": 0, "payload": 0xff64d2ff_u32})).as_deref(),
            Some("rgba(100, 210, 255, 1)")
        );
    }

    #[test]
    fn default_black_fill_does_not_override_inherited_none() {
        let child = json!({"fill": {"type": 0, "payload": 0xff000000_u32}, "strokeLinecap": 0, "propList": []});
        assert!(!svg_property_is_set(&child, "fill"));
        assert!(!svg_property_is_set(&child, "strokeLinecap"));
        let group = json!({"fill": null, "stroke": {"type": 2}, "propList": ["fill", "stroke"]});
        assert!(svg_property_is_set(&group, "fill"));
        assert!(svg_property_is_set(&group, "stroke"));
    }
}
