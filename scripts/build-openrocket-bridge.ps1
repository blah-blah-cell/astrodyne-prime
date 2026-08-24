$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot '.cache\apache-maven-3.9.11'
$mavenExecutable = Join-Path $cacheRoot 'bin\mvn.cmd'
$archivePath = Join-Path $projectRoot '.cache\apache-maven-3.9.11-bin.zip'
$bridgePath = Join-Path $projectRoot 'tools\openrocket-bridge'

if (-not (Test-Path -LiteralPath $mavenExecutable)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.cache') | Out-Null
  Write-Host 'Downloading Apache Maven 3.9.11 from archive.apache.org...'
  Invoke-WebRequest -Uri 'https://archive.apache.org/dist/maven/maven-3/3.9.11/binaries/apache-maven-3.9.11-bin.zip' -OutFile $archivePath
  Expand-Archive -LiteralPath $archivePath -DestinationPath (Join-Path $projectRoot '.cache') -Force
  Remove-Item -LiteralPath $archivePath
}

& $mavenExecutable -f (Join-Path $bridgePath 'pom.xml') package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'OpenRocket Core 24.12 bridge built successfully.'
