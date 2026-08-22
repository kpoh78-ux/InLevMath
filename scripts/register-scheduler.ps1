# Windows Scheduled Task Registration Script for InLevMath Auto Backup
param (
    [string]$Action = "register",
    [string]$Time = "23:00"
)

$TaskName = "InLevMath_AutoBackup"
$ScriptPath = "C:\My-Project\Second-Project-InLevMath\InLevMath\scripts\backup.ps1"

if ($Action -eq "unregister") {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Scheduled task '$TaskName' has been removed." -ForegroundColor Yellow
    exit 0
}

$TaskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $TaskAction -Trigger $Trigger -Settings $Settings -Description "InLevMath Daily Auto Cloud Backup" -Force | Out-Null

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Windows Scheduled Task Registered Successfully!" -ForegroundColor Green
Write-Host "  - Task Name: $TaskName" -ForegroundColor Cyan
Write-Host "  - Schedule: Daily at $Time" -ForegroundColor Cyan
Write-Host "  - Script: $ScriptPath" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Green
