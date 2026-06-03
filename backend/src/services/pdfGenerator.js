const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function generateContractPdf(contract) {
  const outputDir = path.resolve(__dirname, "../../output/generated");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `${contract.contractNumber}-${Date.now()}.pdf`;
  const outputPath = path.join(outputDir, fileName);

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 72
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc
    .fontSize(16)
    .text("CONTRATO DE SERVICIOS PROFESIONALES", {
      align: "center"
    });

  doc.moveDown(2);

  doc
    .fontSize(11)
    .text(
      `Entre CORPORACIÓN AEROPORTUARIA DEL ESTE, S.A.S., en adelante "LA EMPRESA", y ${contract.contractorName}, identificado con ${contract.contractorId}, domiciliado en ${contract.contractorAddress}, en adelante "EL CONTRATISTA", se celebra el presente contrato.`,
      {
        align: "justify",
        lineGap: 4
      }
    );

  doc.moveDown(2);

  doc.fontSize(11).text(`Número de contrato: ${contract.contractNumber}`);

  doc.moveDown();

  doc.font("Helvetica-Bold").text("Objeto del contrato:");
  doc.font("Helvetica").text(contract.contractPurpose, {
    align: "justify",
    lineGap: 4
  });

  doc.moveDown();

  doc.text(`Monto total: ${contract.contractAmount} ${contract.contractCurrency}`);

  doc.moveDown();

  doc.text(`Fecha de inicio: ${contract.startDate}`);
  doc.text(`Fecha de fin: ${contract.endDate}`);

  doc.moveDown();

  doc.text("Correo del contratista para firma electrónica:");
  doc.text(contract.contractorEmail);

  doc.moveDown(4);

  doc.text("______________________________", {
    align: "left"
  });
  doc.text("EL CONTRATISTA", {
    align: "left"
  });

  doc.moveDown(2);

  doc.text("______________________________", {
    align: "left"
  });
  doc.text("LA EMPRESA", {
    align: "left"
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => {
      resolve({
        outputPath,
        fileName
      });
    });

    stream.on("error", reject);
  });
}

module.exports = {
  generateContractPdf
};
