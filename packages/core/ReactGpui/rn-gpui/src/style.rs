use gpui::{
    point, px, rgba, BoxShadow, CursorStyle, Fill, Hsla, Overflow, SharedString, StyleRefinement,
};
use rn_gpui_sys::ffi::ViewPropsFlat;
use serde_json::Value;

/// RN colors are 0xAARRGGBB; GPUI's `rgba()` takes 0xRRGGBBAA.
pub fn color(argb: u32) -> Hsla {
    let alpha = argb >> 24;
    rgba((argb << 8) | alpha).into()
}

/// `ViewPropsFlat::cursor` is the ordinal of RN's `Cursor` enum; the arms
/// below are in that order.
fn cursor_style(ordinal: u8) -> Option<CursorStyle> {
    let style = match ordinal {
        0 => return None,                         // Auto
        1 => CursorStyle::DragLink,               // Alias
        2 => CursorStyle::Arrow,                  // AllScroll
        3 => CursorStyle::Arrow,                  // Cell
        4 => CursorStyle::ResizeColumn,           // ColResize
        5 => CursorStyle::ContextualMenu,         // ContextMenu
        6 => CursorStyle::DragCopy,               // Copy
        7 => CursorStyle::Crosshair,              // Crosshair
        8 => CursorStyle::Arrow,                  // Default
        9 => CursorStyle::ResizeRight,            // EResize
        10 => CursorStyle::ResizeLeftRight,       // EWResize
        11 => CursorStyle::OpenHand,              // Grab
        12 => CursorStyle::ClosedHand,            // Grabbing
        13 => CursorStyle::Arrow,                 // Help
        14 => CursorStyle::Arrow,                 // Move
        15 => CursorStyle::ResizeUpRightDownLeft, // NEResize
        16 => CursorStyle::ResizeUpRightDownLeft, // NESWResize
        17 => CursorStyle::ResizeUp,              // NResize
        18 => CursorStyle::ResizeUpDown,          // NSResize
        19 => CursorStyle::ResizeUpLeftDownRight, // NWResize
        20 => CursorStyle::ResizeUpLeftDownRight, // NWSEResize
        21 => CursorStyle::OperationNotAllowed,   // NoDrop
        22 => CursorStyle::Arrow,                 // None
        23 => CursorStyle::OperationNotAllowed,   // NotAllowed
        24 => CursorStyle::PointingHand,          // Pointer
        25 => CursorStyle::Arrow,                 // Progress
        26 => CursorStyle::ResizeRow,             // RowResize
        27 => CursorStyle::ResizeDown,            // SResize
        28 => CursorStyle::ResizeUpLeftDownRight, // SEResize
        29 => CursorStyle::ResizeUpRightDownLeft, // SWResize
        30 => CursorStyle::IBeam,                 // Text
        31 => CursorStyle::PointingHand,          // Url
        32 => CursorStyle::ResizeLeft,            // WResize
        33 => CursorStyle::Arrow,                 // Wait
        34 => CursorStyle::Arrow,                 // ZoomIn
        35 => CursorStyle::Arrow,                 // ZoomOut
        unknown => {
            log::warn!("[style] unknown cursor ordinal {unknown}; using the default");
            CursorStyle::Arrow
        }
    };
    Some(style)
}

pub fn to_refinement(v: &ViewPropsFlat) -> StyleRefinement {
    let mut s = StyleRefinement::default();
    if v.background_color != 0 {
        s.background = Some(Fill::from(color(v.background_color)));
    }
    // RN borders are painted as four independent edge rules by `node_view`.
    // GPUI border widths would add a second, default-colored edge on top.
    s.corner_radii.top_left = Some(px(v.border_radii.tl).into());
    s.corner_radii.top_right = Some(px(v.border_radii.tr).into());
    s.corner_radii.bottom_right = Some(px(v.border_radii.br).into());
    s.corner_radii.bottom_left = Some(px(v.border_radii.bl).into());
    if v.overflow_hidden {
        s.overflow.x = Some(Overflow::Hidden);
        s.overflow.y = Some(Overflow::Hidden);
        // React Native clips children to the rounded corners, not only the box.
        s.overflow_clips_corners = Some(true);
    }
    if let Some(cursor) = cursor_style(v.cursor) {
        log::info!("[style] cursor ordinal {} -> {cursor:?}", v.cursor);
        s.mouse_cursor = Some(cursor);
    }
    if v.opacity < 1.0 {
        s.opacity = Some(v.opacity);
    }
    if !v.shadows.is_empty() {
        s.box_shadow = Some(
            v.shadows
                .iter()
                .map(|sh| BoxShadow {
                    color: color(sh.color),
                    offset: point(px(sh.dx), px(sh.dy)),
                    blur_radius: px(sh.blur),
                    spread_radius: px(sh.spread),
                    inset: sh.inset,
                })
                .collect(),
        );
    }
    s
}

/// The properties a state style prop can change.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StateStyle {
    background_color: Option<u32>,
    opacity: Option<f32>,
    box_shadow: Option<Vec<ShadowSpec>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct ShadowSpec {
    offset_x: f32,
    offset_y: f32,
    color: Option<u32>,
    blur_radius: f32,
    spread_distance: f32,
    inset: bool,
}

fn number(value: &Value, key: &str) -> Option<f32> {
    value.get(key)?.as_f64().map(|n| n as f32)
}

fn argb(value: &Value, key: &str) -> Option<u32> {
    u32::try_from(value.get(key)?.as_u64()?).ok()
}

impl ShadowSpec {
    fn from_json(value: &Value) -> Self {
        Self {
            offset_x: number(value, "offsetX").unwrap_or(0.0),
            offset_y: number(value, "offsetY").unwrap_or(0.0),
            color: argb(value, "color"),
            blur_radius: number(value, "blurRadius").unwrap_or(0.0),
            spread_distance: number(value, "spreadDistance").unwrap_or(0.0),
            inset: value.get("inset").and_then(Value::as_bool).unwrap_or(false),
        }
    }
}

/// The properties a running animation owns, which a state style leaves alone.
#[derive(Clone, Copy, Debug, Default)]
pub struct Animating {
    pub background: bool,
    pub opacity: bool,
}

impl StateStyle {
    fn from_json(value: &Value) -> Self {
        Self {
            background_color: argb(value, "backgroundColor"),
            opacity: number(value, "opacity"),
            box_shadow: value
                .get("boxShadow")
                .and_then(Value::as_array)
                .map(|shadows| shadows.iter().map(ShadowSpec::from_json).collect()),
        }
    }

    /// The refinement gpui layers over the base style while the state holds.
    /// `scale` is the node's accumulated transform scale, applied to shadows the
    /// way the base style's are.
    pub fn refinement(&self, scale: (f32, f32), animating: Animating) -> StyleRefinement {
        let mut s = StyleRefinement::default();
        if let Some(argb) = self.background_color.filter(|_| !animating.background) {
            s.background = Some(Fill::from(color(argb)));
        }
        if let Some(opacity) = self.opacity.filter(|_| !animating.opacity) {
            s.opacity = Some(opacity.clamp(0.0, 1.0));
        }
        if let Some(shadows) = &self.box_shadow {
            let radius_scale = scale.0.min(scale.1);
            s.box_shadow = Some(
                shadows
                    .iter()
                    .map(|shadow| BoxShadow {
                        color: color(shadow.color.unwrap_or(0xFF00_0000)),
                        offset: point(px(shadow.offset_x * scale.0), px(shadow.offset_y * scale.1)),
                        blur_radius: px(shadow.blur_radius * radius_scale),
                        spread_radius: px(shadow.spread_distance * radius_scale),
                        inset: shadow.inset,
                    })
                    .collect(),
            );
        }
        s
    }
}

/// A style that applies while a named ancestor group is hovered or pressed.
#[derive(Clone, Debug, PartialEq)]
pub struct GroupStateStyle {
    pub group: SharedString,
    pub style: StateStyle,
}

/// Everything a view declares through `group` and the `*Style` state props.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StateStyles {
    pub group: Option<SharedString>,
    pub hover: Option<StateStyle>,
    pub active: Option<StateStyle>,
    pub focus: Option<StateStyle>,
    pub focus_visible: Option<StateStyle>,
    pub group_hover: Option<GroupStateStyle>,
    pub group_active: Option<GroupStateStyle>,
}

fn parse_json(prop: &str, json: &str) -> Option<Value> {
    if json.is_empty() {
        return None;
    }
    match serde_json::from_str(json) {
        Ok(parsed) => Some(parsed),
        Err(error) => {
            log::warn!("[style] ignoring invalid {prop}: {error}");
            None
        }
    }
}

fn parse_state(prop: &str, json: &str) -> Option<StateStyle> {
    parse_json(prop, json).map(|value| StateStyle::from_json(&value))
}

fn parse_group(prop: &str, json: &str) -> Option<GroupStateStyle> {
    let value = parse_json(prop, json)?;
    let group = value
        .get("group")?
        .as_str()
        .filter(|group| !group.is_empty())?;
    Some(GroupStateStyle {
        group: group.to_owned().into(),
        style: StateStyle::from_json(value.get("style")?),
    })
}

impl StateStyles {
    /// `None` when the view declares nothing, which is the case for almost every view.
    pub fn from_flat(v: &ViewPropsFlat) -> Option<std::rc::Rc<Self>> {
        let styles = Self {
            group: (!v.group.is_empty()).then(|| v.group.clone().into()),
            hover: parse_state("hoverStyle", &v.hover_style),
            active: parse_state("activeStyle", &v.active_style),
            focus: parse_state("focusStyle", &v.focus_style),
            focus_visible: parse_state("focusVisibleStyle", &v.focus_visible_style),
            group_hover: parse_group("groupHoverStyle", &v.group_hover_style),
            group_active: parse_group("groupActiveStyle", &v.group_active_style),
        };
        (styles != Self::default()).then(|| std::rc::Rc::new(styles))
    }

    pub fn has_focus(&self) -> bool {
        self.focus.is_some() || self.focus_visible.is_some()
    }
}
