param(
  [Parameter(Mandatory = $true)][string]$OutputPath,
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
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath "$target.manifest.json" -Encoding utf8NoBOM
Write-Output "Backup and manifest created outside the repository."
