# InLevMath Auto Backup Script
param (
    [string]$SourceDir = "C:\My-Project\Second-Project-InLevMath\InLevMath",
    [string]$LocalBackupDir = "C:\My-Project\Backups\InLevMath",
    [string]$OneDriveBackupDir = "$HOME\OneDrive\InLevMath_Backups",
    [int]$RetentionDays = 14,
    [int]$MaxBackups = 20
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "InLevMath Auto Backup Starting..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not (Test-Path -Path $SourceDir)) {
    Write-Error "Source directory not found: $SourceDir"
    exit 1
}

if (-not (Test-Path -Path $LocalBackupDir)) {
    New-Item -ItemType Directory -Path $LocalBackupDir -Force | Out-Null
    Write-Host "Created local backup directory: $LocalBackupDir" -ForegroundColor Yellow
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ZipFileName = "InLevMath_backup_$Timestamp.zip"
$TempZipPath = Join-Path $env:TEMP $ZipFileName
$FinalLocalZipPath = Join-Path $LocalBackupDir $ZipFileName

Write-Host "Preparing source files (excluding node_modules and build artifacts)..." -ForegroundColor Yellow

$StageDir = Join-Path $env:TEMP "InLevMath_stage_$Timestamp"
if (Test-Path -Path $StageDir) { 
    Remove-Item -Path $StageDir -Recurse -Force 
}
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

try {
    $RobocopyArgs = @(
        $SourceDir,
        $StageDir,
        "/E",
        "/XD", "node_modules", ".next", ".turbo", ".expo", "dist", "build", ".cache",
        "/XF", "*.log",
        "/R:1", "/W:1",
        "/NFL", "/NDL", "/NJH", "/NJS"
    )
    & robocopy @RobocopyArgs | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "Robocopy encountered an error (ExitCode: $LASTEXITCODE)"
    }

    Write-Host "Compressing files into ZIP archive..." -ForegroundColor Yellow
    Compress-Archive -Path "$StageDir\*" -DestinationPath $TempZipPath -CompressionLevel Optimal

    Move-Item -Path $TempZipPath -Destination $FinalLocalZipPath -Force

    $ZipSizeMB = [math]::Round((Get-Item $FinalLocalZipPath).Length / 1MB, 2)
    Write-Host "Local backup completed: $FinalLocalZipPath ($ZipSizeMB MB)" -ForegroundColor Green

    # Cloud Backup: OneDrive
    if (Test-Path "$HOME\OneDrive") {
        if (-not (Test-Path $OneDriveBackupDir)) {
            New-Item -ItemType Directory -Path $OneDriveBackupDir -Force | Out-Null
        }
        $OneDriveZipPath = Join-Path $OneDriveBackupDir $ZipFileName
        Copy-Item -Path $FinalLocalZipPath -Destination $OneDriveZipPath -Force
        Write-Host "OneDrive backup completed: $OneDriveZipPath" -ForegroundColor Green
    }

    # Cloud Backup: Google Drive
    $GDBackupDir = $null
    $GoogleDriveCandidates = @()
    if (Test-Path "G:\") {
        $GSubdirs = Get-ChildItem -Path "G:\" -Directory -ErrorAction SilentlyContinue
        foreach ($d in $GSubdirs) {
            try {
                $candidateDir = Join-Path $d.FullName "InLevMath_Backups"
                if (-not (Test-Path $candidateDir)) {
                    New-Item -ItemType Directory -Path $candidateDir -Force -ErrorAction Stop | Out-Null
                }
                $GoogleDriveCandidates += $d.FullName
            } catch {}
        }
    }
    $GoogleDriveCandidates += @("$HOME\Google Drive")

    foreach ($GDPath in $GoogleDriveCandidates) {
        try {
            $GDBackupDir = Join-Path $GDPath "InLevMath_Backups"
            if (-not (Test-Path $GDBackupDir)) {
                New-Item -ItemType Directory -Path $GDBackupDir -Force -ErrorAction Stop | Out-Null
            }
            $GDZipPath = Join-Path $GDBackupDir $ZipFileName
            Copy-Item -Path $FinalLocalZipPath -Destination $GDZipPath -Force -ErrorAction Stop
            Write-Host "Google Drive backup completed: $GDZipPath" -ForegroundColor Green
            break
        } catch {
            Write-Warning "Google Drive path skipped ($GDPath): $($_.Exception.Message)"
        }
    }

    # Clean old backups
    Write-Host "Cleaning old backups..." -ForegroundColor Gray
    $BackupFolders = @($LocalBackupDir, $OneDriveBackupDir)
    if ($GDBackupDir -and (Test-Path $GDBackupDir)) {
        $BackupFolders += $GDBackupDir
    }
    foreach ($Folder in $BackupFolders) {
        if (Test-Path $Folder) {
            $OldFiles = Get-ChildItem -Path $Folder -Filter "InLevMath_backup_*.zip" | 
                Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) }
            foreach ($File in $OldFiles) {
                Remove-Item $File.FullName -Force
                Write-Host "Removed expired backup: $($File.Name)" -ForegroundColor DarkGray
            }

            $AllBackups = Get-ChildItem -Path $Folder -Filter "InLevMath_backup_*.zip" | Sort-Object LastWriteTime -Descending
            if ($AllBackups.Count -gt $MaxBackups) {
                $ToRemove = $AllBackups | Select-Object -Skip $MaxBackups
                foreach ($File in $ToRemove) {
                    Remove-Item $File.FullName -Force
                    Write-Host "Removed excess backup: $($File.Name)" -ForegroundColor DarkGray
                }
            }
        }
    }

    Write-Host "Backup completed successfully!" -ForegroundColor Green
}
finally {
    if (Test-Path -Path $StageDir) {
        Remove-Item -Path $StageDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -Path $TempZipPath) {
        Remove-Item -Path $TempZipPath -Force -ErrorAction SilentlyContinue
    }
}
