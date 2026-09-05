param([Parameter(Mandatory=$true)][string]$ClientBin,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
$ErrorActionPreference = "Stop"
$env:PATH = "$ClientBin;$env:PATH"
$evidence = [IO.Path]::GetFullPath($EvidenceDirectory)
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if ($evidence.StartsWith($repository, [StringComparison]::OrdinalIgnoreCase)) { throw "Use a new evidence directory outside the repository." }
if (Test-Path -LiteralPath $evidence) { throw "Refusing to reuse evidence directory." }
New-Item -ItemType Directory -Path $evidence | Out-Null
$run = "stage12_dump_win_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$restored = $run + "_restored"
# This fixed port/password belongs only to the isolated synthetic drill container.
$base = "postgres://postgres:synthetic-stage12-win-only@127.0.0.1:45432"
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Native drill command failed with exit $LASTEXITCODE; retain evidence." } }
& createdb --maintenance-db="$base/postgres" $run; Check-Exit
& createdb --maintenance-db="$base/postgres" $restored; Check-Exit
$env:TRACEPBL_TEST_DATABASE_URL = "$base/$run"
$env:TRACEPBL_RECOVERY_JOURNAL = Join-Path $evidence "latest-journal.json"
& node --experimental-transform-types tests/stage12.restore-fixture.ts prepare; Check-Exit
$dump = Join-Path $evidence "before-delete.dump"
& "$PSScriptRoot/../database/scripts/backup.ps1" -OutputPath $dump -JournalPath $env:TRACEPBL_RECOVERY_JOURNAL -DatabaseUrl "$base/$run"
& node --experimental-transform-types tests/stage12.restore-fixture.ts expire; Check-Exit
$hash = (Get-FileHash -LiteralPath $env:TRACEPBL_RECOVERY_JOURNAL -Algorithm SHA256).Hash.ToLowerInvariant()
& "$PSScriptRoot/../database/scripts/restore.ps1" -DumpPath $dump -JournalPath $env:TRACEPBL_RECOVERY_JOURNAL -ExpectedJournalSha256 $hash -DatabaseUrl "$base/$restored"
$env:TRACEPBL_TEST_DATABASE_URL = "$base/$restored"
& node --experimental-transform-types tests/stage12.restore-fixture.ts assert-purged; Check-Exit
# Restoring again into a populated target must fail before any overwrite.
$refused = $false
try { & "$PSScriptRoot/../database/scripts/restore.ps1" -DumpPath $dump -JournalPath $env:TRACEPBL_RECOVERY_JOURNAL -ExpectedJournalSha256 $hash -DatabaseUrl "$base/$restored" } catch { if ($_.Exception.Message -notmatch "Restore target is not empty") { throw }; $refused=$true }
if (-not $refused) { throw "Populated target was not refused." }
Write-Output "PASS: Windows native PostgreSQL backup/restore, latest-journal deletion reconciliation and populated-target refusal. Evidence retained."
