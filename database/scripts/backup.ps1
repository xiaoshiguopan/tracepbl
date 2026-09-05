param(
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$JournalPath,
  [string]$DatabaseUrl = $env:TRACEPBL_DATABASE_URL
)

$ErrorActionPreference = "Stop"
if (-not $DatabaseUrl) { throw "TRACEPBL_DATABASE_URL is required." }
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) { throw "PostgreSQL 18 pg_dump is required on PATH." }

$target = [IO.Path]::GetFullPath($OutputPath)
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if ($target.StartsWith($repository, [StringComparison]::OrdinalIgnoreCase)) { throw "Backup must be stored outside the repository." }
if (Test-Path -LiteralPath $target) { throw "Refusing to overwrite existing backup: $target" }
if (Test-Path -LiteralPath "$target.manifest.json") { throw "Refusing to overwrite existing manifest: $target.manifest.json" }
$journal = (Resolve-Path -LiteralPath $JournalPath).Path
if ($journal.StartsWith($repository, [StringComparison]::OrdinalIgnoreCase)) { throw "Deletion journal must be outside the repository." }
$journalState = Get-Content -LiteralPath $journal -Raw | ConvertFrom-Json
if ($journalState.pending -ne $false -or $journalState.schemaVersion -ne 1) { throw "Deletion journal is not confirmed." }
$recoveryReady = (& psql --dbname=$DatabaseUrl --tuples-only --no-align --command="select initialized and not reconciling from ops.recovery_control where singleton").Trim()
if ($LASTEXITCODE -ne 0 -or $recoveryReady -ne 't') { throw "Recovery protection is not initialized; backup cannot be marked restorable." }

& pg_dump --dbname=$DatabaseUrl --format=custom --file=$target
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }

$head = (& psql --dbname=$DatabaseUrl --tuples-only --no-align --command="select name from tracepbl_meta.schema_migrations order by name desc limit 1").Trim()
$versions = (& psql --dbname=$DatabaseUrl --tuples-only --no-align --command="select current_setting('server_version') || ' / pgvector ' || extversion from pg_extension where extname='vector'").Trim()
$manifest = [ordered]@{
  createdAt = [DateTimeOffset]::UtcNow.ToString("o")
  migrationHead = $head
  databaseVersions = $versions
  applicationCommit = (& git -C $repository rev-parse HEAD).Trim()
  sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  recoveryEpoch = $journalState.epoch
  journalSha256AtBackup = (Get-FileHash -LiteralPath $journal -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath "$target.manifest.json" -Encoding utf8NoBOM
Write-Output "Backup and manifest created outside the repository."
Write-Output "Retain the independent live deletion journal for all restorable backups. Its current fingerprint, not the archived fingerprint above, is required for restore."
