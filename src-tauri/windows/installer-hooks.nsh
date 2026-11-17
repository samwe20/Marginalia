; Clean reinstall uses Tauri's own uninstaller and its built-in
; "Delete the application data" branch. It never touches a library path.

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${If} $R0 != ""
    DetailPrint "Clean install: running the previous ${PRODUCTNAME} uninstaller."
    ClearErrors
    ExecWait '$R0 /S /DELETEAPPDATA' $R1
    ${If} ${Errors}
    ${OrIf} $R1 != 0
      Abort "Previous ${PRODUCTNAME} installation could not be removed (exit $R1)."
    ${EndIf}
  ${EndIf}
!macroend

; Tauri's uninstaller normally sets this variable from the UI checkbox.
; `/DELETEAPPDATA` provides the same choice to the silent uninstall above;
; Tauri performs the actual deletion of the two identifier AppData folders.
!macro NSIS_HOOK_PREUNINSTALL
  ${GetOptions} $CMDLINE "/DELETEAPPDATA" $R0
  ${IfNot} ${Errors}
    StrCpy $DeleteAppDataCheckboxState 1
  ${EndIf}
!macroend
