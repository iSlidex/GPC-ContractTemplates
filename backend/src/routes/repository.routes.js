const express = require("express");
const router = express.Router();

const {
  getRepositoryTree,
  getTemplates,
  extractTemplateVariables,
  generateContractDocuments,
  getFileForDownload
} = require("../services/repositoryService");

const {
  getFileInfo,
  previewDocxAsHtml,
  readTextFile
} = require("../services/filePreviewService");

router.get("/repository", (req, res, next) => {
  try {
    res.json(getRepositoryTree());
  } catch (error) {
    next(error);
  }
});

router.get("/templates", (req, res, next) => {
  try {
    res.json({
      templates: getTemplates()
    });
  } catch (error) {
    next(error);
  }
});

router.get("/templates/:templateId/variables", (req, res, next) => {
  try {
    res.json(extractTemplateVariables(req.params.templateId));
  } catch (error) {
    next(error);
  }
});

router.post("/templates/:templateId/generate", async (req, res, next) => {
  try {
    const contractNumber = req.body.contractNumber || `GPC-${Date.now()}`;
    const values = req.body.values || {};

    const result = await generateContractDocuments({
      templateId: req.params.templateId,
      contractNumber,
      values
    });

    res.json({
      message: "Documentos generados correctamente",
      result,
      downloadUrls: {
        docx: `/api/files/download?path=${encodeURIComponent(result.docx.relativePath)}`,
        pdf: `/api/files/download?path=${encodeURIComponent(result.pdf.relativePath)}`,
        metadata: `/api/files/download?path=${encodeURIComponent(result.metadataFile.relativePath)}`
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/files/download", (req, res, next) => {
  try {
    const relativePath = req.query.path;

    if (!relativePath) {
      return res.status(400).json({
        error: "Falta query parameter path"
      });
    }

    const fullPath = getFileForDownload(relativePath);

    res.download(fullPath);
  } catch (error) {
    next(error);
  }
});

router.get("/files/inline", (req, res, next) => {
  try {
    const relativePath = req.query.path;

    if (!relativePath) {
      return res.status(400).json({
        error: "Falta query parameter path"
      });
    }

    const fileInfo = getFileInfo(relativePath);

    res.setHeader("Content-Type", fileInfo.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`
    );

    res.sendFile(fileInfo.fullPath);
  } catch (error) {
    next(error);
  }
});

router.get("/files/preview/docx", async (req, res, next) => {
  try {
    const relativePath = req.query.path;

    if (!relativePath) {
      return res.status(400).json({
        error: "Falta query parameter path"
      });
    }

    const result = await previewDocxAsHtml(relativePath);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/files/preview/text", (req, res, next) => {
  try {
    const relativePath = req.query.path;

    if (!relativePath) {
      return res.status(400).json({
        error: "Falta query parameter path"
      });
    }

    const result = readTextFile(relativePath);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
