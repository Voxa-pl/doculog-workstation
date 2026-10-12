$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "DocuLog Workstation.lnk"
$target = Join-Path $PSScriptRoot "run_workstation.bat"

$s = $ws.CreateShortcut($shortcutPath)
$s.TargetPath = $target
$s.WorkingDirectory = $PSScriptRoot
$s.Description = "DocuLog Lojistik İrsaliye İş İstasyonu"
$s.Save()

if (Test-Path $shortcutPath) {
    Write-Host "[BAŞARILI] Masaüstüne 'DocuLog Workstation' kısayolu eklendi!" -ForegroundColor Green
} else {
    Write-Host "[HATA] Kısayol oluşturulamadı." -ForegroundColor Red
}
