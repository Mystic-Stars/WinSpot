!include "LogicLib.nsh"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $R0 < 22621
    MessageBox MB_OK|MB_ICONEXCLAMATION "WinSpot requires Windows 11 22H2 (build 22621) or newer."
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WinSpot"
!macroend
