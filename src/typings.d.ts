// Minimal ambient declaration to allow importing `xlsx-populate` without
// TypeScript error when the package doesn't provide its own types.
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
