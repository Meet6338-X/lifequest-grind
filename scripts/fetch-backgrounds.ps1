$ErrorActionPreference = 'Continue'
$dir = Join-Path $PSScriptRoot '..\lifequest-app\assets\backgrounds'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dir = (Resolve-Path $dir).Path

$items = @(
  @{ q = 'anime night city'; n = 'night-city' },
  @{ q = 'anime forest nature'; n = 'forest' },
  @{ q = 'anime space stars galaxy'; n = 'space' },
  @{ q = 'anime ocean sea'; n = 'ocean' },
  @{ q = 'anime cherry blossom sakura'; n = 'sakura' },
  @{ q = 'anime cyberpunk city'; n = 'cyberpunk' },
  @{ q = 'anime sunset landscape'; n = 'sunset' },
  @{ q = 'anime winter snow'; n = 'winter' }
)

foreach ($it in $items) {
  try {
    $out = Join-Path $dir "$($it.n).jpg"
    $q = [uri]::EscapeDataString($it.q)
    $url = "https://wallhaven.cc/api/v1/search?q=$q&atleast=3840x2160&purity=100&categories=111&sorting=relevance"
    $raw = curl.exe -s --max-time 30 $url
    $j = $raw | ConvertFrom-Json
    $pick = $j.data | Select-Object -First 1
    if (-not $pick) {
      $url = "https://wallhaven.cc/api/v1/search?q=$q&atleast=2560x1440&purity=100&categories=111&sorting=relevance"
      $raw = curl.exe -s --max-time 30 $url
      $j = $raw | ConvertFrom-Json
      $pick = $j.data | Select-Object -First 1
    }
    if ($pick) {
      curl.exe -s -L --max-time 150 -o $out $pick.path
      if (Test-Path $out) {
        $f = Get-Item $out
        Write-Output "$($it.n): $($f.Length) bytes ($($pick.resolution)) <- $($pick.path)"
      } else {
        Write-Output "$($it.n): DOWNLOAD FAILED"
      }
    } else {
      Write-Output "$($it.n): NO RESULTS"
    }
  } catch {
    Write-Output "$($it.n): FAIL $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 1
}
Write-Output 'DONE'
