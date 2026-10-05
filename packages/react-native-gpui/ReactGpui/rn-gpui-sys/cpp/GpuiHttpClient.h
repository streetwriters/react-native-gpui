// TODO 2.1 — design doc §18.7. A libcurl-backed HTTP client.
//
// ReactHost's constructor throws std::runtime_error("No HttpClientFactory
// provided") unless the ContextContainer carries an HttpClientFactory, but
// ReactCxxPlatform only ships the *WebSocket* factory for the cxx platform
// (react/http/platform/cxx/WebSocketClient.cpp) — there is no
// `getHttpClientFactory()` implementation anywhere in ReactCommon or the
// vendored platform.
//
// The implementation below covers what the RN C++ runtime actually asks of an
// HTTP client today: `DevServerHelper::downloadBundleResourceSync()` issues a
// single GET and resolves a promise from the callbacks, so the contract that
// matters is "one onBody() with the whole response, then
// onResponseComplete("", false)".
#pragma once

#include <react/http/IHttpClient.h>
#include <cstdint>

namespace rngpui {

facebook::react::HttpClientFactory gpui_http_client_factory();
bool gpui_http_client_clear_cookies();
extern "C" uint64_t rn_gpui_http_requests_in_flight() noexcept;
extern "C" uint64_t rn_gpui_http_requests_not_ignored(
    const char* newline_separated_patterns) noexcept;

} // namespace rngpui
