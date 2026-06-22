$root = Join-Path $env:LOCALAPPDATA 'hermes\hermes-agent'
Get-ChildItem $root -Force | ForEach-Object {
  $size = if ($_.PSIsContainer) {
    (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  } else {
    $_.Length
  }
  [PSCustomObject]@{ Name = $_.Name; MB = [math]::Round($size / 1MB, 1) }
} | Sort-Object MB -Descending | Select-Object -First 35 | Format-Table -AutoSize
