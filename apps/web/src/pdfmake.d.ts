declare module "pdfmake/build/pdfmake" {
  type PdfDocument = { download: (fileName: string) => Promise<void> | void };
  type PdfMake = {
    addVirtualFileSystem: (files: Record<string, string>) => void;
    addFonts: (fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>) => void;
    createPdf: (definition: unknown) => PdfDocument;
  };
  const pdfMake: PdfMake;
  export default pdfMake;
}
