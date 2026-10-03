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
$platformBin = Join-Path $repoRoot "packages\react-native-gpui\bin\win32-x64"
$compilerBin = Join-Path $repoRoot "packages\@react-native-gpui\cli\bin\hermesc\win32-x64"

foreach ($tool in @("cmake", "ninja")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required build tool not found: $tool. Install CMake/Ninja and run from a Visual Studio Developer PowerShell."
  }
}
if (-not (Test-Path (Join-Path $HermesSource "CMakeLists.txt"))) {
  throw "Hermes source checkout not found: $HermesSource"
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

New-Item -ItemType Directory -Force -Path $platformBin, $compilerBin | Out-Null
Copy-Item $vm.FullName (Join-Path $platformBin "libhermesvm.dll") -Force
Copy-Item $importLib.FullName (Join-Path $platformBin "hermesvm.lib") -Force
Copy-Item $hermesc.FullName (Join-Path $compilerBin "hermesc.exe") -Force
& (Join-Path $compilerBin "hermesc.exe") -version
if ($LASTEXITCODE -ne 0) { throw "The staged hermesc failed its version check ($LASTEXITCODE)." }
Write-Host "Staged win32-x64 Hermes VM: $platformBin\libhermesvm.dll"
Write-Host "Staged win32-x64 Hermes compiler: $compilerBin\hermesc.exe"
