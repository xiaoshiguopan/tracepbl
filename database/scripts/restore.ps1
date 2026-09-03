param(
  [Parameter(Mandatory = $true)][string]$DumpPath,
  [string]$DatabaseUrl = $env:TRACEPBL_DATABASE_URL
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "TRACEPBL_DATABASE_URL is required." }
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) { throw "PostgreSQL 18 pg_restore is required on PATH." }
$dump = (Resolve-Path -LiteralPath $DumpPath).Path
$existing = (& psql --dbname=$DatabaseUrl --tuples-only --no-align --command="select count(*) from pg_tables where schemaname in ('core','rag','ops')").Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not inspect restore target." }
if ([int]$existing -ne 0) { throw "Restore target is not empty; create a new database first." }

& pg_restore --dbname=$DatabaseUrl --exit-on-error $dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }
Write-Output "Restore completed. Run npm run db:migrate, then purge expired tasks before opening the application."
