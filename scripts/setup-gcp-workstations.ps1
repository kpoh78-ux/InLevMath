# ==============================================================================
# Google Cloud Workstations 자동 생성 스크립트
# ==============================================================================
# 스마트폰/태블릿 브라우저에서 접속 가능한 GCP 클라우드 IDE 인스턴스를 생성합니다.
# ==============================================================================

param(
    [string]$ProjectId = "",
    [string]$Region = "asia-northeast3", # 서울 리전
    [string]$ClusterName = "inlevmath-cluster",
    [string]$ConfigName = "inlevmath-config",
    [string]$WorkstationName = "inlevmath-dev"
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Google Cloud Workstations 설정 시작" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "[오류] gcloud CLI가 설치되어 있지 않습니다. Google Cloud SDK를 먼저 설치해 주세요." -ForegroundColor Red
    Write-Host "다운로드: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

if (-not $ProjectId) {
    $ProjectId = (gcloud config get-value project 2>$null)
}

if (-not $ProjectId) {
    Write-Host "[오류] GCP 프로젝트 ID가 지정되지 않았습니다. 'gcloud config set project [PROJECT_ID]'를 먼저 실행해 주세요." -ForegroundColor Red
    exit 1
}

Write-Host "프로젝트: $ProjectId" -ForegroundColor Gray
Write-Host "리전: $Region" -ForegroundColor Gray
Write-Host ""

# 1. API 활성화
Write-Host "[1/4] Cloud Workstations API 활성화 중..." -ForegroundColor Yellow
gcloud services enable workstations.googleapis.com --project=$ProjectId

# 2. 클러스터 생성
Write-Host "[2/4] Workstations 클러스터 생성 확인 중..." -ForegroundColor Yellow
$clusterExists = gcloud workstations clusters list --region=$Region --project=$ProjectId --format="value(name)" | Select-String $ClusterName
if (-not $clusterExists) {
    Write-Host "  -> 클러스터 '$ClusterName' 생성 중 (몇 분 정도 소요됩니다)..." -ForegroundColor Gray
    gcloud workstations clusters create $ClusterName --region=$Region --project=$ProjectId
} else {
    Write-Host "  -> 클러스터 '$ClusterName' 가 이미 존재합니다." -ForegroundColor Green
}

# 3. 워크스테이션 구성 (Configuration) 생성
Write-Host "[3/4] 워크스테이션 구성 생성 확인 중..." -ForegroundColor Yellow
$configExists = gcloud workstations configs list --cluster=$ClusterName --region=$Region --project=$ProjectId --format="value(name)" | Select-String $ConfigName
if (-not $configExists) {
    Write-Host "  -> 구성 '$ConfigName' 생성 중..." -ForegroundColor Gray
    gcloud workstations configs create $ConfigName `
        --cluster=$ClusterName `
        --region=$Region `
        --project=$ProjectId `
        --machine-type="e2-standard-4" `
        --idle-timeout="7200s"
} else {
    Write-Host "  -> 구성 '$ConfigName' 가 이미 존재합니다." -ForegroundColor Green
}

# 4. 워크스테이션 인스턴스 생성 및 시작
Write-Host "[4/4] 워크스테이션 인스턴스 생성 확인 중..." -ForegroundColor Yellow
$wsExists = gcloud workstations list --cluster=$ClusterName --config=$ConfigName --region=$Region --project=$ProjectId --format="value(name)" | Select-String $WorkstationName
if (-not $wsExists) {
    Write-Host "  -> 워크스테이션 '$WorkstationName' 생성 중..." -ForegroundColor Gray
    gcloud workstations create $WorkstationName `
        --cluster=$ClusterName `
        --config=$ConfigName `
        --region=$Region `
        --project=$ProjectId
} else {
    Write-Host "  -> 워크스테이션 '$WorkstationName' 가 이미 존재합니다." -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Cloud Workstation 설정 완료!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "GCP 콘솔에서 바로 접속하기: https://console.cloud.google.com/workstations" -ForegroundColor Cyan
