import React, { useEffect, useState } from "react";
import { AppRegistry, Text, View } from "react-native";
import NativeFixture from "@react-native-gpui/native-module-fixture";

/** Verify native/GPUI z-ordering; the GPUI probe control owns toggling. */
export default function Phase4CompositionProbe() {
  const [autolinkResult, setAutolinkResult] = useState("loading");
  useEffect(() => {
    console.log("[phase4-composition] native composition probe mounted");
    try {
      const linkedResult = NativeFixture.greet("GPUI");
      console.log(`[rust-autolink] ${linkedResult}`);
      setAutolinkResult(linkedResult);
    } catch (error) {
      console.error("[rust-turbomodule] call failed", error);
      setAutolinkResult("not called");
    }
  }, []);

  return (
    <View style={{ flex: 1, padding: 24, gap: 10, backgroundColor: "#f3f4f6" }}>
      <Text style={{ fontSize: 22 }}>Phase 4: native layer composition</Text>
      <Text>
        A native view occupies the lower region. Use the GPUI control below this
        text to show or hide an overlay above the native surface.
      </Text>
      <Text>
        Resize the window: the native surface should stay below this text and
        track the lower region's changing width and height.
      </Text>
      <Text>Autolinked Rust TurboModule: {autolinkResult}</Text>
    </View>
  );
}

AppRegistry.registerComponent(
  "Phase4CompositionProbe",
  () => Phase4CompositionProbe,
);
