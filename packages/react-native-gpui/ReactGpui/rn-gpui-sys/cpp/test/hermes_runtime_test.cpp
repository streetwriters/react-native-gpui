// The prebuilt libhermesvm (from
// the hermes-engine Maven artifact, fetched by
// cmake/modules/ThirdParty.cmake) links into this test
// executable, which creates a Hermes runtime and evaluates
// a script through JSI.

#include <hermes/hermes.h>
#include <jsi/jsi.h>

#include <iostream>
#include <memory>

int main() {
  // Create the Hermes runtime — proves libhermesvm links
  // and initializes.
  auto runtime = facebook::hermes::makeHermesRuntime();

  // Evaluate a tiny script through JSI — proves the VM runs.
  auto script = std::make_shared<facebook::jsi::StringBuffer>("40 + 2");
  facebook::jsi::Value result =
      runtime->evaluateJavaScript(script, "hermes_runtime_test");

  std::cout << "hermes evaluated 40 + 2 = " << result.getNumber() << std::endl;
  return result.getNumber() == 42.0 ? 0 : 1;
}
