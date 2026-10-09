$ErrorActionPreference = 'Stop'
$toolRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $toolRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }
$source = Get-Content -LiteralPath (Join-Path $toolRoot 'SpriteSheetBuilder.jsx') -Raw -Encoding UTF8
if ($source -notmatch ('var VERSION = "' + [regex]::Escape($version) + '"')) {
    throw 'package.json and SpriteSheetBuilder.jsx versions must match.'
}
$outputDir = Join-Path $toolRoot 'dist'
if (Test-Path -LiteralPath $outputDir) {
    if ((Get-Item -LiteralPath $outputDir).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'dist must not be a symbolic link or junction.'
    }
} else { New-Item -ItemType Directory -Path $outputDir | Out-Null }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-SourceFiles([string]$directory, [string[]]$extensions) {
    Get-ChildItem -LiteralPath (Join-Path $toolRoot $directory) -File -Recurse -Force |
        Where-Object { $extensions -contains $_.Extension } |
        ForEach-Object { $_.FullName.Substring($toolRoot.Length + 1).Replace('\', '/') }
}

function New-Package([string]$archivePath, [string[]]$files, [string]$prefix) {
    $stream = [IO.File]::Open($archivePath, [IO.FileMode]::Create)
    $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($relative in ($files | Sort-Object -Unique)) {
            $file = Join-Path $toolRoot $relative
            $resolved = (Resolve-Path -LiteralPath $file).Path
            if (-not $resolved.StartsWith($toolRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw "File outside repository: $relative"
            }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $resolved, "$prefix/$relative", [IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
    Write-Output $archivePath
}

$userFiles = @('SpriteSheetBuilder.jsx', 'README.md', 'CHANGELOG.md') + @(Get-SourceFiles 'docs' @('.md'))
$sourceFiles = $userFiles + @('package.json', '.gitignore', '.gitattributes', '.editorconfig') +
    @(Get-SourceFiles 'scripts' @('.cjs', '.ps1')) + @(Get-SourceFiles 'tests' @('.cjs', '.jsx', '.md')) +
    @(Get-SourceFiles '.github' @('.yml', '.md'))
$installZip = Join-Path $outputDir "SpriteSheetBuilder-$version.zip"
$sourceZip = Join-Path $outputDir "AE-SpriteSheet-$version-source.zip"
New-Package $installZip $userFiles "SpriteSheetBuilder-$version"
New-Package $sourceZip $sourceFiles "AE-SpriteSheet-$version"
$checksums = foreach ($zip in @($installZip, $sourceZip)) {
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($zip))"
}
$checksums | Set-Content -LiteralPath (Join-Path $outputDir 'SHA256SUMS.txt') -Encoding ASCII
