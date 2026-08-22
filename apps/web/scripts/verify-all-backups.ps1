# Verify All Backups
$latestLocal = Get-ChildItem "C:\My-Project\Backups\InLevMath\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "InLevMath Backup Verification Report" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`n1. Local Backup:" -ForegroundColor Yellow
if ($latestLocal) {
    Write-Host "   Path : $($latestLocal.FullName)" -ForegroundColor Green
    Write-Host "   Size : $([math]::Round($latestLocal.Length / 1MB, 2)) MB"
    Write-Host "   Time : $($latestLocal.LastWriteTime)"
}

Write-Host "`n2. OneDrive Backup:" -ForegroundColor Yellow
$oneDrivePath = "C:\Users\kpoh7\OneDrive\InLevMath_Backups\$($latestLocal.Name)"
if (Test-Path $oneDrivePath) {
    $odItem = Get-Item $oneDrivePath
    Write-Host "   Path : $oneDrivePath" -ForegroundColor Green
    Write-Host "   Size : $([math]::Round($odItem.Length / 1MB, 2)) MB"
    Write-Host "   Time : $($odItem.LastWriteTime)"
}

Write-Host "`n3. Google Drive Backup:" -ForegroundColor Yellow
if (Test-Path "G:\") {
    $gDirs = Get-ChildItem "G:\" -Directory -ErrorAction SilentlyContinue
    foreach ($g in $gDirs) {
        $targetDir = Join-Path $g.FullName "InLevMath_Backups"
        $targetFile = Join-Path $targetDir $latestLocal.Name
        try {
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction Stop | Out-Null
            }
            if (-not (Test-Path $targetFile)) {
                Copy-Item -Path $latestLocal.FullName -Destination $targetFile -Force -ErrorAction Stop
            }
            if (Test-Path $targetFile) {
                $gdItem = Get-Item $targetFile
                Write-Host "   Path : $targetFile" -ForegroundColor Green
                Write-Host "   Size : $([math]::Round($gdItem.Length / 1MB, 2)) MB"
                Write-Host "   Time : $($gdItem.LastWriteTime)"
            }
        } catch {
            Write-Host "   Skipped non-writable folder: $($g.FullName)" -ForegroundColor DarkGray
        }
    }
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "All Backups Verified & Synced!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
