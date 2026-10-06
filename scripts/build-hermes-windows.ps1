# Builds the desktop Hermes VM and compiler for Windows and stages them into
# packages\@react-native-gpui\hermes\bin\win32-<arch>\.
#
# Prefer the hermes-engine GitHub workflow; this script is the local/offline
# path and expects a facebook/hermes checkout at the commit pinned in
# packages\@react-native-gpui\hermes\package.json.
#
#   .\scripts\build-hermes-windows.ps1                  # host architecture
#   .\scripts\build-hermes-windows.ps1 -Arch arm64      # on an ARM64 machine
#   .\scripts\build-hermes-windows.ps1 -SkipIntlCheck   # skip the Intl smoke test
#
# The MSVC environment is set up by the script itself, so it does not have to be
# run from a Visual Studio Developer PowerShell. That matters: CMake otherwise
# picks up whichever compiler it finds first, and an MSYS2 GCC on PATH produces
# MinGW import libraries that break the build.
param(
  [string]$HermesSource = $env:RN_GPUI_HERMES_SOURCE_DIR,
  [string]$HermesBuild = $env:RN_GPUI_HERMES_BUILD_DIR,
  [ValidateSet("x64", "arm64")]
  [string]$Arch = $(if ($env:RN_GPUI_HERMES_ARCH) {
      $env:RN_GPUI_HERMES_ARCH
    } elseif ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
      "arm64"
    } else {
      "x64"
    }),
  [string]$Generator = "Ninja",
  [int]$Jobs = [Environment]::ProcessorCount,
  [switch]$SkipIntlCheck
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $HermesSource) { $HermesSource = Join-Path (Split-Path $repoRoot -Parent) "hermes\hermes" }
if (-not $HermesBuild) { $HermesBuild = Join-Path (Split-Path $HermesSource -Parent) "build-gpui-windows-$Arch-release" }
$HermesSource = (Resolve-Path $HermesSource).Path
$platform = "win32-$Arch"
$platformBin = Join-Path $repoRoot "packages\@react-native-gpui\hermes\bin\$platform"

foreach ($tool in @("cmake", "ninja")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required build tool not found: $tool. Install CMake and Ninja."
  }
}
if (-not (Test-Path (Join-Path $HermesSource "CMakeLists.txt"))) {
  throw "Hermes source checkout not found: $HermesSource"
}

$hostArch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
if ($Arch -ne $hostArch) {
  # lib/InternalJavaScript runs hermesc while the VM builds, so cross builds need
  # host binaries passed through -DIMPORT_HOST_COMPILERS, which this script does
  # not prepare. The hermes-engine workflow builds each architecture natively.
  throw "Cross-compiling win32-$Arch on a $hostArch host is not supported by this script."
}

# Import the MSVC environment for the requested architecture.
function Initialize-MsvcEnvironment {
  param([string]$TargetArch)

  $existing = Get-Command cl.exe -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Using the MSVC environment already on PATH: $($existing.Source)"
    return
  }

  $component = if ($TargetArch -eq "arm64") {
    "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
  } else {
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64"
  }
  $programFilesX86 = ${env:ProgramFiles(x86)}
  if (-not $programFilesX86) { $programFilesX86 = $env:ProgramFiles }
  $vswhere = Join-Path $programFilesX86 "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) {
    throw "vswhere.exe not found. Install Visual Studio with the 'Desktop development with C++' workload."
  }
  $instance = & $vswhere -latest -products * -requires $component -property installationPath
  if (-not $instance) { throw "No Visual Studio installation provides $component." }
  $version = & $vswhere -latest -products * -requires $component -property catalog_productDisplayVersion
  Write-Host "Using Visual Studio $version at $instance"

  $vcvars = Join-Path $instance "VC\Auxiliary\Build\vcvarsall.bat"
  if (-not (Test-Path $vcvars)) { throw "vcvarsall.bat not found at $vcvars" }
  cmd /c "`"$vcvars`" $TargetArch >nul 2>&1 && set" | ForEach-Object {
    $split = $_.IndexOf("=")
    if ($split -gt 0) {
      Set-Item -Path "env:$($_.Substring(0, $split))" -Value $_.Substring($split + 1)
    }
  }
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  if (-not $cl) { throw "cl.exe is not on PATH after running vcvarsall $TargetArch." }
  Write-Host "Using MSVC: $($cl.Source)"
}

# A Windows shared library also emits an import library, and Hermes registers the
# same addon name in both NAPI test suites (test_exception, test_finalizer,
# test_general). Without an archive directory both copies write the same file,
# which Ninja rejects with "multiple rules generate <path>". The Visual Studio
# generator tolerates it; one archive directory per addon works for either.
function Repair-NodeApiTestAddons {
  param([string]$Source)

  $path = Join-Path $Source "external\node-api-tests\hermes\CMakeLists.txt"
  if (-not (Test-Path $path)) { throw "Missing $path" }
  $text = Get-Content -Path $path -Raw
  if ($text -match "ARCHIVE_OUTPUT_DIRECTORY") {
    Write-Host "The Node-API test addons already have their own archive directory"
    return
  }
  $needle = '    RUNTIME_OUTPUT_DIRECTORY_RELEASE ${ADDON_OUTPUT_DIR}'
  if (-not $text.Contains($needle)) {
    throw "Hermes changed $path; update the duplicate-output workaround in this script."
  }
  $addition = $needle + "`n    ARCHIVE_OUTPUT_DIRECTORY " + '${ADDON_OUTPUT_DIR}'
  Set-Content -Path $path -Value $text.Replace($needle, $addition) -NoNewline
  Write-Host "Patched $path so every Node-API test addon archives into its own directory"
}

Initialize-MsvcEnvironment -TargetArch $Arch
Repair-NodeApiTestAddons -Source $HermesSource

$packageJson = Join-Path $repoRoot "packages\@react-native-gpui\hermes\package.json"
$pinnedCommit = (Get-Content $packageJson -Raw | ConvertFrom-Json).hermes.commit
if (Test-Path (Join-Path $HermesSource ".git")) {
  $headCommit = (& git -C $HermesSource rev-parse HEAD).Trim()
  if ($headCommit -ne $pinnedCommit) {
    Write-Warning "Hermes checkout is at $headCommit but the package pins $pinnedCommit."
  }
}

$configureArgs = @(
  "-S", $HermesSource,
  "-B", $HermesBuild,
  "-G", $Generator,
  "-DCMAKE_BUILD_TYPE=Release",
  "-DHERMES_ENABLE_NAPI=ON",
  "-DHERMES_ENABLE_DEBUGGER=ON",
  "-DHERMES_ENABLE_TEST_SUITE=OFF",
  "-DHERMES_ENABLE_INTL=ON"
)
if ($Generator -eq "Ninja") {
  # Pin the compiler so a missing MSVC environment fails loudly instead of
  # silently configuring a non-MSVC toolchain found on PATH.
  $configureArgs += @("-DCMAKE_C_COMPILER=cl", "-DCMAKE_CXX_COMPILER=cl")
}
& cmake @configureArgs
if ($LASTEXITCODE -ne 0) { throw "Hermes CMake configuration failed ($LASTEXITCODE)." }

$cache = Get-Content (Join-Path $HermesBuild "CMakeCache.txt") -Raw
if ($cache -notmatch "cl\.exe") {
  throw "CMake did not configure an MSVC toolchain. Run this script from a Visual Studio Developer PowerShell."
}

& cmake --build $HermesBuild --config Release --target hermesvm hermesc hermes --parallel $Jobs
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

# The same check the hermes-engine workflow runs, so a build that links without
# working Intl cannot pass locally either.
if (-not $SkipIntlCheck) {
  $hermes = Get-ChildItem -Path (Join-Path $HermesBuild "bin") -Filter "hermes.exe" -File -Recurse | Select-Object -First 1
  if (-not $hermes) { throw "Could not find hermes.exe under $HermesBuild to verify Intl." }
  $smokeSource = @'
const number = new Intl.NumberFormat('en-US').format(1234.5);
const date = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(0);
const order = new Intl.Collator('en-US').compare('a', 'b');
print('Intl.NumberFormat en-US 1234.5 -> ' + number);
print('Intl.DateTimeFormat en-US 0 -> ' + date);
if (number !== '1,234.5') throw new Error('unexpected number format: ' + number);
if (date.indexOf('January') !== 0 || date.indexOf('1970') < 0) {
  throw new Error('unexpected date format: ' + date);
}
if (order >= 0) throw new Error('unexpected collation order: ' + order);
print('Intl OK');
'@
  $smoke = Join-Path ([System.IO.Path]::GetTempPath()) "rn-gpui-intl-smoke.js"
  Set-Content -Path $smoke -Value $smokeSource -Encoding ascii
  & $hermes.FullName $smoke
  if ($LASTEXITCODE -ne 0) { throw "The Intl smoke test failed ($LASTEXITCODE)." }
  Remove-Item $smoke -Force
}

Write-Host "Artifacts: $platformBin\{hermesvm.dll,hermesvm.lib,hermesc.exe}"