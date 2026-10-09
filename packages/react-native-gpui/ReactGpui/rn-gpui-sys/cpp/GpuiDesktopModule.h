#pragma once

#include <memory>
#include <string>

namespace facebook::react {
class CallInvoker;
class TurboModule;
} // namespace facebook::react

namespace rngpui {
std::shared_ptr<facebook::react::TurboModule> create_gpui_desktop_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

void reject_pending_desktop_calls();

} // namespace rngpui
