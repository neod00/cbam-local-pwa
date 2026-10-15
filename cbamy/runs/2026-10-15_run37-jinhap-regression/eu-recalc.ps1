# run36 - open the EU Communication workbook in real Excel, recalculate everything, count error cells, dump the summary sheets.
param([string]$Path)
$x = New-Object -ComObject Excel.Application
$x.Visible = $false; $x.DisplayAlerts = $false
try {
    $wb = $x.Workbooks.Open((Resolve-Path $Path).Path, 0, $true)
    $x.CalculateFullRebuild()
    $errors = 0
    foreach ($ws in $wb.Worksheets) {
        try { $cells = $ws.UsedRange.SpecialCells(-4123, 16); $errors += $cells.Count; Write-Output ("ERR {0}: {1} {2}" -f $ws.Name, $cells.Count, $cells.Address($false,$false).Substring(0, [Math]::Min(120, $cells.Address($false,$false).Length))) } catch {}
    }
    Write-Output ("error cells: {0}" -f $errors)
    foreach ($name in @('Summary_Products', 'Summary_Communication')) {
        $ws = $wb.Worksheets.Item($name)
        $v = $ws.UsedRange.Value2
        $rows = $v.GetLength(0); $cols = $v.GetLength(1)
        Write-Output ("=== {0} ({1}x{2})" -f $name, $rows, $cols)
        for ($r = 1; $r -le [Math]::Min($rows, 140); $r++) {
            $parts = @()
            for ($c = 1; $c -le $cols; $c++) { $cell = $v[$r, $c]; if ($null -ne $cell -and "$cell" -ne '' -and "$cell" -ne '0') { $t = "$cell"; if ($t.Length -gt 46) { $t = $t.Substring(0, 46) }; $parts += $t } }
            if ($parts.Count -ge 3) { Write-Output ("[{0}] {1}" -f $r, ($parts -join ' | ')) }
        }
    }
    $wb.Close($false)
} finally { $x.Quit() }
