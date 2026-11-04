## Installing dependencies

You will need Node, Rust, CMake, Perl, NASM and the Visual Studio C++ build tools.

React Native needs **Node.js 22.13 or newer**, and the desktop renderer is written in Rust, so you need **Rust 1.98 or newer** installed with [rustup](https://rustup.rs).

### Install the tools

We recommend installing the tools with [winget](https://learn.microsoft.com/windows/package-manager/winget/), which ships with current versions of Windows. Run the following commands in a PowerShell window:

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install -e --id Kitware.CMake
winget install -e --id StrawberryPerl.StrawberryPerl
winget install -e --id NASM.NASM
winget install -e --id Rustlang.Rustup
winget install -e --id OpenJS.NodeJS.LTS
```

| Tool                           | Used for                                               |
| ------------------------------ | ------------------------------------------------------ |
| Visual Studio 2022 Build Tools | The MSVC compiler, linker and Windows SDK              |
| CMake                          | Building React Native's C++ runtime and native modules |
| Strawberry Perl                | Building native dependencies                           |
| NASM                           | Building native dependencies                           |
| Rustup                         | The Rust toolchain that builds the renderer            |
| Node.js LTS                    | Metro and the React Native tooling (22.13 or newer)    |

### Configure `PATH`

Two things need a manual step:

- **Add NASM to `PATH`.** Its installer does not. Add `C:\Program Files\NASM` to your user `PATH`.
- **Keep Strawberry Perl ahead of Git's Perl.** Git for Windows ships its own `perl`, which cannot build the native dependencies. In your `PATH` settings, move the Strawberry Perl entry (`C:\Strawberry\perl\bin`) above `C:\Program Files\Git\usr\bin`, if the latter is present.

### Enable long paths

Native builds create deeply nested folders. Enable long paths once, from an **administrator** PowerShell:

```powershell
New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

Restart your machine afterwards. If Git is installed, also run `git config --system core.longpaths true`.

### Use the Developer PowerShell

Run every build from a **Developer PowerShell for VS 2022**. Open it from the Start menu, or from a normal PowerShell with:

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64
```

It sets up the compiler environment (`cl.exe`, `link.exe` and the Windows SDK paths) that the build expects.

## Verifying your setup

Open a new Developer PowerShell and run the doctor:

```powershell
npx @react-native-gpui/cli doctor
```

It checks every tool on this page and prints how to fix each one that is missing or misconfigured:

```text
Desktop development on Windows
 ✓ Node.js 22.20.0
 ✓ Rust 1.98.1
 ✓ Cargo 1.98.1
 ✓ CMake 3.31.4
 ✓ MSVC compiler
 ✖ Strawberry Perl: perl resolves to C:\Program Files\Git\usr\bin\perl.exe, not to Strawberry Perl
     Fix: Move C:\Strawberry\perl\bin above Git's usr\bin in PATH
 ✓ NASM 2.16.03
 ✓ Long paths

1 problem found.
```

Inside a React Native project, `npx react-native doctor-desktop` runs the same checks, and `npx react-native doctor` lists them in a **Desktop** section next to its own.

## Troubleshooting

- **`nasm` is not recognized**: `C:\Program Files\NASM` is not on `PATH`. Add it and open a new terminal.
- **`cl` is not recognized**: you are not in a Developer PowerShell. Open **Developer PowerShell for VS 2022**.
- **Perl errors during the build**: Git's Perl is found before Strawberry Perl. Reorder `PATH` as described above.
- **"Filename too long" errors**: long paths are not enabled yet. Enable them and restart.
