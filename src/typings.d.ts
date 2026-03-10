declare module 'xlsx-populate' {
  const XlsxPopulate: any;
  export default XlsxPopulate;
}

declare module 'xlsx-populate/browser/xlsx-populate' {
  const XlsxPopulate: any;
  export default XlsxPopulate;
}

declare module 'xlsx-populate/browser/xlsx-populate.js' {
  const XlsxPopulate: any;
  export default XlsxPopulate;
}

interface Window {
  XlsxPopulate?: any;
  electronApi?: {
    readAssetFile(relativeAssetPath: string): Promise<ArrayBuffer | Uint8Array>;
    saveExportFile(
      fileName: string,
      binary: ArrayBuffer | Uint8Array
    ): Promise<{ path: string }>;
    openExportFile(
      filePath: string
    ): Promise<{ ok: boolean; error: string | null }>;
  };
}
