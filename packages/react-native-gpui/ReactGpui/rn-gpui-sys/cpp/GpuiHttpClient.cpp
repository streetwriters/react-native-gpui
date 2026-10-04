// TODO 2.1 — design doc §18.7 / §19 2.1. A libcurl-backed HTTP client; see the
// header for why the process needs one at all.
#include "GpuiHttpClient.h"

#include <curl/curl.h>

#include <folly/io/IOBuf.h>
#include <glog/logging.h>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace rngpui {

namespace {

using namespace facebook::react;

// curl_global_init() is not thread-safe and has to run before any other libcurl
// call, so every client construction goes through call_once().
void ensureCurlInitialized() {
  static std::once_flag once;
  std::call_once(once, []() { curl_global_init(CURL_GLOBAL_DEFAULT); });
}

// Shared by the worker thread and the token handed back to the caller: cancel()
// can be called from any thread at any time.
struct Cancellation {
  std::atomic<bool> cancelled{false};
};

class CurlRequestToken final : public http::IRequestToken {
 public:
  explicit CurlRequestToken(std::shared_ptr<Cancellation> cancellation)
      : cancellation_(std::move(cancellation)) {}

  void cancel() noexcept override {
    cancellation_->cancelled.store(true, std::memory_order_relaxed);
  }

 private:
  std::shared_ptr<Cancellation> cancellation_;
};

// Everything libcurl writes into during one transfer. The detached worker
// thread owns it for the whole request.
struct Transfer {
  std::shared_ptr<Cancellation> cancellation;
  http::NetworkCallbacks callbacks;
  std::string body;
  http::Headers responseHeaders;
  int64_t receivedBytes{0};
  int64_t totalBytes{-1};
};

bool isCancelled(const Transfer& transfer) {
  return transfer.cancellation->cancelled.load(std::memory_order_relaxed);
}

// Returning a short count makes libcurl abort the transfer with
// CURLE_WRITE_ERROR, which is how cancellation interrupts a download in
// progress.
size_t writeCallback(char* data, size_t size, size_t count, void* userData) {
  auto& transfer = *static_cast<Transfer*>(userData);
  if (isCancelled(transfer)) {
    return 0;
  }

  const auto length = static_cast<int64_t>(size * count);

  // `sendIncrementalUpdates` asks for the body as it arrives instead of one
  // buffer at the end; the two delivery styles are mutually exclusive.
  if (transfer.callbacks.sendIncrementalUpdates &&
      transfer.callbacks.onBodyIncremental) {
    const int64_t consumed = transfer.callbacks.onBodyIncremental(
        transfer.receivedBytes,
        transfer.totalBytes,
        folly::IOBuf::copyBuffer(data, static_cast<size_t>(length)));
    if (consumed < length) {
      return 0;
    }
  } else {
    transfer.body.append(data, static_cast<size_t>(length));
  }

  transfer.receivedBytes += length;
  if (transfer.callbacks.sendProgressUpdates &&
      transfer.callbacks.onBodyProgress) {
    transfer.callbacks.onBodyProgress(
        transfer.receivedBytes, transfer.totalBytes);
  }
  return size * count;
}

// libcurl hands the header block over one line at a time, status line first and
// a blank line last.
size_t headerCallback(char* data, size_t size, size_t count, void* userData) {
  auto& transfer = *static_cast<Transfer*>(userData);
  const size_t length = size * count;
  const std::string_view line(data, length);

  if (isCancelled(transfer)) {
    return 0;
  }
  if (line == "\r\n" || line == "\n") {
    return length; // End of the response header block.
  }

  const size_t colon = line.find(':');
  if (colon != std::string_view::npos) {
    std::string_view name = line.substr(0, colon);
    std::string_view value = line.substr(colon + 1);
    while (!value.empty() && (value.front() == ' ' || value.front() == '\t')) {
      value.remove_prefix(1);
    }
    while (
        !value.empty() &&
        (value.back() == '\r' || value.back() == '\n' || value.back() == ' ')) {
      value.remove_suffix(1);
    }
    transfer.responseHeaders.emplace_back(
        std::string(name), std::string(value));
  }
  return length;
}

// The callback that keeps cancellation responsive between writes and, as a
// side effect, tells us the expected body size for progress reporting.
int progressCallback(
    void* userData,
    curl_off_t dltotal,
    curl_off_t /*dlnow*/,
    curl_off_t /*ultotal*/,
    curl_off_t /*ulnow*/) {
  auto& transfer = *static_cast<Transfer*>(userData);
  if (dltotal > 0) {
    transfer.totalBytes = static_cast<int64_t>(dltotal);
  }
  return isCancelled(transfer) ? 1 : 0; // Non-zero aborts the transfer.
}

struct CurlHandle {
  CURL* handle{nullptr};
  curl_slist* headers{nullptr};

  ~CurlHandle() {
    curl_slist_free_all(headers);
    if (handle != nullptr) {
      curl_easy_cleanup(handle);
    }
  }
};

void performRequest(
    Transfer transfer,
    const std::string& method,
    const std::string& url,
    const http::Headers& requestHeaders,
    const http::Body& requestBody,
    uint32_t timeout) {
  const auto complete = [&transfer](std::string error, bool timeoutError) {
    if (transfer.callbacks.onResponseComplete) {
      transfer.callbacks.onResponseComplete(std::move(error), timeoutError);
    }
  };

  CurlHandle curl;
  curl.handle = curl_easy_init();
  if (curl.handle == nullptr) {
    complete("libcurl: could not create an easy handle", false);
    return;
  }

  for (const auto& [name, value] : requestHeaders) {
    const std::string line = name + ": " + value;
    curl.headers = curl_slist_append(curl.headers, line.c_str());
  }

  curl_easy_setopt(curl.handle, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl.handle, CURLOPT_USERAGENT, "react-native-gpui/0.1");
  curl_easy_setopt(curl.handle, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl.handle, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl.handle, CURLOPT_ACCEPT_ENCODING, "");
  curl_easy_setopt(curl.handle, CURLOPT_WRITEFUNCTION, writeCallback);
  curl_easy_setopt(curl.handle, CURLOPT_WRITEDATA, &transfer);
  curl_easy_setopt(curl.handle, CURLOPT_HEADERFUNCTION, headerCallback);
  curl_easy_setopt(curl.handle, CURLOPT_HEADERDATA, &transfer);
  curl_easy_setopt(curl.handle, CURLOPT_NOPROGRESS, 0L);
  curl_easy_setopt(curl.handle, CURLOPT_XFERINFOFUNCTION, progressCallback);
  curl_easy_setopt(curl.handle, CURLOPT_XFERINFODATA, &transfer);
  if (curl.headers != nullptr) {
    curl_easy_setopt(curl.handle, CURLOPT_HTTPHEADER, curl.headers);
  }
  if (timeout > 0) {
    // The interface documents a timeout in seconds, 0 meaning "no timeout".
    curl_easy_setopt(curl.handle, CURLOPT_TIMEOUT, static_cast<long>(timeout));
  }
  if (method != "GET" && method != "get") {
    curl_easy_setopt(curl.handle, CURLOPT_CUSTOMREQUEST, method.c_str());
  }
  if (requestBody.string.has_value()) {
    curl_easy_setopt(
        curl.handle, CURLOPT_POSTFIELDS, requestBody.string->data());
    curl_easy_setopt(
        curl.handle,
        CURLOPT_POSTFIELDSIZE_LARGE,
        static_cast<curl_off_t>(requestBody.string->size()));
  }

  const CURLcode result = curl_easy_perform(curl.handle);

  long responseCode = 0;
  curl_easy_getinfo(curl.handle, CURLINFO_RESPONSE_CODE, &responseCode);
  curl_easy_cleanup(curl.handle);
  curl.handle = nullptr;

  if (isCancelled(transfer)) {
    complete("Request cancelled", false);
    return;
  }
  if (result != CURLE_OK) {
    const auto error = curl_easy_strerror(result);
    LOG(ERROR) << "[gpui-http] " << method << " " << url
               << " failed: " << error;
    complete(error, result == CURLE_OPERATION_TIMEDOUT);
    return;
  }

  const auto statusCode = static_cast<uint16_t>(responseCode);
  if (transfer.callbacks.onResponse) {
    transfer.callbacks.onResponse(statusCode, transfer.responseHeaders);
  }
  if (responseCode < 200 || responseCode >= 300) {
    // Deliberately no onBody(): a caller such as downloadBundleResourceSync()
    // treats the body as the script to load, and an error page is not a script.
    const auto error = "HTTP " + std::to_string(responseCode) + " from " + url;
    LOG(ERROR) << "[gpui-http] " << method << " " << url
               << " failed: " << error;
    complete(error, false);
    return;
  }

  if (transfer.callbacks.onBody && !transfer.callbacks.sendIncrementalUpdates) {
    transfer.callbacks.onBody(folly::IOBuf::copyBuffer(transfer.body));
  }
  complete("", false);
}

class CurlHttpClient final : public IHttpClient {
 public:
  std::unique_ptr<http::IRequestToken> sendRequest(
      http::NetworkCallbacks&& callbacks,
      const std::string& method,
      const std::string& url,
      const http::Headers& headers = {},
      const http::Body& body = {},
      uint32_t timeout = 0,
      std::optional<std::string> /*loggingId*/ = std::nullopt) override {
    ensureCurlInitialized();

    auto cancellation = std::make_shared<Cancellation>();
    Transfer transfer;
    transfer.cancellation = cancellation;
    transfer.callbacks = std::move(callbacks);

    // The request runs to completion on its own thread: callers block on a
    // future that these callbacks resolve, so the request must not occupy the
    // calling thread.
    std::thread(
        performRequest,
        std::move(transfer),
        method,
        url,
        headers,
        body,
        timeout)
        .detach();

    return std::make_unique<CurlRequestToken>(std::move(cancellation));
  }
};

} // namespace

HttpClientFactory gpui_http_client_factory() {
  return []() -> std::unique_ptr<IHttpClient> {
    return std::make_unique<CurlHttpClient>();
  };
}

} // namespace rngpui
