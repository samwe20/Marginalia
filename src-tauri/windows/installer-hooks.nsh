; Clean-install contract:
; - silently remove a previous Marginalia installation before copying the new one;
; - delete only app-owned roaming/local AppData for this bundle identifier;
; - never delete, move, or traverse the user's library.
;
; The app records its selected library in HKCU\Software\<bundle-id>\LibraryRoot.
; If a user deliberately selected an app-data directory (or one of its parents),
; safety wins: that whole app-data root is left in place rather than risking data loss.

Var MarginaliaLibraryRoot
Var MarginaliaPreviousInstallRoot
Var MarginaliaUninstaller
Var MarginaliaUninstallExitCode

!macro MARGINALIA_WIPE_OWNED_ROOT ROOT LABEL
  StrCpy $R0 "${ROOT}"
  StrCpy $R5 0

  ; StrLoc returns an empty string when the substring is absent. Use the
  ; string comparison operator (`==`): numeric `=` treats "" as zero and
  ; would falsely classify every unrelated path as overlapping the library.
  ${If} $MarginaliaLibraryRoot != ""
    ${StrCase} $R1 "$MarginaliaLibraryRoot" "L"
    ${StrCase} $R2 "$R0" "L"

    ; Library is equal to or inside this app-data root.
    StrCpy $R3 "$R1\"
    StrCpy $R4 "$R2\"
    ${StrLoc} $R6 $R3 $R4 ">"
    ${If} "$R6" == "0"
      StrCpy $R5 1
    ${EndIf}

    ; This app-data root is inside the chosen library.
    ${StrLoc} $R6 $R4 $R3 ">"
    ${If} "$R6" == "0"
      StrCpy $R5 1
    ${EndIf}
  ${EndIf}

  ${If} $R5 = 1
    DetailPrint "Library safety: keeping $R0 because it overlaps the selected library."
  ${Else}
    DetailPrint "Clean install: removing ${LABEL} $R0"
    RMDir /r "$R0"
    ${If} ${FileExists} "$R0"
      Abort "Clean install could not remove ${LABEL}: $R0"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  SetShellVarContext current

  ; Read the safety guard before invoking an old uninstaller. The application
  ; always stores this per-user even if an older app was installed per-machine.
  ReadRegStr $MarginaliaLibraryRoot HKCU "Software\${BUNDLEID}" "LibraryRoot"

  ; PREINSTALL runs before Tauri's own process check, but we must remove the old
  ; directory here. Stop a running app first so no executable or WebView file is
  ; left locked during the recursive cleanup.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Tauri's Install section called SetOutPath "$INSTDIR" immediately before
  ; this hook. Windows cannot remove a process's current working directory, so
  ; leave it before recursively deleting the old/target install root.
  SetOutPath "$TEMP"

  ; Prefer the configured target, then the previous Tauri install location.
  ; SHCTX is HKCU for currentUser; explicit HKCU/HKLM fallbacks also cover an
  ; install made with an older mode.
  StrCpy $MarginaliaPreviousInstallRoot "$INSTDIR"
  ReadRegStr $R0 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $R0 != ""
    StrCpy $MarginaliaPreviousInstallRoot "$R0"
  ${EndIf}
  ReadRegStr $MarginaliaUninstaller SHCTX "${UNINSTKEY}" "UninstallString"

  ${If} $MarginaliaUninstaller == ""
    ReadRegStr $R0 HKCU "${MANUPRODUCTKEY}" ""
    ${If} $R0 != ""
      StrCpy $MarginaliaPreviousInstallRoot "$R0"
    ${EndIf}
    ReadRegStr $MarginaliaUninstaller HKCU "${UNINSTKEY}" "UninstallString"
  ${EndIf}

  ${If} $MarginaliaUninstaller == ""
    ReadRegStr $R0 HKLM "${MANUPRODUCTKEY}" ""
    ${If} $R0 != ""
      StrCpy $MarginaliaPreviousInstallRoot "$R0"
    ${EndIf}
    ReadRegStr $MarginaliaUninstaller HKLM "${UNINSTKEY}" "UninstallString"
  ${EndIf}

  ; Rebuild a known-good quoted command when the normal Tauri uninstaller is
  ; present. `_?=` keeps its $INSTDIR on the original directory.
  ${If} ${FileExists} "$MarginaliaPreviousInstallRoot\uninstall.exe"
    StrCpy $MarginaliaUninstaller '"$MarginaliaPreviousInstallRoot\uninstall.exe"'
  ${EndIf}

  ${If} $MarginaliaUninstaller != ""
    DetailPrint "Clean install: silently uninstalling previous ${PRODUCTNAME}."
    ClearErrors
    ExecWait '$MarginaliaUninstaller /S /UPDATE _?=$MarginaliaPreviousInstallRoot' $MarginaliaUninstallExitCode
    ${If} ${Errors}
    ${OrIf} $MarginaliaUninstallExitCode != 0
      Abort "Previous ${PRODUCTNAME} installation could not be removed (exit $MarginaliaUninstallExitCode)."
    ${EndIf}
  ${EndIf}

  ; Tauri's uninstaller removes only files it installed and intentionally leaves
  ; unknown files behind. A clean reinstall removes the remaining app-owned root.
  !insertmacro MARGINALIA_WIPE_OWNED_ROOT "$MarginaliaPreviousInstallRoot" "previous install"
  !insertmacro MARGINALIA_WIPE_OWNED_ROOT "$INSTDIR" "target install"
  !insertmacro MARGINALIA_WIPE_OWNED_ROOT "$APPDATA\${BUNDLEID}" "roaming AppData"
  !insertmacro MARGINALIA_WIPE_OWNED_ROOT "$LOCALAPPDATA\${BUNDLEID}" "local AppData"

  ; This value exists only to protect the library during clean install.
  ; Removing it also means the new app starts without the old library preference.
  DeleteRegKey HKCU "Software\${BUNDLEID}"

  ; The parent template called SetOutPath before this hook. Recreate the target
  ; after the recursive clean so the following File instructions can copy into it.
  SetOutPath "$INSTDIR"
!macroend
