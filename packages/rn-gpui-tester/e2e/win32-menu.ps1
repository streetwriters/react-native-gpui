# Reads and activates the running app's real Win32 menu bar.
#
# The existing app-menu tests fire an accelerator key, which goes through
# `handle_accelerator` and never touches the native menu. This script goes
# through the menu Windows actually built: it reads the items with `GetMenu`,
# and activates one by sending the `WM_COMMAND` Windows sends for a selection.
# That is what proves a menu-bar item is wired to its action.
#
# UI Automation cannot do this part: a Win32 menu bar exposes `MenuItem`
# elements but neither `InvokePattern` nor `ExpandCollapsePattern`, so a UIA
# client can read the bar and not click it. `WM_COMMAND` is the documented
# contract for a menu selection, so it is used here.
#
# Prints one line per item:
#   ITEM|<menu>|<label>|<id>|enabled=<0|1>|checked=<0|1>
# and, when -InvokeLabel is given, `FIRED|<label>|<id>` after sending it.
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [string]$InvokeLabel = ''
)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

# `GetMenu` and friends, plus `SendMessageW` for the activation.
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Win32Menu {
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr hMenu, int pos);
  [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr hMenu);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetMenuStringW(IntPtr hMenu, int item, StringBuilder text,
    int maxCount, uint flags);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr hMenu, int pos);
  [DllImport("user32.dll")] public static extern uint GetMenuState(IntPtr hMenu, int item, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr hWnd, uint msg,
    IntPtr wParam, IntPtr lParam);
  public const uint MF_BYPOSITION = 0x400;
  public const uint WM_COMMAND = 0x0111;
}
'@

# The window is found by process id, the same way the accessibility fixture
# does, because the test does not know the HWND.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Win32Window {
  private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  public static IntPtr Find(uint processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, lParam) => {
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pid == processId && IsWindowVisible(hWnd)) { found = hWnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@

$hwnd = [IntPtr]::Zero
for ($attempt = 0; $attempt -lt 40 -and $hwnd -eq [IntPtr]::Zero; $attempt++) {
  Start-Sleep -Milliseconds 500
  $hwnd = [Win32Window]::Find([uint32]$ProcessId)
}
if ($hwnd -eq [IntPtr]::Zero) { Write-Output 'NO_WINDOW'; exit 1 }

$bar = [Win32Menu]::GetMenu($hwnd)
if ($bar -eq [IntPtr]::Zero) { Write-Output 'NO_MENU_BAR'; exit 2 }

$fired = $false
$topCount = [Win32Menu]::GetMenuItemCount($bar)
for ($i = 0; $i -lt $topCount; $i++) {
  $topText = New-Object System.Text.StringBuilder 128
  [void][Win32Menu]::GetMenuStringW($bar, $i, $topText, 127, [Win32Menu]::MF_BYPOSITION)
  $sub = [Win32Menu]::GetSubMenu($bar, $i)
  if ($sub -eq [IntPtr]::Zero) { continue }
  $subCount = [Win32Menu]::GetMenuItemCount($sub)
  for ($j = 0; $j -lt $subCount; $j++) {
    $itemText = New-Object System.Text.StringBuilder 128
    [void][Win32Menu]::GetMenuStringW($sub, $j, $itemText, 127, [Win32Menu]::MF_BYPOSITION)
    $label = $itemText.ToString()
    if ([string]::IsNullOrWhiteSpace($label)) { continue }
    $id = [Win32Menu]::GetMenuItemID($sub, $j)
    $state = [Win32Menu]::GetMenuState($sub, $j, [Win32Menu]::MF_BYPOSITION)
    # MF_DISABLED 0x2, MF_GRAYED 0x1, MF_CHECKED 0x8
    $enabled = if (($state -band 0x3) -ne 0) { 0 } else { 1 }
    $checked = if (($state -band 0x8) -ne 0) { 1 } else { 0 }
    Write-Output "ITEM|$($topText.ToString())|$label|$id|enabled=$enabled|checked=$checked"

    if ($InvokeLabel -ne '' -and $label -eq $InvokeLabel) {
      $wparam = [IntPtr](([int]$id) -band 0xFFFF)
      [void][Win32Menu]::SendMessageW($hwnd, [Win32Menu]::WM_COMMAND, $wparam, [IntPtr]::Zero)
      Write-Output "FIRED|$label|$id"
      $fired = $true
    }
  }
}

if ($InvokeLabel -ne '' -and -not $fired) { Write-Output "NOT_FOUND|$InvokeLabel"; exit 3 }
