// The active JS engine's tooling hooks (plan item 7.14).
//
// An engine package declares `platforms.gpui.jsEngine` in its
// react-native.config.js and may point at a `bundle.js` with Metro and bundling
// hooks. Autolink records the installed engines in
// `desktop/autolink/autolink.json`; this module turns that into the module the
// CLI and metro.config.js consume, so neither of them knows an engine by name.
//
// Everything here is best effort before autolink has run: no manifest means no
// engine hooks, which leaves Metro's defaults in place.
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_PATH = ['desktop', 'autolink', 'autolink.json'];

/** Every installed engine, in autolink order. */
function installedJsEngines(projectRoot) {
  const manifestPath = path.join(projectRoot, ...MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Array.isArray(manifest.jsEngines) ? manifest.jsEngines : [];
  } catch {
    return [];
  }
}

/**
 * The engine this run uses, mirroring the runtime's selection: the
 * `RN_GPUI_JS_ENGINE` override, otherwise the only installed engine. Returns
 * null when the choice is ambiguous or nothing is installed, in which case the
 * runtime reports it.
 */
function activeJsEngine(projectRoot) {
  const engines = installedJsEngines(projectRoot);
  const requested = process.env.RN_GPUI_JS_ENGINE;
  if (requested) {
    return engines.find(engine => engine.name === requested) ?? null;
  }
  return engines.length === 1 ? engines[0] : null;
}

/**
 * The active engine's `bundle.js` module, or null when there is no active
 * engine or it declares no tooling hooks.
 */
function activeJsEngineBundle(projectRoot) {
  const engine = activeJsEngine(projectRoot);
  if (!engine || !engine.bundle) return null;
  // Absolute path: the manifest records where the package actually lives, which
  // may be a hoisted or linked install rather than the app's own node_modules.
  return require(engine.bundle);
}

/** The bundle file name the runtime loads, e.g. '.hbc'. Defaults to '.js'. */
function activeJsEngineBundleExtension(projectRoot) {
  const bundle = activeJsEngineBundle(projectRoot);
  return typeof bundle?.bundleExtension === 'string'
    ? bundle.bundleExtension
    : '.js';
}

module.exports = {
  installedJsEngines,
  activeJsEngine,
  activeJsEngineBundle,
  activeJsEngineBundleExtension,
};
