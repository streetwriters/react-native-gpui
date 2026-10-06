# Builds the desktop Hermes VM and compiler for Windows x64 and stages them into
# packages\@react-native-gpui\hermes\bin\win32-x64\.
#
# Prefer the hermes-engine GitHub workflow; this script is the local/offline
# path and expects a facebook/hermes checkout at the commit pinned in
# packages\@react-native-gpui\hermes\package.json.
param(
  [string]$HermesSource = $env:RN_GPUI_HERMES_SOURCE_DIR,
  [string]$HermesBuild = $env:RN_GPUI_HERMES_BUILD_DIR,
  [string]$Generator = "Ninja",
  [int]$Jobs = [Environment]::ProcessorCount
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $HermesSource) { $HermesSource = Join-Path (Split-Path $repoRoot -Parent) "hermes\hermes" }
if (-not $HermesBuild) { $HermesBuild = Join-Path (Split-Path $HermesSource -Parent) "build-gpui-windows-x64-release" }
$HermesSource = (Resolve-Path $HermesSource).Path
$platform = "win32-x64"
$platformBin = Join-Path $repoRoot "packages\@react-native-gpui\hermes\bin\$platform"

foreach ($tool in @("cmake", "ninja")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required build tool not found: $tool. Install CMake/Ninja and run from a Visual Studio Developer PowerShell."
  }
}
if (-not (Test-Path (Join-Path $HermesSource "CMakeLists.txt"))) {
  throw "Hermes source checkout not found: $HermesSource"
}

$packageJson = Join-Path $repoRoot "packages\@react-native-gpui\hermes\package.json"
$pinnedCommit = (Get-Content $packageJson -Raw | ConvertFrom-Json).hermes.commit
if (Test-Path (Join-Path $HermesSource ".git")) {
  $headCommit = (& git -C $HermesSource rev-parse HEAD).Trim()
  if ($headCommit -ne $pinnedCommit) {
    Write-Warning "Hermes checkout is at $headCommit but the package pins $pinnedCommit."
  }
}

cmake -S $HermesSource -B $HermesBuild -G $Generator `
  -DCMAKE_BUILD_TYPE=Release `
  -DHERMES_ENABLE_NAPI=ON `
  -DHERMES_ENABLE_DEBUGGER=ON `
  -DHERMES_ENABLE_TEST_SUITE=OFF
if ($LASTEXITCODE -ne 0) { throw "Hermes CMake configuration failed ($LASTEXITCODE)." }
cmake --build $HermesBuild --config Release --target hermesvm hermesc --parallel $Jobs
if ($LASTEXITCODE -ne 0) { throw "Hermes build failed ($LASTEXITCODE)." }

# CMake puts the shared runtime in lib/ and command-line tools in bin/<config>
# for multi-config generators (or directly in bin/ with Ninja).
$vm = Get-ChildItem -Path $HermesBuild -Filter "hermesvm.dll" -File -Recurse | Select-Object -First 1
$importLib = Get-ChildItem -Path $HermesBuild -Filter "hermesvm.lib" -File -Recurse | Select-Object -First 1
$hermesc = Get-ChildItem -Path (Join-Path $HermesBuild "bin") -Filter "hermesc.exe" -File -Recurse | Select-Object -First 1
if (-not $vm -or -not $importLib -or -not $hermesc) {
  throw "Could not find hermesvm.dll, hermesvm.lib, and hermesc.exe under $HermesBuild."
}

New-Item -ItemType Directory -Force -Path $platformBin | Out-Null
Copy-Item $vm.FullName (Join-Path $platformBin "hermesvm.dll") -Force
Copy-Item $importLib.FullName (Join-Path $platformBin "hermesvm.lib") -Force
Copy-Item $hermesc.FullName (Join-Path $platformBin "hermesc.exe") -Force
Get-ChildItem -Path (Split-Path $hermesc.FullName) -Filter "*.dll" |
  Copy-Item -Destination $platformBin -Force
& (Join-Path $platformBin "hermesc.exe") -version
if ($LASTEXITCODE -ne 0) { throw "The staged hermesc failed its version check ($LASTEXITCODE)." }
Write-Host "Artifacts: $platformBin\{hermesvm.dll,hermesvm.lib,hermesc.exe}"