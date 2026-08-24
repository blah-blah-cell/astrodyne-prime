$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$jarPath = Join-Path $projectRoot 'tools\openrocket-bridge\target\astrodyne-openrocket-bridge.jar'
if (-not (Test-Path -LiteralPath $jarPath)) {
  throw 'OpenRocket bridge is not built. Run npm run openrocket:build first.'
}

$payload = @'
{
  "name": "Astrodyne Bridge Verification",
  "noseCone": { "shape": "ogive", "lengthM": 0.35, "baseDiameterM": 0.075, "massKg": 0.18 },
  "bodyTube": { "lengthM": 0.85, "outerDiameterM": 0.075, "innerDiameterM": 0.072, "massKg": 0.32 },
  "finSet": { "numFins": 4, "rootChordM": 0.12, "tipChordM": 0.05, "spanM": 0.08, "sweepLengthM": 0.06, "positionFromNoseM": 1.05, "massKg": 0.11 },
  "motorMassKg": 0.45,
  "motorPositionFromNoseM": 1.15,
  "motorThrustN": 480,
  "motorBurnTimeSec": 2.8,
  "propellantMassKg": 0.22
}
'@

$output = $payload | & java '-Xms64m' '-Xmx768m' '-jar' $jarPath 2>&1
$marker = $output | Where-Object { $_ -like 'ASTRODYNE_RESULT:*' } | Select-Object -Last 1
if (-not $marker) { throw "OpenRocket bridge returned no structured result.`n$($output -join "`n")" }
$result = $marker.Substring('ASTRODYNE_RESULT:'.Length) | ConvertFrom-Json
if (-not $result.ok) { throw "OpenRocket simulation failed: $($result.error)" }
if ($result.version -ne '24.12') { throw "Expected OpenRocket 24.12, got $($result.version)" }
if ($result.apogeeAltitudeM -le 0 -or $result.samples -lt 100) { throw 'OpenRocket returned an invalid trajectory.' }

Write-Host "OpenRocket Core $($result.version) verified: $([math]::Round($result.apogeeAltitudeM, 3)) m apogee, $($result.samples) samples, $($result.warnings) warnings."
