//! Where a tray popover goes on a desktop that does not say where the icon is.
//!
//! Wayland gives an app neither the icon's position nor the right to place a
//! window. What can be read is the work area, the screen less the space panels
//! and docks reserve, and from it which edge holds a panel. The popover is then
//! drawn at the end of that edge, where the tray sits, inside a window covering
//! the work area. An app, or a user, can choose the corner instead.
#![allow(dead_code)]

/// How far a popover keeps from the edges of the work area it is anchored to.
pub const MARGIN: f32 = 8.0;

/// The corner of the work area a popover is drawn in.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Anchor {
    /// The end of the thinnest reserved edge, which is where a panel's tray is.
    #[default]
    Auto,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Center,
}

impl Anchor {
    pub fn parse(text: &str) -> Option<Self> {
        Some(match text.trim().to_ascii_lowercase().as_str() {
            "auto" | "" => Self::Auto,
            "top-left" => Self::TopLeft,
            "top-right" => Self::TopRight,
            "bottom-left" => Self::BottomLeft,
            "bottom-right" => Self::BottomRight,
            "center" | "centre" => Self::Center,
            _ => return None,
        })
    }
}

/// How much of each edge of the screen panels and docks reserve, in points.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Reserved {
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
}

/// The reserved edges, from the size of the whole screen and the work area
/// `(x, y, width, height)` inside it.
pub fn reserved(screen: (f32, f32), work: (f32, f32, f32, f32)) -> Reserved {
    let (screen_width, screen_height) = screen;
    let (x, y, width, height) = work;
    Reserved {
        left: x.max(0.0),
        top: y.max(0.0),
        right: (screen_width - (x + width)).max(0.0),
        bottom: (screen_height - (y + height)).max(0.0),
    }
}

/// The corner a tray is in: at the end of the thinnest edge that reserves
/// anything, since a panel is thinner than a dock beside it. Horizontal panels
/// keep the tray at their right end, vertical ones at their bottom.
pub fn auto_anchor(reserved: Reserved) -> Anchor {
    let edges = [
        (reserved.top, Anchor::TopRight),
        (reserved.bottom, Anchor::BottomRight),
        (reserved.left, Anchor::BottomLeft),
        (reserved.right, Anchor::BottomRight),
    ];
    edges
        .iter()
        .filter(|(thickness, _)| *thickness >= 1.0)
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map_or(Anchor::Center, |(_, anchor)| *anchor)
}

/// The origin, in the work area's own coordinates, of a popover of `size` in a
/// work area of `area`, `margin` away from the edges it is anchored to and moved
/// by `offset`. The result is kept inside the area.
pub fn place(
    anchor: Anchor,
    reserved: Reserved,
    area: (f32, f32),
    size: (f32, f32),
    margin: f32,
    offset: (f32, f32),
) -> (f32, f32) {
    let anchor = match anchor {
        Anchor::Auto => auto_anchor(reserved),
        other => other,
    };
    let (area_width, area_height) = area;
    let (width, height) = size;
    let (x, y) = match anchor {
        Anchor::TopLeft => (margin, margin),
        Anchor::TopRight | Anchor::Auto => (area_width - width - margin, margin),
        Anchor::BottomLeft => (margin, area_height - height - margin),
        Anchor::BottomRight => (area_width - width - margin, area_height - height - margin),
        Anchor::Center => ((area_width - width) / 2.0, (area_height - height) / 2.0),
    };
    let max_x = (area_width - width).max(0.0);
    let max_y = (area_height - height).max(0.0);
    (
        (x + offset.0).clamp(0.0, max_x),
        (y + offset.1).clamp(0.0, max_y),
    )
}

/// The anchor and offset a user set in the environment, over what the app chose:
/// `RN_GPUI_TRAY_POPOVER_ANCHOR` (`top-right`, …) and `RN_GPUI_TRAY_POPOVER_OFFSET`
/// (`x,y` in points).
pub fn with_environment(anchor: Anchor, offset: (f32, f32)) -> (Anchor, (f32, f32)) {
    let anchor = std::env::var("RN_GPUI_TRAY_POPOVER_ANCHOR")
        .ok()
        .and_then(|text| Anchor::parse(&text))
        .unwrap_or(anchor);
    let offset = std::env::var("RN_GPUI_TRAY_POPOVER_OFFSET")
        .ok()
        .and_then(|text| {
            let (x, y) = text.split_once(',')?;
            Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
        })
        .unwrap_or(offset);
    (anchor, offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_reserved_edges_follow_from_the_work_area() {
        let gnome = reserved((1920.0, 1080.0), (67.0, 32.0, 1853.0, 1048.0));
        assert_eq!(
            gnome,
            Reserved {
                left: 67.0,
                top: 32.0,
                right: 0.0,
                bottom: 0.0
            }
        );
        let plasma = reserved((1920.0, 1080.0), (0.0, 0.0, 1920.0, 1034.0));
        assert_eq!(plasma.bottom, 46.0);
    }

    #[test]
    fn the_tray_is_at_the_end_of_the_thinnest_reserved_edge() {
        // A top panel with a dock on the left: the panel is the thinner.
        assert_eq!(
            auto_anchor(reserved((1920.0, 1080.0), (67.0, 32.0, 1853.0, 1048.0))),
            Anchor::TopRight
        );
        // A taskbar at the bottom.
        assert_eq!(
            auto_anchor(reserved((1920.0, 1080.0), (0.0, 0.0, 1920.0, 1034.0))),
            Anchor::BottomRight
        );
        // A panel on the left, with the tray at its bottom.
        assert_eq!(
            auto_anchor(reserved((1920.0, 1080.0), (48.0, 0.0, 1872.0, 1080.0))),
            Anchor::BottomLeft
        );
        // Nothing reserved: nowhere to be near.
        assert_eq!(auto_anchor(Reserved::default()), Anchor::Center);
    }

    #[test]
    fn a_popover_sits_in_its_corner_and_stays_inside() {
        let none = Reserved::default();
        let area = (1853.0, 1048.0);
        let size = (320.0, 200.0);
        assert_eq!(
            place(Anchor::TopRight, none, area, size, 8.0, (0.0, 0.0)),
            (1525.0, 8.0)
        );
        assert_eq!(
            place(Anchor::BottomLeft, none, area, size, 8.0, (0.0, 0.0)),
            (8.0, 840.0)
        );
        // An offset moves it, and a huge one is stopped at the edge.
        assert_eq!(
            place(Anchor::TopRight, none, area, size, 8.0, (-50.0, 10.0)),
            (1475.0, 18.0)
        );
        assert_eq!(
            place(Anchor::TopLeft, none, area, size, 8.0, (-500.0, -500.0)),
            (0.0, 0.0)
        );
        // Bigger than the area: pinned to its start.
        assert_eq!(
            place(
                Anchor::BottomRight,
                none,
                (200.0, 100.0),
                size,
                8.0,
                (0.0, 0.0)
            ),
            (0.0, 0.0)
        );
    }

    #[test]
    fn an_anchor_is_read_from_text() {
        assert_eq!(Anchor::parse("Top-Right"), Some(Anchor::TopRight));
        assert_eq!(Anchor::parse("auto"), Some(Anchor::Auto));
        assert_eq!(Anchor::parse("middle"), None);
    }
}
