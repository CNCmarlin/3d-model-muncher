Select-String -Path server.js.bak -Pattern 'app\.(get|post|put|delete|use|patch)\s*\(' | ForEach-Object { "$($_.LineNumber):$($_.Line)" } | Out-File -Encoding UTF8 endpoint_list_clean.txt
