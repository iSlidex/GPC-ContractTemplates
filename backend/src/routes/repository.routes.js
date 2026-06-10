const express = require("express");
const router = express.Router();

const {
  getClauses,
  getClauseById,
  updateClauseMetadata,
  applyClauseAction,
  createClauseVersion,
  createClauseVariant
} = require("../services/clauseService");

const {
  getEditableHtml,
  saveHtmlDraftVersion,
  saveHtmlDocxVersion
} = require("../services/templateEditService");

const {
  getRepositoryTree,
  getTemplates,
  extractTemplateVariables,
  generateContractDocuments,
  getFileForDownload
} = require("../services/repositoryService");

const {
  getTemplateById,
  updateTemplateMetadata,
  applyTemplateAction
} = require("../services/templateMetadataService");

const {
  refreshVirtualDocument
} = require("../services/virtualDocumentService");

const {
  getFileInfo,
  previewDocxAsHtml,
  readTextFile
} = require("../services/filePreviewService");

function stripInternalClauseFields(clause) {
  const { fullPath, ...publicClause } = clause;
  return publicClause;
}

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

router.get("/templates/:templateId", (req, res, next) => {
  try {
    const template = getTemplateById(req.params.templateId);
    const variablesInfo = extractTemplateVariables(req.params.templateId);

    res.json({
      template,
      variables: variablesInfo.variables
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/templates/:templateId/metadata", (req, res, next) => {
  try {
    res.json({
      template: updateTemplateMetadata(req.params.templateId, req.body || {})
    });
  } catch (error) {
    next(error);
  }
});

router.post("/templates/:templateId/actions/:action", (req, res, next) => {
  try {
    res.json(applyTemplateAction(req.params.templateId, req.params.action));
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

router.post("/virtual-documents/refresh", async (req, res, next) => {
  try {
    const { templateId, contractNumber, values } = req.body || {};
    const variablesInfo = extractTemplateVariables(templateId);

    res.json(await refreshVirtualDocument({
      template: variablesInfo.template,
      variables: variablesInfo.variables,
      contractNumber,
      values: values || {}
    }));
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

router.get("/files/edit/html", async (req, res, next) => {
  try {
    const relativePath = req.query.path;

    if (!relativePath) {
      return res.status(400).json({
        error: "Falta query parameter path"
      });
    }

    const result = await getEditableHtml(relativePath);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/files/edit/html-version", async (req, res, next) => {
  try {
    const { sourcePath, html, status } = req.body;

    if (!sourcePath) {
      return res.status(400).json({
        error: "Falta sourcePath"
      });
    }

    const result = await saveHtmlDraftVersion({
      sourcePath,
      html,
      status: status || "BORRADOR"
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/clauses", (req, res, next) => {
  try {
    const clauses = getClauses({
      category: req.query.category,
      status: req.query.status,
      includeHtml: req.query.includeHtml === "true"
    });

    res.json({
      clauses: clauses.map(stripInternalClauseFields)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/clauses/:clauseId", (req, res, next) => {
  try {
    const clause = getClauseById(req.params.clauseId);

    res.json({
      clause: stripInternalClauseFields(clause)
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/clauses/:clauseId/metadata", (req, res, next) => {
  try {
    res.json({
      clause: stripInternalClauseFields(updateClauseMetadata(req.params.clauseId, req.body || {}))
    });
  } catch (error) {
    next(error);
  }
});

router.post("/clauses/:clauseId/actions/:action", (req, res, next) => {
  try {
    const result = applyClauseAction(req.params.clauseId, req.params.action);

    res.json({
      ...result,
      clause: result.clause ? stripInternalClauseFields(result.clause) : undefined,
      newClause: result.newClause ? stripInternalClauseFields(result.newClause) : undefined
    });
  } catch (error) {
    next(error);
  }
});

router.post("/clauses/:clauseId/version", (req, res, next) => {
  try {
    res.json({
      clause: stripInternalClauseFields(createClauseVersion(req.params.clauseId))
    });
  } catch (error) {
    next(error);
  }
});

router.post("/clauses/:clauseId/variant", (req, res, next) => {
  try {
    res.json({
      clause: stripInternalClauseFields(createClauseVariant(req.params.clauseId))
    });
  } catch (error) {
    next(error);
  }
});

router.post("/files/edit/docx-version", async (req, res, next) => {
  try {
    const { sourcePath, html, status } = req.body;

    if (!sourcePath) {
      return res.status(400).json({
        error: "Falta sourcePath"
      });
    }

    const result = await saveHtmlDocxVersion({
      sourcePath,
      html,
      status: status || "BORRADOR"
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
