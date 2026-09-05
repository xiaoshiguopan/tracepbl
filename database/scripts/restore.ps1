param(
  [Parameter(Mandatory = $true)][string]$DumpPath,
  [Parameter(Mandatory = $true)][string]$JournalPath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedJournalSha256,
  [string]$DatabaseUrl = $env:TRACEPBL_DATABASE_URL
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "TRACEPBL_DATABASE_URL is required." }
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) { throw "PostgreSQL 18 pg_restore is required on PATH." }
$dump = (Resolve-Path -LiteralPath $DumpPath).Path
$journal = (Resolve-Path -LiteralPath $JournalPath).Path
$manifest = Get-Content -LiteralPath "$dump.manifest.json" -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) { throw "Backup manifest checksum mismatch." }
if ((Get-FileHash -LiteralPath $journal -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedJournalSha256) { throw "Latest independent deletion journal checksum mismatch." }
$journalState = Get-Content -LiteralPath $journal -Raw | ConvertFrom-Json
if ($journalState.pending -ne $false -or $journalState.schemaVersion -ne 1) { throw "Deletion journal is not confirmed." }
$existing = (& psql --dbname=$DatabaseUrl --tuples-only --no-align --command="select count(*) from pg_tables where schemaname in ('core','rag','ops')").Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not inspect restore target." }
if ([int]$existing -ne 0) { throw "Restore target is not empty; create a new database first." }

& pg_restore --dbname=$DatabaseUrl --exit-on-error $dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$previousMigrator = $env:TRACEPBL_MIGRATOR_DATABASE_URL
$previousJournal = $env:TRACEPBL_RECOVERY_JOURNAL
try {
  $env:TRACEPBL_MIGRATOR_DATABASE_URL = $DatabaseUrl
  $env:TRACEPBL_RECOVERY_JOURNAL = $journal
  Push-Location -LiteralPath $repository
  try {
    & npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Restore migration failed; keep services stopped." }
    & npm run checkpointer:init --workspace '@tracepbl/worker'
    if ($LASTEXITCODE -ne 0) { throw "Checkpoint initialization failed; keep services stopped." }
    & node --experimental-transform-types apps/worker/src/recovery-maintenance.ts reconcile $ExpectedJournalSha256
    if ($LASTEXITCODE -ne 0) { throw "Deletion reconciliation failed; keep services stopped and retain evidence." }
  } finally { Pop-Location }
} finally {
  $env:TRACEPBL_MIGRATOR_DATABASE_URL = $previousMigrator
  $env:TRACEPBL_RECOVERY_JOURNAL = $previousJournal
}
Write-Output "Restore and deletion reconciliation completed. Start services with the same external journal. Real AI remains disabled."
