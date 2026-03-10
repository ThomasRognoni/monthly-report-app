const fs = require('fs');
const path = require('path');

const mdPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'docs', 'guida-utente.md');
const outPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, '..', 'docs', 'guida-utente.pdf');

const PAGE_WIDTH = 595.28; // A4 points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 28;

const styles = {
  h1: { size: 18, leading: 22, spaceAfter: 10, indent: 0 },
  h2: { size: 14, leading: 18, spaceAfter: 8, indent: 0 },
  h3: { size: 12, leading: 16, spaceAfter: 6, indent: 0 },
  para: { size: 11, leading: 15, spaceAfter: 6, indent: 0 },
  li: { size: 11, leading: 15, spaceAfter: 2, indent: 12, prefix: '- ' },
  num: { size: 11, leading: 15, spaceAfter: 2, indent: 12, prefix: '' },
  space: { size: 0, leading: 0, spaceAfter: 6, indent: 0 },
};

function textCmd(text, x, yPos, size) {
  const safe = pdfEscape(text);
  return `BT /F1 ${size} Tf ${x.toFixed(2)} ${yPos.toFixed(2)} Td (${safe}) Tj ET`;
}

function rectCmd(x, y, w, h, r, g, b) {
  return `q ${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`;
}

function pdfEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function parseMarkdown(input) {
  const lines = input.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'para', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      blocks.push({ type: 'space' });
      return;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
      return;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      return;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      return;
    }
    if (/^\-\s+/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'li', text: line.replace(/^\-\s+/, '') });
      return;
    }
    if (/^\d+\./.test(line)) {
      flushParagraph();
      blocks.push({ type: 'num', text: line });
      return;
    }

    paragraph.push(line.trim());
  });

  flushParagraph();
  return blocks;
}

function buildPages(blocks) {
  const pages = [];
  let page = { content: [] };
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    pages.push(page);
    page = { content: [] };
    y = PAGE_HEIGHT - MARGIN;
  };

  const addLine = (text, x, yPos, size) => {
    page.content.push(textCmd(text, x, yPos, size));
  };

  blocks.forEach((block) => {
    const style = styles[block.type] || styles.para;
    if (block.type === 'space') {
      y -= style.spaceAfter;
      if (y < MARGIN) newPage();
      return;
    }

    const prefix = style.prefix || '';
    const indent = style.indent || 0;
    const avgCharWidth = style.size * 0.52;
    const maxChars = Math.max(10, Math.floor((CONTENT_WIDTH - indent) / avgCharWidth));
    const text = `${prefix}${block.text}`;
    const lines = wrapText(text, maxChars);
    const needed = lines.length * style.leading + style.spaceAfter;

    if (y - needed < MARGIN + FOOTER_HEIGHT) {
      newPage();
    }

    lines.forEach((line) => {
      addLine(line, MARGIN + indent, y, style.size);
      y -= style.leading;
    });

    y -= style.spaceAfter;
    if (y < MARGIN + FOOTER_HEIGHT) newPage();
  });

  pages.push(page);
  return pages;
}

function buildCoverPage(metadata) {
  const page = { content: [] };
  const bannerHeight = 180;
  const bannerY = PAGE_HEIGHT - MARGIN - bannerHeight;
  page.content.push(rectCmd(MARGIN, bannerY, CONTENT_WIDTH, bannerHeight, 0.94, 0.96, 0.99));

  page.content.push(textCmd(metadata.title, MARGIN + 12, PAGE_HEIGHT - MARGIN - 50, 22));
  page.content.push(textCmd(metadata.subtitle, MARGIN + 12, PAGE_HEIGHT - MARGIN - 80, 12));
  page.content.push(textCmd(`Versione: ${metadata.version}`, MARGIN + 12, PAGE_HEIGHT - MARGIN - 120, 11));
  page.content.push(textCmd(`Ultimo aggiornamento: ${metadata.date}`, MARGIN + 12, PAGE_HEIGHT - MARGIN - 138, 11));

  const lineY = MARGIN + 80;
  page.content.push(rectCmd(MARGIN, lineY, CONTENT_WIDTH, 1.5, 0.1, 0.2, 0.4));
  page.content.push(textCmd('Guida pratica per usare l\'app al 100%.', MARGIN, lineY - 18, 11));

  return page;
}

function addPageNumbers(pages, startIndex) {
  const total = pages.length - startIndex;
  let number = 1;

  for (let i = startIndex; i < pages.length; i++) {
    const label = `Pagina ${number} di ${total}`;
    const size = 9;
    const approxWidth = label.length * (size * 0.52);
    const x = PAGE_WIDTH - MARGIN - approxWidth;
    const y = MARGIN - 18;
    pages[i].content.push(textCmd(label, x, y, size));
    number++;
  }
}

function buildPdf(pages) {
  const pageCount = pages.length;
  const pageObjNums = [];
  const contentObjNums = [];

  let objNum = 3;
  for (let i = 0; i < pageCount; i++) pageObjNums.push(objNum++);
  const fontObjNum = objNum++;
  for (let i = 0; i < pageCount; i++) contentObjNums.push(objNum++);

  const totalObjects = objNum - 1;
  const objects = new Array(totalObjects + 1).fill('');

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[fontObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  for (let i = 0; i < pageCount; i++) {
    const content = pages[i].content.join('\n');
    const contentLength = content.length;

    objects[pageObjNums[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNums[i]} 0 R >>`;
    objects[contentObjNums[i]] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;
  }

  let output = '%PDF-1.4\n';
  const offsets = [0];

  for (let i = 1; i <= totalObjects; i++) {
    offsets[i] = output.length;
    output += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = output.length;
  output += `xref\n0 ${totalObjects + 1}\n`;
  output += `0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i++) {
    const offset = offsets[i].toString().padStart(10, '0');
    output += `${offset} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return output;
}

const md = fs.readFileSync(mdPath, 'utf8');
const blocks = parseMarkdown(md);
const contentPages = buildPages(blocks);
const cover = buildCoverPage({
  title: 'Guida Utente',
  subtitle: 'Monthly Report App',
  version: '0.1.0-beta.4',
  date: '10/03/2026',
});
const pages = [cover, ...contentPages];
addPageNumbers(pages, 1);
const pdf = buildPdf(pages);

fs.writeFileSync(outPath, pdf, 'binary');
console.log(`PDF creato: ${outPath}`);
