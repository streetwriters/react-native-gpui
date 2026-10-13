/*
 * Vendored from node-gyp (nodejs/node-gyp, `src/win_delay_load_hook.cc`, MIT
 * licence — the same file npm's bundled node-gyp installs). Unmodified except
 * for this notice and the `HOST_BINARY` fallback, which node-gyp passes on the
 * compiler command line and this script may not.
 *
 * When this file is linked to a DLL, it sets up a delay-load hook that
 * intervenes when the DLL is trying to load the host executable
 * dynamically. Instead of trying to locate the .exe file it'll just
 * return a handle to the process image.
 *
 * This allows compiled addons to work when the host executable is renamed.
 */

#ifdef _MSC_VER

#pragma managed(push, off)

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>

#include <delayimp.h>
#include <string.h>

// node-gyp defines this from `process.execPath`'s basename. Any value works for
// this fixture, because the hook compares it against the delay-load entry this
// addon was linked with, which is also the name the fixture is built against.
#ifndef HOST_BINARY
#define HOST_BINARY "node.exe"
#endif

static FARPROC WINAPI load_exe_hook(unsigned int event, DelayLoadInfo* info) {
  HMODULE m;
  if (event != dliNotePreLoadLibrary)
    return NULL;

  if (_stricmp(info->szDll, HOST_BINARY) != 0)
    return NULL;

  // try for libnode.dll to compat node.js that using 'vcbuild.bat dll'
  m = GetModuleHandle(TEXT("libnode.dll"));
  if (m == NULL)
    m = GetModuleHandle(NULL);
  return (FARPROC)m;
}

decltype(__pfnDliNotifyHook2) __pfnDliNotifyHook2 = load_exe_hook;

#pragma managed(pop)

#endif
