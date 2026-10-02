#pragma once

#include <memory>

namespace facebook::react {
class CallInvoker;
class TurboModule;
}

namespace rngpui {

std::shared_ptr<facebook::react::TurboModule> make_cpp_example_turbo_module(
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

} // namespace rngpui
