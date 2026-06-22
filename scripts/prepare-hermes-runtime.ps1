param(
  [string]$HermesAgent = "$env:LOCALAPPDATA\hermes\hermes-agent",
  [string]$Output = "$PSScriptRoot\..\resources\hermes-runtime"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path "$HermesAgent\venv\pyvenv.cfg")) { throw "Hermes runtime not found: $HermesAgent" }

$pythonHome = (Select-String -Path "$HermesAgent\venv\pyvenv.cfg" -Pattern '^home\s*=\s*(.+)$').Matches[0].Groups[1].Value.Trim()
if (-not (Test-Path "$pythonHome\python.exe")) { throw "Hermes base Python not found: $pythonHome" }

Remove-Item $Output -Recurse -Force -ErrorAction SilentlyContinue
New-Item "$Output\agent", "$Output\python", "$Output\site-packages" -ItemType Directory -Force | Out-Null

$excluded = @(
  '.git', '.github', '.plans', '__pycache__', 'apps', 'assets', 'datagen-config-examples', 'docker', 'docs',
  'infographic', 'nix', 'node_modules', 'optional-mcps', 'optional-skills', 'packaging', 'plans', 'tests',
  'venv', 'web', 'website'
)
& robocopy $HermesAgent "$Output\agent" /E /XD $excluded /XF 'package-lock.json' '*.pyc' /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Failed to copy Hermes agent: robocopy $LASTEXITCODE" }

& robocopy $pythonHome "$Output\python" /E /XD '__pycache__' /XF '*.pyc' /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Failed to copy Python runtime: robocopy $LASTEXITCODE" }

& robocopy "$HermesAgent\venv\Lib\site-packages" "$Output\site-packages" /E /XD '__pycache__' /XF '*.pyc' /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Failed to copy Hermes dependencies: robocopy $LASTEXITCODE" }

Copy-Item "$HermesAgent\LICENSE" "$Output\HERMES-LICENSE.txt"
Copy-Item "$PSScriptRoot\..\resources\hermes_launcher.py" "$Output\hermes_launcher.py"

$bytes = (Get-ChildItem $Output -Recurse -File | Measure-Object Length -Sum).Sum
Write-Output "Bundled Hermes runtime ready: $([math]::Round($bytes / 1MB, 1)) MB"
