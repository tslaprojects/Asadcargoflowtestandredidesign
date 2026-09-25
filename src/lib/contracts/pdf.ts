import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ContractParty = { role: string; name: string; requisites: string[] };

export type ContractData = {
  contractNumber: string;
  orderNumber: string;
  orderId: string;
  version: number;
  createdAt: string;
  title: string;
  parties: ContractParty[];
  route: { label: string; address: string; date: string }[];
  cargo: { label: string; value: string }[];
  amount: string;
  currency: string;
  loadingDate: string;
  deliveryDate: string;
};

export type ContractSignatureInfo = {
  signerName: string;
  companyName: string;
  side: string;
  signedAt: string;
  method: string;
  documentHash: string;
  ipAddress: string | null;
};

let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), "assets", "fonts");
  const [regular, bold] = await Promise.all([readFile(path.join(dir, "DejaVuSans.ttf")), readFile(path.join(dir, "DejaVuSans-Bold.ttf"))]);
  fontCache = { regular, bold };
  return fontCache;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 50;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.11, 0.3, 0.72);
const LINE = rgb(0.86, 0.88, 0.91);

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    private doc: PDFDocument,
    public font: PDFFont,
    public bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pageNo += 1;
    this.y = A4.h - MARGIN;
    this.page.drawText(this.footer, { x: MARGIN, y: 24, size: 7, font: this.font, color: MUTED });
    this.page.drawText(`стр. ${this.pageNo}`, { x: A4.w - MARGIN - 30, y: 24, size: 7, font: this.font, color: MUTED });
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 10) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      if (para.trim() === "") {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          // очень длинное слово (например, hash) — режем посимвольно
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > width) {
            let i = rest.length;
            while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > width) i--;
            lines.push(rest.slice(0, i));
            rest = rest.slice(i);
          }
          line = rest;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    text: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {},
  ) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? A4.w - MARGIN - x;
    const lh = size * 1.4;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lh);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 0;
  }

  heading(text: string) {
    this.ensure(30);
    this.y -= 8;
    this.page.drawText(text.toUpperCase(), { x: MARGIN, y: this.y - 10, size: 10, font: this.bold, color: ACCENT });
    this.y -= 16;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4.w - MARGIN, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 8;
  }

  keyValue(key: string, value: string) {
    const keyWidth = 150;
    const size = 9.5;
    const lines = this.wrap(value || "—", this.font, size, A4.w - MARGIN * 2 - keyWidth);
    const lh = size * 1.4;
    this.ensure(lh * lines.length);
    this.page.drawText(key, { x: MARGIN, y: this.y - size, size, font: this.font, color: MUTED });
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + keyWidth, y: this.y - size, size, font: this.font, color: INK });
      this.y -= lh;
    }
    this.y -= 2;
  }
}

/**
 * PDF договора. Содержимое строится из зафиксированного snapshot (текст + данные),
 * поэтому PDF одной версии договора стабилен; меняется только блок истории подписания.
 */
export async function renderContractPdf(input: {
  data: ContractData;
  content: string;
  contentHash: string;
  status: string;
  signatures: ContractSignatureInfo[];
}): Promise<Uint8Array> {
  const { regular, bold } = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regular, { subset: true });
  const boldFont = await doc.embedFont(bold, { subset: true });
  const { data } = input;

  doc.setTitle(`${data.title} № ${data.contractNumber}`);
  doc.setAuthor("CargoFlow");
  doc.setSubject(`Сделка ${data.orderNumber}`);
  doc.setCreator("CargoFlow MVP");
  doc.setProducer("CargoFlow");
  doc.setCreationDate(new Date(data.createdAt));

  const w = new Writer(
    doc,
    font,
    boldFont,
    `CargoFlow · Договор ${data.contractNumber} · версия ${data.version} · SHA-256: ${input.contentHash.slice(0, 16)}…`,
  );

  // Шапка
  w.page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: ACCENT });
  w.page.drawText("CargoFlow", { x: MARGIN, y: w.y - 14, size: 14, font: boldFont, color: ACCENT });
  w.page.drawText("Цифровая платформа международных грузоперевозок", {
    x: MARGIN + 88,
    y: w.y - 13,
    size: 8,
    font,
    color: MUTED,
  });
  w.y -= 34;
  w.text(`${data.title}`, { size: 14, bold: true });
  w.text(`№ ${data.contractNumber} от ${data.createdAt.slice(0, 10).split("-").reverse().join(".")}`, { size: 11, gap: 4 });
  w.keyValue("Версия документа", String(data.version));
  w.keyValue("Идентификатор сделки", `${data.orderNumber} (${data.orderId})`);
  w.keyValue("Статус", input.status);

  w.heading("Стороны");
  for (const p of data.parties) {
    w.text(`${p.role}: ${p.name}`, { bold: true });
    for (const r of p.requisites) w.text(r, { color: MUTED, x: MARGIN + 12 });
    w.y -= 4;
  }

  w.heading("Маршрут");
  data.route.forEach((r, i) => w.keyValue(`${i + 1}. ${r.label}`, `${r.address}${r.date ? ` · ${r.date}` : ""}`));

  w.heading("Груз");
  data.cargo.forEach((c) => w.keyValue(c.label, c.value));

  w.heading("Стоимость и сроки");
  w.keyValue("Стоимость перевозки", `${data.amount} ${data.currency}`);
  w.keyValue("Дата загрузки", data.loadingDate);
  w.keyValue("Дата доставки", data.deliveryDate);

  w.heading("Текст договора");
  w.text(input.content, { size: 9 });

  w.heading("История электронного подписания");
  if (input.signatures.length === 0) {
    w.text("Документ ещё не подписан ни одной из сторон.", { color: MUTED });
  }
  for (const s of input.signatures) {
    w.text(`${s.side}: ${s.companyName}`, { bold: true });
    w.keyValue("Подписант", s.signerName);
    w.keyValue("Дата и время (UTC)", s.signedAt);
    w.keyValue("Способ", s.method);
    w.keyValue("Hash документа", s.documentHash);
    if (s.ipAddress) w.keyValue("IP-адрес", s.ipAddress);
    w.y -= 4;
  }

  w.heading("Контроль целостности");
  w.keyValue("Алгоритм", "SHA-256 (текст договора)");
  w.keyValue("Hash", input.contentHash);
  w.text(
    "Подписание выполнено посредством внутреннего электронного подтверждения платформы CargoFlow и не является квалифицированной электронной подписью. Демонстрационный шаблон должен быть адаптирован юристами под применимое право.",
    { size: 8, color: MUTED },
  );

  return doc.save();
}
