// The proxy and DNS settings the HTTP client applies to each request.
#pragma once

#include <curl/curl.h>
#include <cstdint>
#include <string>
#include "rust/cxx.h"

namespace rngpui {

// Replaces the settings. `mode` is "system", "direct" or "fixed"; `rules` is a
// proxy URL or Chromium proxy rules and `bypass` a Chromium bypass list, both
// read only in "fixed" mode; `doh` is a list of DNS-over-HTTPS URLs, one per
// line, empty for the system resolver. Returns an error message, or an empty
// string.
rust::String rn_gpui_network_configure(
    rust::Str mode,
    rust::Str rules,
    rust::Str bypass,
    rust::Str doh);

// The proxy a request to `url` goes through, as "DIRECT" or the proxy's URL.
rust::String rn_gpui_network_proxy_for(rust::Str url);

// Sets the proxy and resolver options of one request.
void applyNetworkConfig(CURL* handle, const std::string& url);

// After a request failed to resolve its host: moves it to the next
// DNS-over-HTTPS server, and after the last one to the system resolver.
// `attempt` counts the servers tried and starts at 0. Returns false when there
// is nothing left to try, or no server is set.
bool fallBackResolver(CURL* handle, size_t& attempt);

} // namespace rngpui
