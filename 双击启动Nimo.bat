@echo off
start "" /min powershell -WindowStyle Hidden -Command "Start-Process -FilePath 'G:\emo\node_modules\electron\dist\electron.exe' -ArgumentList '.' -WorkingDirectory 'G:\emo' -WindowStyle Hidden"
