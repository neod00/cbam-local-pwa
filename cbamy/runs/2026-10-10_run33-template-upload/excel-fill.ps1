# run33 - open the blank v2 workbook in real Excel, check what Excel sees (dropdowns, frozen header, mirrored names),
# type the sample values into the cells like a person would, and save a copy. Needs Excel.
# Usage: powershell -File excel-fill.ps1 <blank.xlsx> <cells.json> <out.xlsx>
param([string]$Blank, [string]$Cells, [string]$Out)
$blankPath = (Resolve-Path $Blank).Path
$outPath = [System.IO.Path]::GetFullPath($Out)
$items = Get-Content -Raw -Encoding UTF8 $Cells | ConvertFrom-Json
$x = New-Object -ComObject Excel.Application
$x.Visible = $false; $x.DisplayAlerts = $false
try {
    $wb = $x.Workbooks.Open($blankPath)
    Write-Output ('sheets: {0}' -f $wb.Worksheets.Count)
    foreach ($ws in $wb.Worksheets) {
        $count = 0
        try { $count = $ws.Cells.SpecialCells(-4174).Count } catch { $count = 0 }   # xlCellTypeAllValidation
        Write-Output ('  sheet {0}: used {1}, validation cells {2}' -f $ws.Index, $ws.UsedRange.Address($false, $false), $count)
    }
    # dropdown of the fuel-kind column (sheet 5, B5) and how many entries its list range has
    $fuel = $wb.Worksheets.Item(5)
    $v = $fuel.Range('B5').Validation
    Write-Output ('fuel kind dropdown: type {0}, formula {1}, entries {2}' -f $v.Type, $v.Formula1, $x.Evaluate($v.Formula1).Count)
    foreach ($item in $items) {
        $ws = $wb.Worksheets.Item([string]$item[0])
        # typed as text, the way a person types: Excel turns number-looking text into numbers unless the cell is text-formatted
        $ws.Range([string]$item[1]).Formula = [string]$item[2]
    }
    $x.CalculateFullRebuild()
    # the process-name list on the lists sheet mirrors what was typed on the process sheet
    $lists = $wb.Worksheets.Item($wb.Worksheets.Count)
    $colOf = { param($title) foreach ($c in 1..$lists.UsedRange.Columns.Count) { if ($lists.Cells.Item(1, $c).Text -eq $title) { return $c } } return 1 }
    $pc = & $colOf '쓰는 공정(구매 강재)'; $qc = & $colOf '제품'
    Write-Output ('mirrored process names: {0} | {1}' -f $lists.Cells.Item(2, $pc).Text, $lists.Cells.Item(3, $pc).Text)
    Write-Output ('mirrored product names: {0} | {1}' -f $lists.Cells.Item(2, $qc).Text, $lists.Cells.Item(3, $qc).Text)
    # a date typed as a real date into the period cell stays text because the cell is text-formatted
    $inst = $wb.Worksheets.Item(2)
    $startCell = ($items | Where-Object { $_[2] -eq '2025-01-01' })[1]
    Write-Output ('period start cell {0}: text "{1}", number format "{2}"' -f $startCell, $inst.Range([string]$startCell).Text, $inst.Range([string]$startCell).NumberFormat)
    $errors = 0
    foreach ($ws in $wb.Worksheets) {
        $vals = $ws.UsedRange.Value2
        if ($vals -is [System.Array]) { foreach ($val in $vals) { if ($val -is [int] -and $val -le -2146826246 -and $val -ge -2146826259) { $errors++ } } }
    }
    Write-Output ('error cells: {0}' -f $errors)
    $wb.SaveAs($outPath, 51)
    $wb.Close($false)
    Write-Output ('saved {0}' -f $outPath)
} finally { $x.Quit() }
