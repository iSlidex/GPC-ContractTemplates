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
  getBusinessDocuments,
  getTemplates,
  extractTemplateVariables,
  generateContractDocuments,
  getFileForDownload,
  finalizeVirtualDocument,
  throwIfVirtualDocumentFinal,
  isSourcePathFinal
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


function normalizeSearch(value) {
  return String(value || "").toLowerCase();
}

function fieldMatches(value, queryValue) {
  if (!queryValue) {
    return true;
  }

  const text = Array.isArray(value) ? value.join(" ") : String(value || "");
  return normalizeSearch(text).includes(normalizeSearch(queryValue));
}

function profileAllowsTemplate(template, profile) {
  const status = String(template.status || "").toUpperCase();

  switch (profile) {
    case "LEGAL_ADMIN":
      return true;
    case "BUSINESS_USER":
      return ["RELEASED", "APPROVED"].includes(status);
    case "VIEWER":
      return status === "RELEASED";
    case "LEGAL_USER":
    default:
      return status !== "ARCHIVED";
  }
}

function getTemplateContextText(template) {
  return [
    template.contentType,
    template.category,
    template.description,
    template.name,
    template.contractType,
    template.categories
  ].join(" ");
}

function filterTemplates(templates, query = {}) {
  const baseTemplates = templates.filter((template) => {
    const allText = [
      getTemplateContextText(template),
      template.status,
      template.governingLaw,
      template.language,
      template.owner
    ].join(" ");

    return fieldMatches(allText, query.q) &&
      fieldMatches(template.status, query.status) &&
      fieldMatches(template.language, query.language) &&
      fieldMatches(template.governingLaw, query.governingLaw) &&
      fieldMatches(template.contentType, query.contentType) &&
      (!query.profile && !query.role || profileAllowsTemplate(template, query.profile || query.role));
  });

  if (!query.context && !query.category) {
    return baseTemplates;
  }

  const contextTemplates = baseTemplates.filter((template) => {
    const contextText = getTemplateContextText(template);

    return fieldMatches(contextText, query.context) &&
      fieldMatches([template.category, template.categories].join(" "), query.category);
  });

  return contextTemplates.length ? contextTemplates : baseTemplates;
}

function filterClauses(clauses, query = {}) {
  return clauses.filter((clause) => {
    const allText = [
      clause.title,
      clause.description,
      clause.category,
      clause.categories,
      clause.status,
      clause.type,
      clause.class,
      clause.governingLaw,
      clause.language
    ].join(" " );

    return fieldMatches(allText, query.q) &&
      fieldMatches([clause.category, clause.categories].join(" "), query.category) &&
      fieldMatches(clause.status, query.status) &&
      fieldMatches(clause.language, query.language) &&
      fieldMatches(clause.governingLaw, query.governingLaw) &&
      fieldMatches(clause.type, query.contentType || query.type) &&
      fieldMatches(clause.class, query.class);
  });
}

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


router.get("/documents", (req, res, next) => {
  try {
    res.json(getBusinessDocuments(req.query));
  } catch (error) {
    next(error);
  }
});

router.get("/templates", (req, res, next) => {
  try {
    res.json({
      templates: filterTemplates(getTemplates(), req.query)
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
    const { templateId, contractNumber, values, virtualDocumentId } = req.body || {};
    throwIfVirtualDocumentFinal({ templateId, contractNumber, virtualDocumentId });
    const variablesInfo = extractTemplateVariables(templateId);

    res.json(await refreshVirtualDocument({
      template: variablesInfo.template,
      variables: variablesInfo.variables,
      contractNumber,
      values: values || {},
      userContext: req.body && req.body.userContext
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/virtual-documents/:virtualDocumentId/finalize", async (req, res, next) => {
  try {
    res.json(finalizeVirtualDocument({
      virtualDocumentId: req.params.virtualDocumentId,
      userContext: req.body && req.body.userContext
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
      values,
      userContext: req.body.userContext
    });

    const downloadUrls = {
      docx: `/api/files/download?path=${encodeURIComponent(result.docx.relativePath)}`,
      metadata: `/api/files/download?path=${encodeURIComponent(result.metadataFile.relativePath)}`
    };

    if (result.pdf && result.pdf.relativePath) {
      downloadUrls.pdf = `/api/files/download?path=${encodeURIComponent(result.pdf.relativePath)}`;
    }

    res.json({
      message: result.pdf
        ? "Documentos generados correctamente"
        : "DOCX generado correctamente; PDF final no disponible",
      result,
      downloadUrls
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
    if (isSourcePathFinal(sourcePath)) {
      const error = new Error("El documento virtual ya está FINAL. No se puede editar.");
      error.statusCode = 409;
      error.code = "DOCUMENT_ALREADY_FINAL";
      throw error;
    }

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
    const clauses = filterClauses(getClauses({
      includeHtml: req.query.includeHtml === "true"
    }), req.query);

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
    if (isSourcePathFinal(sourcePath)) {
      const error = new Error("El documento virtual ya está FINAL. No se puede editar.");
      error.statusCode = 409;
      error.code = "DOCUMENT_ALREADY_FINAL";
      throw error;
    }

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
