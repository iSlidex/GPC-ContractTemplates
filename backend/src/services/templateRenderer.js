const fs = require("fs");
const path = require("path");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");

function mapContractToTemplateData(contract) {
  return {
    CONTRACT_NUMBER: contract.contractNumber,
    CONTRACTOR_NAME: contract.contractorName,
    CONTRACTOR_ID: contract.contractorId,
    CONTRACTOR_ADDRESS: contract.contractorAddress,
    CONTRACTOR_EMAIL: contract.contractorEmail,
    CONTRACT_PURPOSE: contract.contractPurpose,
    CONTRACT_AMOUNT: contract.contractAmount,
    CONTRACT_CURRENCY: contract.contractCurrency,
    START_DATE: contract.startDate,
    END_DATE: contract.endDate
  };
}

async function renderContractDocx({ contract, templateFileName }) {
  const templatePath = path.resolve(__dirname, "../../templates", templateFileName);
  const outputDir = path.resolve(__dirname, "../../output/generated");

  if (!fs.existsSync(templatePath)) {
    throw new Error(`No existe la plantilla: ${templatePath}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });

  const data = mapContractToTemplateData(contract);

  try {
    doc.render(data);
  } catch (error) {
    console.error("Error renderizando plantilla:", error);
    throw new Error("Error renderizando plantilla DOCX. Revisa los placeholders del Word.");
  }

  const buffer = doc.toBuffer();

  const outputPath = path.join(
    outputDir,
    `${contract.contractNumber}-${Date.now()}.docx`
  );

  fs.writeFileSync(outputPath, buffer);

  return {
    outputPath,
    fileName: path.basename(outputPath)
  };
}

module.exports = {
  renderContractDocx
};