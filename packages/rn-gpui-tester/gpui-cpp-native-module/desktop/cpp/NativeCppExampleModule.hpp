#pragma once

#include <memory>
#include <string>

namespace facebook::react {
class CallInvoker;
class TurboModule;
} // namespace facebook::react

std::shared_ptr<facebook::react::TurboModule> create_cpp_example_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker);
