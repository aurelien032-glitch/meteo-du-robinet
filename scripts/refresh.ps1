# Rafraîchissement complet : sources, agrégats, contrôle de vraisemblance.
# Usage manuel :  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\refresh.ps1
# Le déploiement (npm run deploy) n'est PAS automatique : passez -Deploy explicitement une fois que le site
# doit être public. La tâche planifiée ci-dessous n'en fait volontairement pas.
#
# Planification (une fois par mois, le 5 à 3 h) :
#   schtasks /Create /TN "Robinet dataviz" /SC MONTHLY /D 5 /ST 03:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"<dossier du dépôt>\scripts\refresh.ps1\""
param(
  [switch]$Deploy
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root "data\refresh.log"
$annee = (Get-Date).Year
$annees = @(($annee - 3)..$annee | ForEach-Object { "-y", "$_" })

# uv/npm sont des exécutables externes : un code de sortie non nul ne lève pas d'exception PowerShell même
# avec $ErrorActionPreference = 'Stop' (qui ne couvre que les erreurs de cmdlets). Sans ce contrôle explicite,
# un échec de téléchargement ou un `check --strict` en défaut n'arrêtait pas le script, qui continuait
# jusqu'au déploiement avec des données potentiellement incomplètes ou incohérentes.
function Invoke-Step([string]$Description, [scriptblock]$Command) {
  Write-Host "== $(Get-Date -Format s) $Description"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description a échoué (code $LASTEXITCODE)"
  }
}

Start-Transcript -Path $log -Append | Out-Null
try {
  Set-Location (Join-Path $root "pipeline")
  Invoke-Step "téléchargement" { uv run robinet download @annees }
  Invoke-Step "construction du millésime en cours" { uv run robinet build -y $annee --force }
  Invoke-Step "construction des millésimes précédents" { uv run robinet build @annees }
  Invoke-Step "SISPEA" { uv run robinet sispea @annees }
  Invoke-Step "index de recherche" { uv run robinet recherche }
  Invoke-Step "API BNPE" { uv run robinet api --what bnpe }
  Invoke-Step "API BNV-D" { uv run robinet api --what bnvd }
  Invoke-Step "API ADES" { uv run robinet api --what ades }
  Invoke-Step "API Naïades" { uv run robinet api --what naiades }
  Invoke-Step "API piézométrie" { uv run robinet api --what piezo }
  Invoke-Step "amont" { uv run robinet amont }
  Invoke-Step "ressource (sécheresse, nappes)" { uv run robinet ressource }
  Invoke-Step "contrôle de vraisemblance" { uv run robinet check --strict }
  if ($Deploy) {
    Set-Location (Join-Path $root "web")
    Invoke-Step "déploiement" { npm run deploy }
  } else {
    Write-Host "== déploiement ignoré (relancer avec -Deploy pour publier)"
  }
  Write-Host "== terminé $(Get-Date -Format s)"
} catch {
  Write-Host "== ÉCHEC $(Get-Date -Format s) : $($_.Exception.Message)"
  Stop-Transcript | Out-Null
  exit 1
}
Stop-Transcript | Out-Null
