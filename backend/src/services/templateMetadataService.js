const fs = require("fs");
const path = require("path");

const {
  assertTemplateActionAllowed,
  getAvailableTemplateActions,
  getTemplateStatusState,
  normalizeTemplateStatus
} = require("./templateLifecycle");
const { getTemplateDefinition } = require("../domain/contractTemplateDomain");

const REPO_ROOT = path.resolve(__dirname, "../../repository");
const TEMPLATES_ROOT = path.join(REPO_ROOT, "templates");

const EDITABLE_METADATA_FIELDS = [
  "name",
  "contentType",
  "categories",
  "governingLaw",
  "language",
  "description",
  "validFrom",
  "validTo",
  "owner"
];

function safeJoin(root, relativePath) {
  const fullPath = path.resolve(root, relativePath || "");

  if (!fullPath.startsWith(root)) {
    throw new Error("Ruta no permitida");
  }

  return fullPath;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function walkFiles(dirPath, basePath = dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      return walkFiles(fullPath, basePath);
    }

    const stat = fs.statSync(fullPath);

    return [{
      type: "file",
      name: entry.name,
      relativePath,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      extension: path.extname(entry.name).toLowerCase()
    }];
  });
}

function parseTemplateBaseName(file) {
  const extension = path.extname(file.name).toLowerCase();
  const baseName = path.basename(file.name, extension);
  const match = baseName.match(/^TPL_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  if (!match) {
    return {
      templateId: baseName,
      name: file.name,
      category: "SIN_CATEGORIA",
      contractType: baseName,
      version: "v000",
      status: "DRAFT",
      extension,
      relativePath: file.relativePath,
      modifiedAt: file.modifiedAt
    };
  }

  return {
    templateId: baseName,
    name: file.name,
    category: match[1],
    contractType: match[2],
    version: match[3],
    status: match[4],
    extension,
    relativePath: file.relativePath,
    modifiedAt: file.modifiedAt
  };
}

function getSidecarPathForTemplate(template) {
  const templatePath = safeJoin(TEMPLATES_ROOT, template.relativePath);
  const baseName = path.basename(template.name, template.extension);
  return path.join(path.dirname(templatePath), `${baseName}.metadata.json`);
}

function readSidecarMetadata(template) {
  const sidecarPath = getSidecarPathForTemplate(template);

  if (!fs.existsSync(sidecarPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  } catch (error) {
    return {
      metadataWarning: `No se pudo leer metadata sidecar: ${error.message}`
    };
  }
}

function writeSidecarMetadata(template, metadata) {
  const sidecarPath = getSidecarPathForTemplate(template);
  ensureDir(path.dirname(sidecarPath));
  fs.writeFileSync(sidecarPath, JSON.stringify(metadata, null, 2), "utf8");
}

function revisionFromVersion(version) {
  const match = String(version || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function contentTypeFromExtension(extension) {
  if (extension === ".docx") return "DOCX";
  if (extension === ".html") return "HTML";
  return "UNKNOWN";
}

function enrichTemplateMetadata(template, sidecarMetadata = readSidecarMetadata(template)) {
  const domainDefinition = getTemplateDefinition(template.templateId);
  const status = normalizeTemplateStatus(sidecarMetadata.status || template.status);
  const categories = sidecarMetadata.categories || [template.category];

  return {
    ...template,
    ...sidecarMetadata,
    templateId: template.templateId,
    name: sidecarMetadata.name || template.name,
    contentType: sidecarMetadata.contentType || contentTypeFromExtension(template.extension),
    categories,
    category: categories[0] || template.category,
    governingLaw: sidecarMetadata.governingLaw || "DO",
    language: sidecarMetadata.language || "es",
    description:
      sidecarMetadata.description ||
      (domainDefinition && domainDefinition.businessDescription) ||
      `Plantilla ${template.contractType} ${template.version}`,
    context: sidecarMetadata.context || (domainDefinition && domainDefinition.context) || "",
    requiredVariables: sidecarMetadata.requiredVariables || (domainDefinition && domainDefinition.requiredVariables) || [],
    businessDescription: sidecarMetadata.businessDescription || (domainDefinition && domainDefinition.businessDescription) || "",
    validFrom: sidecarMetadata.validFrom || "",
    validTo: sidecarMetadata.validTo || "",
    owner: sidecarMetadata.owner || "GPC Legal",
    version: sidecarMetadata.version || template.version,
    revision: sidecarMetadata.revision || revisionFromVersion(template.version),
    status,
    statusState: getTemplateStatusState(status),
    replacedBy: sidecarMetadata.replacedBy || null,
    sourcePath: template.relativePath,
    extension: template.extension,
    relativePath: template.relativePath,
    modifiedAt: template.modifiedAt,
    availableActions: getAvailableTemplateActions(status)
  };
}

function getTemplates() {
  const files = walkFiles(TEMPLATES_ROOT, TEMPLATES_ROOT)
    .filter((item) => [".docx", ".html"].includes(item.extension))
    .map(parseTemplateBaseName)
    .map((template) => enrichTemplateMetadata(template));

  return files.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.contractType !== b.contractType) return a.contractType.localeCompare(b.contractType);
    return b.version.localeCompare(a.version);
  });
}

function getTemplateById(templateId) {
  const template = getTemplates().find((item) => item.templateId === templateId);

  if (!template) {
    const error = new Error(`Plantilla no encontrada: ${templateId}`);
    error.statusCode = 404;
    throw error;
  }

  return template;
}

function getTemplateAbsolutePath(template) {
  return safeJoin(TEMPLATES_ROOT, template.relativePath);
}

function pickEditableMetadata(payload = {}) {
  return EDITABLE_METADATA_FIELDS.reduce((metadata, field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      metadata[field] = payload[field];
    }

    return metadata;
  }, {});
}

function updateTemplateMetadata(templateId, payload) {
  const template = getTemplateById(templateId);
  const currentMetadata = readSidecarMetadata(template);
  const nextMetadata = {
    ...currentMetadata,
    ...pickEditableMetadata(payload),
    status: normalizeTemplateStatus(currentMetadata.status || template.status),
    updatedAt: new Date().toISOString()
  };

  writeSidecarMetadata(template, nextMetadata);

  return getTemplateById(templateId);
}

function padVersion(versionNumber) {
  return `v${String(versionNumber).padStart(3, "0")}`;
}

function getNextTemplateVersion(template) {
  const templates = getTemplates().filter((item) => {
    return item.category === template.category && item.contractType === template.contractType;
  });
  const maxRevision = Math.max(...templates.map((item) => item.revision || 0), 0);

  return padVersion(maxRevision + 1);
}

function createNewVersionFromTemplate(template, { restore = false } = {}) {
  const sourcePath = getTemplateAbsolutePath(template);
  const nextVersion = getNextTemplateVersion(template);
  const nextBaseName = `TPL_${template.category}_${template.contractType}_${nextVersion}_DRAFT`;
  const nextFileName = `${nextBaseName}${template.extension}`;
  const nextRelativePath = path.join(path.dirname(template.relativePath), nextFileName);
  const nextPath = safeJoin(TEMPLATES_ROOT, nextRelativePath);

  if (fs.existsSync(nextPath)) {
    const error = new Error(`Ya existe la versión destino: ${nextFileName}`);
    error.statusCode = 409;
    throw error;
  }

  fs.copyFileSync(sourcePath, nextPath);

  const previousMetadata = readSidecarMetadata(template);
  const newTemplate = parseTemplateBaseName({
    name: nextFileName,
    relativePath: nextRelativePath,
    extension: template.extension,
    modifiedAt: new Date().toISOString()
  });

  writeSidecarMetadata(newTemplate, {
    ...previousMetadata,
    name: previousMetadata.name || template.name,
    contentType: previousMetadata.contentType || template.contentType,
    categories: previousMetadata.categories || template.categories,
    governingLaw: previousMetadata.governingLaw || template.governingLaw,
    language: previousMetadata.language || template.language,
    description: previousMetadata.description || template.description,
    validFrom: previousMetadata.validFrom || template.validFrom,
    validTo: previousMetadata.validTo || template.validTo,
    owner: previousMetadata.owner || template.owner,
    version: nextVersion,
    revision: revisionFromVersion(nextVersion),
    status: "DRAFT",
    replacedBy: null,
    restoredFrom: restore ? template.templateId : undefined,
    createdFrom: template.templateId,
    updatedAt: new Date().toISOString()
  });

  if (!restore) {
    writeSidecarMetadata(template, {
      ...previousMetadata,
      status: "REPLACED",
      replacedBy: nextBaseName,
      updatedAt: new Date().toISOString()
    });
  }

  return getTemplateById(nextBaseName);
}

function applyTemplateAction(templateId, action) {
  const template = getTemplateById(templateId);
  const normalizedAction = assertTemplateActionAllowed(template.status, action);
  const currentMetadata = readSidecarMetadata(template);
  const nextMetadata = {
    ...currentMetadata,
    updatedAt: new Date().toISOString()
  };
  let actionResult = {};

  switch (normalizedAction) {
    case "SEND_FOR_APPROVAL":
      nextMetadata.status = "SENT_FOR_APPROVAL";
      break;
    case "APPROVE":
      nextMetadata.status = "APPROVED";
      break;
    case "RELEASE":
    case "APPROVE_AND_RELEASE":
      nextMetadata.status = "RELEASED";
      break;
    case "REOPEN":
      nextMetadata.status = "DRAFT";
      break;
    case "ARCHIVE":
      nextMetadata.status = "ARCHIVED";
      break;
    case "CREATE_NEW_VERSION":
      actionResult.newTemplate = createNewVersionFromTemplate(template);
      return {
        template: getTemplateById(templateId),
        ...actionResult
      };
    case "RESTORE":
      actionResult.newTemplate = createNewVersionFromTemplate(template, { restore: true });
      return {
        template: getTemplateById(templateId),
        ...actionResult
      };
    default:
      break;
  }

  writeSidecarMetadata(template, nextMetadata);

  return {
    template: getTemplateById(templateId),
    ...actionResult
  };
}

module.exports = {
  getTemplates,
  getTemplateById,
  getTemplateAbsolutePath,
  enrichTemplateMetadata,
  updateTemplateMetadata,
  applyTemplateAction
};
