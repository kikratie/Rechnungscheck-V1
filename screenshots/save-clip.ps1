Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) {
    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    $path = "$PSScriptRoot\screenshot_$ts.png"
    $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Gespeichert: $path"
} else {
    Write-Host "Kein Bild in der Zwischenablage!"
}
