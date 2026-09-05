import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { FinalReviewInput } from "./final-review";
import { sourceFixture, type SourceRecord } from "./source-discovery";
import type { TeachingContextDraft } from "./teaching-context";

export type ExportFormat = "docx" | "pdf";
export type TeachingPackExport = { context: TeachingContextDraft; input: FinalReviewInput; fileName: string; sources?: SourceRecord[]; subQuestions?: string[]; evidenceNotes?: string[]; revisionLabel?: string };

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const selectedSources = (pack: TeachingPackExport) => (pack.sources ?? sourceFixture).filter((source) => pack.input.selectedSourceIds.includes(source.id));
const sourceNames = (pack: TeachingPackExport, ids: string[]) => ids.map((id) => (pack.sources ?? sourceFixture).find((source) => source.id === id)?.title || id).join("、");
const activityRange = (pack: TeachingPackExport, index: number) => {
  const start = pack.input.lesson.activities.slice(0, index).reduce((total, activity) => total + activity.minutes + activity.transitionMinutes, 0);
  return `${start}—${start + pack.input.lesson.activities[index].minutes + pack.input.lesson.activities[index].transitionMinutes} 分钟`;
};
const heading = (text: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2) => new Paragraph({ text, heading: level, keepNext: true, spacing: { before: level === HeadingLevel.HEADING_1 ? 320 : 220, after: 100 } });
const paragraph = (text: string) => new Paragraph({ children: [new TextRun(text)], spacing: { after: 100, line: 360 } });

export async function exportTeachingPackDocx(pack: TeachingPackExport) {
  const sources = selectedSources(pack);
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new TextRun({ text: "史证工坊｜历史证据探究教学包", bold: true, size: 34 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`${pack.context.grade} · ${pack.context.minutes} 分钟 · ${pack.context.textbook}`)] }),
    heading("一、教学情境", HeadingLevel.HEADING_1), paragraph(`课次：${pack.context.lesson}`), paragraph(`学生已有基础：${pack.context.priorKnowledge || "未填写"}`), paragraph(`本课学习需要：${pack.context.learningNeeds.join("、") || "未填写"}`),
    heading("二、探究问题", HeadingLevel.HEADING_1), paragraph(pack.input.question), ...(pack.subQuestions ?? []).map(text => paragraph(`子问题：${text}`)), ...(pack.evidenceNotes ?? []).map(paragraph),
    heading("三、史料目录与解读", HeadingLevel.HEADING_1),
    ...sources.flatMap((source, index) => [heading(`${index + 1}. ${source.title}`, HeadingLevel.HEADING_2), paragraph(`${source.nature}｜${source.institution}｜${source.period}`), paragraph(`定位：${source.locator}`), paragraph(`材料节选：${source.excerpt}`), paragraph(`材料释义：${source.meaning}`), paragraph(`可论证什么：${source.interpretation}`), paragraph(`使用边界：${source.limitation}`), new Paragraph({ children: source.url ? [new ExternalHyperlink({ link: source.url, children: [new TextRun({ text: "查看公开来源", color: "7A3E27", underline: {} })] })] : [new TextRun("无外部链接；按上述材料定位核对。")], spacing: { after: 120 } })]),
    heading("四、课堂活动", HeadingLevel.HEADING_1),
    ...pack.input.lesson.activities.flatMap((activity, index) => [heading(`${index + 1}. ${activity.title}（${activityRange(pack, index)}）`, HeadingLevel.HEADING_2), paragraph(`学生动作：${activity.studentAction}`), paragraph(`使用史料：${sourceNames(pack, activity.sourceIds)}`), paragraph(`预期成果：${activity.evidenceProduct}`), paragraph(`可能卡点：${activity.difficulty}`), paragraph(`教师引导：${activity.scaffold}`)]),
    heading("五、评价量规", HeadingLevel.HEADING_1),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ children: ["评价维度", "需要支持", "达到要求", "表现充分"].map((text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })) }),
      ...pack.input.rubric.dimensions.map((dimension) => new TableRow({ children: [dimension.title, ...dimension.levels.map((item) => item.description)].map((text) => new TableCell({ children: [paragraph(text)], borders: { top: { style: BorderStyle.SINGLE, size: 2, color: "BCA98E" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "BCA98E" }, left: { style: BorderStyle.SINGLE, size: 2, color: "BCA98E" }, right: { style: BorderStyle.SINGLE, size: 2, color: "BCA98E" } } })) })),
    ] }),
    heading("六、使用说明", HeadingLevel.HEADING_1), paragraph("本教学包为可试教候选。短引、来源定位与链接用于课堂备课；请按各来源页面标注的权利边界使用，不包含馆藏图片或长篇说明。"), paragraph(pack.revisionLabel ?? "史证工坊公开演示数据保存在当前浏览器；前端展示不代表真实安全授权。"),
  ];
  const document = new Document({ styles: { default: { document: { run: { font: "Noto Sans CJK SC", size: 21 }, paragraph: { spacing: { line: 320 } } } } }, sections: [{ properties: {}, children }] });
  downloadBlob(await Packer.toBlob(document), `${pack.fileName}.docx`);
}

const toBase64 = (buffer: ArrayBuffer) => {
  let binary = ""; const bytes = new Uint8Array(buffer); const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
};

export async function exportTeachingPackPdf(pack: TeachingPackExport) {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const response = await fetch(`${import.meta.env.BASE_URL}assets/export/NotoSansSC-Variable.ttf`);
  if (!response.ok) throw new Error("中文字体资源未能读取");
  pdfMake.addVirtualFileSystem({ "NotoSansSC.ttf": toBase64(await response.arrayBuffer()) });
  pdfMake.addFonts({ NotoSansSC: { normal: "NotoSansSC.ttf", bold: "NotoSansSC.ttf", italics: "NotoSansSC.ttf", bolditalics: "NotoSansSC.ttf" } });
  const sources = selectedSources(pack);
  const content: unknown[] = [
    { text: "史证工坊｜历史证据探究教学包", style: "title" },
    { text: `${pack.context.grade} · ${pack.context.minutes} 分钟 · ${pack.context.textbook}`, style: "meta" },
    { text: "一、教学情境", style: "h1" }, { text: `课次：${pack.context.lesson}\n学生已有基础：${pack.context.priorKnowledge || "未填写"}\n本课学习需要：${pack.context.learningNeeds.join("、") || "未填写"}` },
    { text: "二、探究问题", style: "h1" }, { text: pack.input.question }, ...(pack.subQuestions ?? []).map(text => ({ text: `子问题：${text}` })), ...(pack.evidenceNotes ?? []).map(text => ({ text })),
    { text: "三、史料目录与解读", style: "h1" },
    ...sources.flatMap((source, index) => [{ text: `${index + 1}. ${source.title}`, style: "h2" }, { text: `${source.nature}｜${source.institution}｜${source.period}\n定位：${source.locator}\n材料节选：${source.excerpt}\n材料释义：${source.meaning}\n可论证什么：${source.interpretation}\n使用边界：${source.limitation}\n来源：${source.url}` }]),
    { text: "四、课堂活动", style: "h1" },
    ...pack.input.lesson.activities.flatMap((activity, index) => [{ text: `${index + 1}. ${activity.title}（${activityRange(pack, index)}）`, style: "h2" }, { text: `学生动作：${activity.studentAction}\n使用史料：${sourceNames(pack, activity.sourceIds)}\n预期成果：${activity.evidenceProduct}\n可能卡点：${activity.difficulty}\n教师引导：${activity.scaffold}` }]),
    { text: "五、评价量规", style: "h1" },
    { table: { headerRows: 1, widths: [70, "*", "*", "*"], body: [["评价维度", "需要支持", "达到要求", "表现充分"], ...pack.input.rubric.dimensions.map((dimension) => [dimension.title, ...dimension.levels.map((item) => item.description)])] }, layout: "lightHorizontalLines", fontSize: 8 },
    { text: "六、使用说明", style: "h1" }, { text: "本教学包为可试教候选。短引、来源定位与链接用于课堂备课；请按各来源页面标注的权利边界使用，不包含馆藏图片或长篇说明。" + "\n" + (pack.revisionLabel ?? "史证工坊公开演示数据保存在当前浏览器；前端展示不代表真实安全授权。") },
  ];
  await pdfMake.createPdf({ pageSize: "A4", pageMargins: [46, 52, 46, 52], content, defaultStyle: { font: "NotoSansSC", fontSize: 10, lineHeight: 1.45, color: "#2d2923" }, styles: { title: { fontSize: 20, bold: true, alignment: "center", margin: [0, 0, 0, 8] }, meta: { fontSize: 9, color: "#6e675e", alignment: "center", margin: [0, 0, 0, 20] }, h1: { fontSize: 14, bold: true, color: "#763f2d", margin: [0, 18, 0, 7] }, h2: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] } }, footer: (currentPage: number, pageCount: number) => ({ text: `${currentPage} / ${pageCount}`, alignment: "center", fontSize: 8, color: "#8b8176" }) }).download(`${pack.fileName}.pdf`);
}

export async function exportTeachingPack(format: ExportFormat, pack: TeachingPackExport) {
  if (format === "docx") return exportTeachingPackDocx(pack);
  return exportTeachingPackPdf(pack);
}
