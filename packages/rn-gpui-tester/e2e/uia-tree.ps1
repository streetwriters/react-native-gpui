<#
Walks the real Windows UI Automation tree of a process' main window and prints
one JSON line per node.

This is the independent half of the accessibility check: the driver's `a11yTree`
reports what GPUI computed, while a UI Automation walk reports what Windows
actually exposes to assistive technology. `fixtures.e2e.ts` compares the two, so
a regression in the AccessKit adapter (or in the author-id mapping) is caught
even though GPUI's own tree would still look correct.

Prints a JSON array on stdout. Writes nothing else, so the caller can parse it.

Usage:
  pwsh -NoProfile -File uia-tree.ps1 -ProcessId <pid>
#>
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [int]$Depth = 12
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$auto = [System.Windows.Automation.AutomationElement]
$condition = New-Object System.Windows.Automation.PropertyCondition(
  $auto::ProcessIdProperty, $ProcessId)
$window = $auto::RootElement.FindFirst(
  [System.Windows.Automation.TreeScope]::Children, $condition)

if (-not $window) {
  # An empty array rather than an error: the caller distinguishes "no window"
  # from "a window with no accessible children".
  Write-Output '[]'
  exit 0
}

$rows = New-Object System.Collections.Generic.List[object]

function Get-Prop($element, $property) {
  try { return $element.GetCurrentPropertyValue($property) } catch { return $null }
}

function Format-Value($value) {
  if ($null -eq $value) { return '' }
  if ($value -is [System.Windows.Automation.AutomationElement]) { return '<element>' }
  # ControlType stringifies as the .NET type name; ProgrammaticName is the
  # stable identifier ("ControlType.Button").
  if ($value -is [System.Windows.Automation.ControlType]) {
    return $value.ProgrammaticName -replace '^ControlType\.', ''
  }
  $text = [string]$value
  if ($text.Length -gt 200) { return $text.Substring(0, 200) }
  return $text
}

function Walk($element, $level) {
  if ($level -gt $Depth) { return }
  $rows.Add([pscustomobject]@{
    depth        = $level
    name         = Format-Value (Get-Prop $element $auto::NameProperty)
    automationId = Format-Value (Get-Prop $element $auto::AutomationIdProperty)
    controlType  = Format-Value (Get-Prop $element $auto::ControlTypeProperty)
    helpText     = Format-Value (Get-Prop $element $auto::HelpTextProperty)
    # Booleans are kept as booleans so the caller can compare them directly.
    isEnabled    = [bool](Get-Prop $element $auto::IsEnabledProperty)
    isOffscreen  = [bool](Get-Prop $element $auto::IsOffscreenProperty)
  })
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $child = $walker.GetFirstChild($element)
  while ($child) {
    Walk $child ($level + 1)
    $child = $walker.GetNextSibling($child)
  }
}

Walk $window 0
Write-Output ($rows | ConvertTo-Json -Depth 4 -Compress)
