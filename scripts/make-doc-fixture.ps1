# Crea tests/fixtures/historia.doc (Word 97-2003) con Microsoft Word vía COM.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/make-doc-fixture.ps1
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\tests\fixtures\historia.doc'
$out = [IO.Path]::GetFullPath($out)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Add()
  $sel = $word.Selection
  $sel.TypeText('CAPÍTULO I')
  $sel.TypeParagraph()
  $sel.TypeText('Historia de Huancavelica')
  $sel.TypeParagraph()
  $sel.TypeText('Huancavelica fue conocida en la época colonial por sus minas de mercurio, esenciales para la producción de plata.')
  $sel.TypeParagraph()
  $sel.TypeText('1. La mina de Santa Bárbara')
  $sel.TypeParagraph()
  $sel.TypeText('La mina atrajo a miles de trabajadores y marcó la vida de la región durante siglos. ¿Cuál fue su legado? La niñez y la economía local cambiaron para siempre.')
  $sel.TypeParagraph()
  $sel.TypeText('CONCLUSIONES')
  $sel.TypeParagraph()
  $sel.TypeText('La historia minera explica buena parte de la identidad actual de la ciudad.')
  # 0 = wdFormatDocument (Word 97-2003)
  $doc.SaveAs2([ref]$out, [ref]0)
  $doc.Close([ref]0)
  Write-Output "Creado $out"
} finally {
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
