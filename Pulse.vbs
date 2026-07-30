' Pulse 启动器 - 完全隐藏控制台窗口
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c npm start", 0, False
Set WshShell = Nothing
