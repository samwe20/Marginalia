; Clean-install contract:
; - silently remove a previous Marginalia installation before copying the new one;
; - delete only app-owned roaming/local AppData for this bundle identifier;
; - never delete, move, or traverse the user's library.
;
; The app records its selected library in HKCU\Software\<bundle-id>\LibraryRoot.
; If a user deliberately selected an app-data directory (or one of its parents),
; safety wins: that whole app-data root is left in place rather than risking data loss.

Var MarginaliaLibraryRoot

!macro MARGINALIA_WIPE_APPDATA APPROOT
  StrCpy $R0 "${APPROOT}"
  StrCpy $R5 0

  ${If} $MarginaliaLibraryRoot != ""
    ${StrCase} $R1 "$MarginaliaLibraryRoot" "L"
    ${StrCase} $R2 "$R0" "L"

    ; Library is equal to or inside this app-data root.
    StrCpy $R3 "$R1\"
    StrCpy $R4 "$R2\"
    ${StrLoc} $R6 $R3 $R4 ">"
    ${If} $R6 = 0
      StrCpy $R5 1
    ${EndIf}

    ; This app-data root is inside the chosen library.
    ${StrLoc} $R6 $R4 $R3 ">"
    ${If} $R6 = 0
      StrCpy $R5 1
    ${EndIf}
  ${EndIf}

  ${If} $R5 = 1
    DetailPrint "Library safety: keeping $R0 because it overlaps the selected library."
  ${Else}
    DetailPrint "Clean install: removing app data $R0"
    RMDir /r "$R0"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  SetShellVarContext current

  ; Tauri normally handles the reinstall page. This covers silent/update paths too.
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${If} $R0 != ""
    DetailPrint "Clean install: silently uninstalling previous ${PRODUCTNAME}."
    ClearErrors
    ExecWait '$R0 /S /UPDATE' $R1
    ${If} ${Errors}
    ${OrIf} $R1 != 0
      Abort "Previous ${PRODUCTNAME} installation could not be removed (exit $R1)."
    ${EndIf}
  ${EndIf}

  ReadRegStr $MarginaliaLibraryRoot HKCU "Software\${BUNDLEID}" "LibraryRoot"
  !insertmacro MARGINALIA_WIPE_APPDATA "$APPDATA\${BUNDLEID}"
  !insertmacro MARGINALIA_WIPE_APPDATA "$LOCALAPPDATA\${BUNDLEID}"

  ; This value exists only to protect the library during clean install.
  ; Removing it also means the new app starts without the old library preference.
  DeleteRegKey HKCU "Software\${BUNDLEID}"
!macroend
