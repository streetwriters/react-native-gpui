// TODO 1.7 — design doc §18.7. A placeholder HTTP client; see the header.
#include "GpuiHttpClient.h"

#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <utility>

namespace rngpui {

namespace {

using namespace facebook::react;

class RequestToken final : public http::IRequestToken {
 public:
  void cancel() noexcept override {}
};

class FailingHttpClient final : public IHttpClient {
 public:
  std::unique_ptr<http::IRequestToken> sendRequest(
      http::NetworkCallbacks &&callbacks,
      const std::string &method,
      const std::string &url,
      const http::Headers & /*headers*/,
      const http::Body & /*body*/,
      uint32_t /*timeout*/,
      std::optional<std::string> /*loggingId*/) override {
    // Report the failure off the calling thread: callers block on a future that
    // this callback resolves (DevServerHelper::downloadBundleResourceSync does
    // exactly that), so failing synchronously could deadlock a caller that
    // holds a lock around sendRequest().
    std::thread([callbacks = std::move(callbacks), method, url]() mutable {
      if (callbacks.onResponseComplete) {
        callbacks.onResponseComplete(
            "rn-gpui: HTTP client not implemented yet (TODO 2.1): " + method + " " + url,
            /* timeoutError */ false);
      }
    }).detach();
    return std::make_unique<RequestToken>();
  }
};

} // namespace

HttpClientFactory gpui_http_client_factory() {
  return []() -> std::unique_ptr<IHttpClient> {
    return std::make_unique<FailingHttpClient>();
  };
}

} // namespace rngpui
