// TODO 1.7 — design doc §18.7.
//
// ReactHost's constructor throws std::runtime_error("No HttpClientFactory
// provided") unless the ContextContainer carries an HttpClientFactory, but
// ReactCxxPlatform only ships the *WebSocket* factory for the cxx platform
// (react/http/platform/cxx/WebSocketClient.cpp) — there is no
// `getHttpClientFactory()` implementation anywhere in ReactCommon or the
// vendored platform.
//
// Metro needs a real HTTP client in TODO 2.1; until then every request fails
// fast so callers such as DevServerHelper::downloadBundleResourceSync() reject
// their promise and ReactHost::loadScript() falls back to the bundle file.
#pragma once

#include <react/http/IHttpClient.h>

namespace rngpui {

facebook::react::HttpClientFactory gpui_http_client_factory();

} // namespace rngpui
