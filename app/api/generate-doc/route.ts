import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";

function parseContentToDocxElements(content: string): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }));
      continue;
    }

    // Heading detection
    if (/^(I{1,3}V?|VI{0,3}|PRIMERO|SEGUNDO|TERCERO)\.|^(HECHOS|FUNDAMENTOS|SUPLICA|SOLICITA|PETICIÓN|ANTECEDENTES|ALEGACIONES)/i.test(line.trim())) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.trim(), bold: true, size: 24 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }

    // Main title detection
    if (i < 5 && line.trim().length > 0 && line.trim() === line.trim().toUpperCase()) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.trim(), bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 },
        })
      );
      continue;
    }

    // Normal paragraph
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: line.trim(), size: 24 })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120, line: 360 },
        indent: { firstLine: 720 },
      })
    );
  }

  return paragraphs;
}

export async function POST(req: NextRequest) {
  try {
    const { content, instructions } = await req.json();

    const today = new Date().toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Times New Roman",
              size: 24,
              color: "1a1a1a",
            },
            paragraph: {
              spacing: { line: 360 },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1800,
              },
            },
          },
          children: [
            // Header separator
            new Paragraph({
              children: [],
              border: {
                bottom: { color: "c9a84c", space: 1, style: BorderStyle.SINGLE, size: 6 },
              },
              spacing: { after: 400 },
            }),

            // Title
            new Paragraph({
              children: [
                new TextRun({
                  text: "RECURSO ADMINISTRATIVO CONTRA SANCIÓN",
                  bold: true,
                  size: 32,
                  allCaps: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 240 },
            }),

            new Paragraph({
              children: [
                new TextRun({
                  text: `Generado el ${today} mediante RecursApp`,
                  size: 20,
                  color: "888888",
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 600 },
            }),

            // Content paragraphs
            ...parseContentToDocxElements(content),

            // Page break before instructions
            new Paragraph({
              children: [],
              pageBreakBefore: true,
              spacing: { after: 400 },
            }),

            // Instructions section
            new Paragraph({
              children: [
                new TextRun({
                  text: "GUÍA DE PRESENTACIÓN DEL RECURSO",
                  bold: true,
                  size: 28,
                  color: "9a7530",
                }),
              ],
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 },
            }),

            ...instructions.split("\n").map((line: string) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    size: 22,
                    color: line.startsWith("⚠️") ? "cc4444" : "2a2a2a",
                    bold: /^\d+\./.test(line.trim()),
                  }),
                ],
                spacing: { after: 120 },
              })
            ),

            // Footer note
            new Paragraph({
              children: [],
              border: {
                top: { color: "cccccc", space: 1, style: BorderStyle.SINGLE, size: 3 },
              },
              spacing: { before: 600, after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Documento generado por RecursApp — Herramienta de apoyo. No constituye asesoramiento jurídico profesional.",
                  size: 18,
                  color: "999999",
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

   
   return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="recurso-multa-${Date.now()}.docx"`,
      },
    });
  } catch (err: unknown) {
    console.error("Generate doc error:", err);
    const msg = err instanceof Error ? err.message : "Error generando documento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
