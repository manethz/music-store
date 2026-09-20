$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}

function Start-ServiceWindow([string]$Directory, [string]$Command) {
    $escapedDirectory = $Directory.Replace("'", "''")
    $script = "Set-Location -LiteralPath '$escapedDirectory'; $Command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process powershell.exe -ArgumentList '-NoProfile', '-NoExit', '-EncodedCommand', $encoded
}

function Wait-Port([int]$Port, [string]$Name) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-Port $Port) { return }
        Start-Sleep -Seconds 1
    }
    throw "$Name did not start. Read the error in its PowerShell window."
}

try {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is missing from PATH. Install Node.js and try again.' }
    if (-not (Test-Port 27017)) {
        Write-Host 'Starting MongoDB...'
        Start-ServiceWindow $PSScriptRoot '& ".\backend\.cache\mongodb-binaries\mongod-x64-win32-7.0.24.exe" --dbpath ".\backend\.data\db" --bind_ip 127.0.0.1 --port 27017 --replSet rs0'
        Wait-Port 27017 'MongoDB'
    } else { Write-Host 'MongoDB port is already active.' }

    if (-not (Test-Port 5000)) {
        Write-Host 'Starting backend...'
        Start-ServiceWindow (Join-Path $PSScriptRoot 'backend') 'npm.cmd run dev'
        Wait-Port 5000 'Backend'
    } else { Write-Host 'Backend port is already active.' }

    if (-not (Test-Port 5173)) {
        Write-Host 'Starting frontend...'
        Start-ServiceWindow (Join-Path $PSScriptRoot 'frontend') 'npm.cmd run dev -- --port 5173 --strictPort'
        Wait-Port 5173 'Frontend'
    } else { Write-Host 'Frontend port is already active.' }

    $health = Invoke-RestMethod 'http://localhost:5000/api/health' -TimeoutSec 10
    if ($health.status -ne 'ok') { throw 'The backend health check failed.' }
    $page = Invoke-WebRequest 'http://localhost:5173' -UseBasicParsing -TimeoutSec 10
    if ($page.StatusCode -ne 200) { throw 'The website did not respond successfully.' }
    Write-Host 'Website ready: http://localhost:5173'
    Write-Host 'Keep the service windows open. Press Ctrl+C in them to stop.'
    Start-Process 'http://localhost:5173'
} catch {
    Write-Host "Startup failed: $_" -ForegroundColor Red
    exit 1
}
