# run35 - open the blank v2 workbook in real Excel, type the cells like a person would, save a copy. Needs Excel.
# Usage: powershell -File excel-type.ps1 <blank.xlsx> <cells.json> <out.xlsx>
param([string]$Blank, [string]$Cells, [string]$Out)
$blankPath = (Resolve-Path $Blank).Path
$outPath = [System.IO.Path]::GetFullPath($Out)
$items = Get-Content -Raw -Encoding UTF8 $Cells | ConvertFrom-Json
$x = New-Object -ComObject Excel.Application
$x.Visible = $false; $x.DisplayAlerts = $false
try {
    $wb = $x.Workbooks.Open($blankPath)
    foreach ($item in $items) {
        $ws = $wb.Worksheets.Item([string]$item[0])
        $ws.Range([string]$item[1]).Formula = [string]$item[2]
    }
    $x.CalculateFullRebuild()
    # what the dropdown of "where" (fuel sheet, D5) offers after typing: the process-name list mirrors the process sheet
    $fuel = $wb.Worksheets.Item('4_연료')
    $v = $fuel.Range('D5').Validation
    $names = @(); foreach ($c in $x.Evaluate($v.Formula1)) { if ($c.Text -ne '') { $names += $c.Text } }
    Write-Output ('fuel "where" dropdown offers: {0}' -f ($names -join ' | '))
    $pre = $wb.Worksheets.Item('5_구매강재')
    $v2 = $pre.Range('F5').Validation
    $names2 = @(); foreach ($c in $x.Evaluate($v2.Formula1)) { if ($c.Text -ne '') { $names2 += $c.Text } }
    Write-Output ('precursor "where" dropdown offers: {0}' -f ($names2 -join ' | '))
    $wb.SaveAs($outPath, 51)
    $wb.Close($false)
    Write-Output ('typed {0} cells, saved {1}' -f $items.Count, $outPath)
} finally { $x.Quit() }
