# Manual tool (needs Excel; not part of npm run verify).
# Recalculates an EU Communication copy (.xlsx) fully in real Excel, then lists error cells (#N/A, #REF!, ...)
# and the Summary_Products result row. Usage: powershell -File scripts/excel-recalc-check.ps1 <copy.xlsx>
param([Parameter(Mandatory = $true)][string]$Path)
$full = (Resolve-Path $Path).Path
$x = New-Object -ComObject Excel.Application
$x.Visible = $false; $x.DisplayAlerts = $false
try {
    $wb = $x.Workbooks.Open($full)
    $x.CalculateFullRebuild()
    $errors = @()
    foreach ($ws in $wb.Worksheets) {
        # Value2 of an error cell is an Int32 error code (#N/A = -2146826246). Reading the array also works on protected sheets.
        $used = $ws.UsedRange
        $vals = $used.Value2
        if ($vals -isnot [System.Array]) { continue }
        $r0 = $used.Row; $c0 = $used.Column
        for ($r = 1; $r -le $vals.GetLength(0); $r++) {
            for ($c = 1; $c -le $vals.GetLength(1); $c++) {
                $v = $vals[$r, $c]
                if ($v -is [int] -and $v -le -2146826246 -and $v -ge -2146826259) {
                    $errors += ('{0}!{1} code {2}' -f $ws.Name, $ws.Cells.Item($r0 + $r - 1, $c0 + $c - 1).Address($false, $false), $v)
                }
            }
        }
    }
    $sp = $wb.Worksheets.Item('Summary_Products')
    # One line per product row (rows 10..19 hold the example/real rows): goods category | direct / indirect / total SEE
    foreach ($row in 10..19) {
        if ($sp.Range("E$row").Value2) {
            Write-Output ('Summary_Products row {0}: {1} | I/J/K = {2} / {3} / {4}' -f $row, $sp.Range("G$row").Value2, $sp.Range("I$row").Value2, $sp.Range("J$row").Value2, $sp.Range("K$row").Value2)
        }
    }
    Write-Output ('error cells: {0}' -f $errors.Count)
    $errors | Select-Object -First 20
    $wb.Close($false)
} finally { $x.Quit() }
