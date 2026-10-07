// Text measurement hook for the TextLayoutManager override (design doc §18.9).
//
// The override is compiled as part of ReactCommon, which must not see the cxx
// bridge headers (`rust/cxx.h`, `rn-gpui-sys/src/lib.rs.h`). It therefore calls
// through this plain C++ function-pointer table. GpuiHost installs the table at
// startup; the implementation wraps the Rust `rn_gpui_measure_text` call and
// lives in MountBatchBuilder.cpp next to the flattening code it shares.
#pragma once

#include <react/renderer/attributedstring/AttributedString.h>
#include <react/renderer/attributedstring/ParagraphAttributes.h>

namespace rngpui {

struct GpuiTextSize {
  float width;
  float height;
};

struct GpuiTextMeasureTable {
  GpuiTextSize (*measureParagraph)(
      const facebook::react::AttributedString& text,
      const facebook::react::ParagraphAttributes& attributes,
      float maxWidth,
      float maxHeight);
};

// Installed once by GpuiHost before any surface is started. Measuring before
// that falls back to a zero-sized paragraph, as the Rust side does when no
// measure handler is registered.
void setGpuiTextMeasureTable(const GpuiTextMeasureTable& table);
const GpuiTextMeasureTable* gpuiTextMeasureTable();

} // namespace rngpui
