/** Test/diagnostic: how often the native folder picker was opened (must stay 0 during first-run book open). */
let folderPickerInvocationCount = 0;

export function recordFolderPickerInvocation(): void {
  folderPickerInvocationCount += 1;
}

export function getFolderPickerInvocationCount(): number {
  return folderPickerInvocationCount;
}

export function resetFolderPickerInvocationCount(): void {
  folderPickerInvocationCount = 0;
}