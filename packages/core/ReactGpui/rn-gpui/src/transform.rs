//! Draws and hit-tests a node's subtree under the 2D matrix of its `transform`.

use gpui::{
    AnyElement, App, Bounds, Element, ElementId, GlobalElementId, InspectorElementId, IntoElement,
    LayoutId, Pixels, TransformationMatrix, Window,
};

/// The affine part of a Fabric transform, `None` when it is the identity.
///
/// Fabric's matrix is column-vector-free: `x' = m0 x + m4 y + m12`,
/// `y' = m1 x + m5 y + m13`. Rows of depth and perspective are dropped.
pub(crate) fn affine(matrix: &[f32; 16]) -> Option<TransformationMatrix> {
    if matrix.iter().any(|value| !value.is_finite()) {
        return None;
    }
    let affine = TransformationMatrix {
        rotation_scale: [[matrix[0], matrix[4]], [matrix[1], matrix[5]]],
        translation: [matrix[12], matrix[13]],
    };
    (affine != TransformationMatrix::unit()).then_some(affine)
}

/// Whether the matrix reaches outside the plane (perspective, or a turn about
/// the x or y axis), which a 2D affine matrix cannot show.
pub(crate) fn is_three_dimensional(matrix: &[f32; 16]) -> bool {
    [
        matrix[2], matrix[3], matrix[6], matrix[7], matrix[8], matrix[9], matrix[11], matrix[14],
    ]
    .into_iter()
    .any(|value| value.abs() > 0.0001)
        || (matrix[10] - 1.0).abs() > 0.0001
        || (matrix[15] - 1.0).abs() > 0.0001
}

/// `child` drawn under `matrix`, turned about the child's own top-left corner.
pub(crate) struct Transformed {
    child: AnyElement,
    matrix: TransformationMatrix,
}

impl Transformed {
    pub(crate) fn new(child: AnyElement, matrix: TransformationMatrix) -> Self {
        Self { child, matrix }
    }
}

impl IntoElement for Transformed {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for Transformed {
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
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        let (matrix, child) = (self.matrix, &mut self.child);
        window.with_transformation_about(bounds.origin, matrix, |window| {
            child.prepaint(window, cx);
        });
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        _prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let (matrix, child) = (self.matrix, &mut self.child);
        window.with_transformation_about(bounds.origin, matrix, |window| {
            child.paint(window, cx);
        });
    }
}
