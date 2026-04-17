param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

if (-not (Test-Path -LiteralPath $Path)) {
  throw "File not found: $Path"
}

$resolved = (Resolve-Path -LiteralPath $Path).Path

$sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
$sha1 = (Get-FileHash -Algorithm SHA1 -LiteralPath $resolved).Hash.ToLowerInvariant()

$outPath = "$resolved.checksums.txt"

@"
file: $resolved
sha256: $sha256
sha1: $sha1
"@ | Set-Content -Encoding ASCII -NoNewline -LiteralPath $outPath

Write-Output $outPath

