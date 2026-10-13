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
  [int]$Jobs = [Environment]::ProcessorCount
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

# Applies every patches\*.patch to the Hermes checkout before configuring it, the
# way scripts/build-hermes-linux.sh does. A patch that is already applied is
# skipped so a re-run after a failed build does not stop on it. A patch that
# neither applies nor is present is an error: a silently unpatched build produces
# binaries that look right and fail at run time.
function Invoke-HermesPatches {
  param([string]$Source)

  $patchDir = Join-Path $repoRoot "packages\@react-native-gpui\hermes\patches"
  if (-not (Test-Path $patchDir)) {
    throw "Hermes patch directory not found: $patchDir"
  }
  $patches = Get-ChildItem -Path $patchDir -Filter "*.patch" | Sort-Object Name
  if ($patches.Count -eq 0) {
    Write-Host "No Hermes patches to apply"
    return
  }
  foreach ($patch in $patches) {
    # --check is quiet on success and non-zero when the patch does not fit.
    & git -C $Source apply --check $patch.FullName 2>$null
    if ($LASTEXITCODE -eq 0) {
      & git -C $Source apply $patch.FullName
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to apply $($patch.Name) to $Source."
      }
      Write-Host "Applied $($patch.Name)"
      continue
    }
    # Not applicable as-is: it may already be applied. Reverse-check tells the
    # two apart, so a re-run is safe while a genuinely broken patch still fails.
    & git -C $Source apply --reverse --check $patch.FullName 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "$($patch.Name) is already applied"
      continue
    }
    throw "$($patch.Name) does not apply to $Source and is not already applied. The Hermes checkout is probably at the wrong commit."
  }
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

Invoke-HermesPatches -Source $HermesSource

# Hermes' CMakeLists requires a Python interpreter ("Please install Python or
# specify the PYTHON_EXECUTABLE CMake variable") to generate its bytecode
# instruction tables. Windows has no python on PATH by default, and the
# `WindowsApps\python.exe` stub a store install leaves behind is not a real
# interpreter, so probe rather than trusting `Get-Command`.
function Find-Python {
  if ($env:PYTHON_EXECUTABLE -and (Test-Path $env:PYTHON_EXECUTABLE)) {
    return $env:PYTHON_EXECUTABLE
  }
  $candidates = @()
  $candidates += (Get-Command python, python3 -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -notmatch 'WindowsApps' } |
    Select-Object -ExpandProperty Source)
  $candidates += "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
  $candidates += "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
  $candidates += "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
  $candidates += "C:\Python313\python.exe"
  $candidates += "C:\Python312\python.exe"
  foreach ($candidate in $candidates) {
    if (-not $candidate -or -not (Test-Path $candidate)) { continue }
    # A real interpreter prints a version; the store stub prints nothing and
    # exits non-zero.
    $version = & $candidate -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    if ($LASTEXITCODE -eq 0 -and $version) {
      return (Resolve-Path $candidate).Path
    }
  }
  return $null
}

$python = Find-Python
if (-not $python) {
  throw "No Python interpreter found. Hermes' build requires one; set PYTHON_EXECUTABLE to a real python.exe (the WindowsApps stub is not one)."
}
Write-Host "Using Python: $python"

$configureArgs = @(
  "-S", $HermesSource,
  "-B", $HermesBuild,
  "-G", $Generator,
  "-DCMAKE_BUILD_TYPE=Release",
  # Hermes uses `find_package(Python COMPONENTS Interpreter)`, which reads
  # `Python_EXECUTABLE`. Its own error message still names the older
  # `PYTHON_EXECUTABLE`, so both are passed; setting only that older spelling
  # leaves CMake reporting "Could NOT find Python".
  "-DPython_EXECUTABLE=$python",
  "-DPYTHON_EXECUTABLE=$python",
  "-DHERMES_ENABLE_NAPI=ON",
  "-DHERMES_ENABLE_DEBUGGER=ON",
  "-DHERMES_ENABLE_TEST_SUITE=OFF",
  "-DHERMES_ENABLE_INTL=OFF"
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

Write-Host "Artifacts: $platformBin\{hermesvm.dll,hermesvm.lib,hermesc.exe}"