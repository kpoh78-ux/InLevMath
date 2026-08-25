# ==============================================================================
# InLevMath Auto-Sync Script (Git Auto-Push & GCS Sync)
# ==============================================================================

param(
    [string]$RepoPath = "$PSScriptRoot\..",
    [string]$Branch = "master",
    [int]$DebounceSeconds = 10,
    [string]$GcsBucket = "",
    [switch]$SyncGCSOnly = $false
)

$RepoPath = (Resolve-Path $RepoPath).Path
Set-Location -Path $RepoPath

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

Write-Log "==================================================" "Cyan"
Write-Log "  InLevMath Auto-Sync (Git & GCS)" "Cyan"
Write-Log "==================================================" "Cyan"
Write-Log "Work Path: $RepoPath" "Gray"
Write-Log "Target Branch: $Branch" "Gray"
Write-Log "Debounce Interval: ${DebounceSeconds}s" "Gray"
if ($GcsBucket) {
    Write-Log "GCS Bucket: $GcsBucket" "Magenta"
} else {
    Write-Log "GCS Backup: Disabled (Optional)" "DarkGray"
}
Write-Log "Watching for file changes... (Press Ctrl + C to stop)" "Green"
Write-Host ""

# Folders / Files to ignore
$ExcludePattern = '(\\(\.git|node_modules|\.next|\.turbo|dist|build|\.expo|backups)(\\|$))|(\.(tmp|swp|lock)$)'

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $RepoPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::DirectoryName -bor [System.IO.NotifyFilters]::LastWrite

$global:hasChanges = $false
$global:lastChangeTime = [DateTime]::MinValue

$changeHandler = {
    param($sender, $eventArgs)
    $path = $eventArgs.FullPath
    if ($path -notmatch $ExcludePattern) {
        $global:hasChanges = $true
        $global:lastChangeTime = [DateTime]::Now
    }
}

Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action $changeHandler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $changeHandler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName "Deleted" -Action $changeHandler | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName "Renamed" -Action $changeHandler | Out-Null

function Sync-Git {
    try {
        $status = git status --porcelain
        if (-not [string]::IsNullOrWhiteSpace($status)) {
            Write-Log "[Git] Changes detected. Staging files..." "Yellow"
            git add -A

            $dateStr = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            $commitMsg = "auto: sync changes ($dateStr)"
            
            git commit -m $commitMsg | Out-Null
            Write-Log "[Git] Committed: $commitMsg" "Green"

            Write-Log "[Git] Pushing to GitHub ($Branch)..." "Yellow"
            $pushResult = git push origin $Branch 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Log "[Git] Successfully pushed to GitHub!" "Green"
            } else {
                Write-Log "[Git Warning] Push failed: $pushResult" "Red"
            }
        }
    } catch {
        Write-Log "[Git Error] $_" "Red"
    }
}

function Sync-GCS {
    if (-not $GcsBucket) { return }
    
    try {
        Write-Log "[GCS] Syncing to $GcsBucket..." "Magenta"
        if (Get-Command gcloud -ErrorAction SilentlyContinue) {
            & gcloud storage rsync -r --exclude="$ExcludePattern" $RepoPath $GcsBucket 2>&1 | Out-Null
            Write-Log "[GCS] Sync completed!" "Green"
        } elseif (Get-Command gsutil -ErrorAction SilentlyContinue) {
            & gsutil -m rsync -r -x $ExcludePattern $RepoPath $GcsBucket 2>&1 | Out-Null
            Write-Log "[GCS] Sync completed!" "Green"
        } else {
            Write-Log "[GCS Notice] gcloud/gsutil CLI not found. Skipping GCS sync." "DarkYellow"
        }
    } catch {
        Write-Log "[GCS Error] $_" "Red"
    }
}

# Main loop
try {
    while ($true) {
        Start-Sleep -Seconds 2

        if ($global:hasChanges) {
            $elapsed = ([DateTime]::Now - $global:lastChangeTime).TotalSeconds
            if ($elapsed -ge $DebounceSeconds) {
                $global:hasChanges = $false
                
                if (-not $SyncGCSOnly) {
                    Sync-Git
                }
                if ($GcsBucket) {
                    Sync-GCS
                }
                Write-Host ""
                Write-Log "Watching for changes..." "DarkGray"
            }
        }
    }
} finally {
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
    Get-EventSubscriber | Unregister-Event
    Write-Log "Auto-sync stopped." "Cyan"
}
