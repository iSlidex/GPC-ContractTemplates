const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const {
  getContractById,
  updateContractStatus
} = require("../services/contractService");

const {
  renderContractDocx
} = require("../services/templateRenderer");

const {
  generateContractPdf
} = require("../services/pdfGenerator");

function getLatestGeneratedFile(contractId, extension) {
  const outputDir = path.resolve(__dirname, "../../output/generated");

  if (!fs.existsSync(outputDir)) {
    return null;
  }

  const files = fs
    .readdirSync(outputDir)
    .filter((fileName) => {
      return fileName.startsWith(`${contractId}-`) && fileName.endsWith(extension);
    })
    .map((fileName) => {
      const filePath = path.join(outputDir, fileName);
      const stat = fs.statSync(filePath);

      return {
        fileName,
        filePath,
        createdAt: stat.mtimeMs
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return files[0] || null;
}

router.get("/:contractId", async (req, res, next) => {
  try {
    const contract = getContractById(req.params.contractId);
    res.json(contract);
  } catch (error) {
    next(error);
  }
});

router.post("/:contractId/generate", async (req, res, next) => {
  try {
    const contract = getContractById(req.params.contractId);

    const generated = await renderContractDocx({
      contract,
      templateFileName: "contrato-servicios-v1.docx"
    });

    const updatedContract = updateContractStatus(
      req.params.contractId,
      "DOCUMENT_GENERATED",
      {
        generatedDocxPath: generated.outputPath,
        generatedDocxFileName: generated.fileName
      }
    );

    res.json({
      message: "Documento DOCX generado correctamente",
      contract: updatedContract,
      document: generated
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:contractId/document", async (req, res, next) => {
  try {
    const contractId = req.params.contractId;

    getContractById(contractId);

    const latestDocument = getLatestGeneratedFile(contractId, ".docx");

    if (!latestDocument) {
      return res.status(404).json({
        error: `No hay documentos DOCX generados para el contrato ${contractId}`
      });
    }

    res.download(latestDocument.filePath, latestDocument.fileName);
  } catch (error) {
    next(error);
  }
});

router.post("/:contractId/generate-pdf", async (req, res, next) => {
  try {
    const contract = getContractById(req.params.contractId);

    const generatedPdf = await generateContractPdf(contract);

    const updatedContract = updateContractStatus(
      req.params.contractId,
      "PDF_GENERATED",
      {
        generatedPdfPath: generatedPdf.outputPath,
        generatedPdfFileName: generatedPdf.fileName
      }
    );

    res.json({
      message: "PDF generado correctamente",
      contract: updatedContract,
      pdf: generatedPdf
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:contractId/pdf", async (req, res, next) => {
  try {
    const contractId = req.params.contractId;

    getContractById(contractId);

    const latestPdf = getLatestGeneratedFile(contractId, ".pdf");

    if (!latestPdf) {
      return res.status(404).json({
        error: `No hay PDF generado para el contrato ${contractId}`
      });
    }

    res.download(latestPdf.filePath, latestPdf.fileName);
  } catch (error) {
    next(error);
  }
});

module.exports = router;