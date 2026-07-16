# 导出后处理:更新目录页码 + 隐藏拼写/语法波浪线 + 保存
param([string]$File)
if (-not $File) { $File = (Get-ChildItem "D:\Agent files\claude\projects\ur-esports\战术本导出\UR战术本_*.docx" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
$app = New-Object -ComObject KWPS.Application
$app.Visible = $false
$doc = $app.Documents.Open($File)
if ($null -eq $doc) {
  $app.Quit()
  Write-Output "跳过后处理：文件正被占用（请先关闭 WPS 中打开的战术本再运行）。文档打开时会自动提示更新目录，不影响使用。"
  exit 0
}
try { $doc.TablesOfContents.Item(1).Update() } catch {}
try { $doc.ShowSpellingErrors = $false; $doc.ShowGrammaticalErrors = $false } catch {}
try { $doc.SpellingChecked = $true; $doc.GrammarChecked = $true } catch {}
$doc.Save()
$doc.Close($false)
$app.Quit()
Write-Output "后处理完成: $File"
