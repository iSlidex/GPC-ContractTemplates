const fs = require("fs");
const path = require("path");
const {
  assertTemplateActionAllowed,
  getAvailableTemplateActions,
  getTemplateStatusState,
  normalizeTemplateStatus
} = require("./templateLifecycle");

const REPO_ROOT = path.resolve(__dirname, "../../repository");
const CLAUSES_ROOT = path.join(REPO_ROOT, "clauses");

function ensureClausesRoot() {
  if (!fs.existsSync(CLAUSES_ROOT)) {
    fs.mkdirSync(CLAUSES_ROOT, { recursive: true });
  }
}

function walkFiles(dirPath, basePath = dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath, basePath));
    } else {
      const stat = fs.statSync(fullPath);

      result.push({
        name: entry.name,
        fullPath,
        relativePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        extension: path.extname(entry.name).toLowerCase()
      });
    }
  }

  return result;
}

function titleFromHtml(html, fallback) {
  const match = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);

  if (!match) {
    return fallback;
  }

  return match[1].replace(/<[^>]+>/g, "").trim() || fallback;
}

function safeJoin(root, relativePath) {
  const fullPath = path.resolve(root, relativePath || "");

  if (!fullPath.startsWith(root)) {
    throw new Error("Ruta no permitida");
  }

  return fullPath;
}

function revisionFromVersion(version) {
  const match = String(version || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function padVersion(versionNumber) {
  return `v${String(versionNumber).padStart(3, "0")}`;
}

function getClauseSidecarPath(clause) {
  const fullPath = clause.fullPath ||
    safeJoin(CLAUSES_ROOT, clause.relativePath.replace(/^clauses[\\/]/, ""));
  const baseName = path.basename(clause.name, clause.extension || ".html");
  return path.join(path.dirname(fullPath), `${baseName}.metadata.json`);
}

function readClauseSidecar(clause) {
  const sidecarPath = getClauseSidecarPath(clause);

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

function writeClauseSidecar(clause, metadata) {
  fs.writeFileSync(getClauseSidecarPath(clause), JSON.stringify(metadata, null, 2), "utf8");
}

function parseClauseFile(file) {
  const baseName = path.basename(file.name, ".html");

  const match = baseName.match(/^CLA_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  const html = fs.readFileSync(file.fullPath, "utf8");

  const baseClause = !match
    ? {
      clauseId: baseName,
      name: file.name,
      title: titleFromHtml(html, baseName),
      category: "SIN_CATEGORIA",
      code: baseName,
      version: "v000",
      status: "DRAFT",
      relativePath: path.join("clauses", file.relativePath),
      fullPath: file.fullPath,
      modifiedAt: file.modifiedAt,
      extension: file.extension,
      html
    }
    : {
      clauseId: baseName,
      name: file.name,
      title: titleFromHtml(html, match[2]),
      category: match[1],
      code: match[2],
      version: match[3],
      status: match[4],
      relativePath: path.join("clauses", file.relativePath),
      fullPath: file.fullPath,
      modifiedAt: file.modifiedAt,
      extension: file.extension,
      html
    };

  return enrichClauseMetadata(baseClause);
}

function enrichClauseMetadata(clause) {
  const sidecar = readClauseSidecar(clause);
  const status = normalizeTemplateStatus(sidecar.status || clause.status);
  const categories = sidecar.categories || [clause.category];

  return {
    ...clause,
    ...sidecar,
    clauseId: clause.clauseId,
    title: sidecar.title || clause.title,
    class: sidecar.class || "CLAUSE",
    type: sidecar.type || "STANDARD",
    categories,
    category: categories[0] || clause.category,
    governingLaw: sidecar.governingLaw || "DO",
    language: sidecar.language || "es",
    description: sidecar.description || `Text block ${clause.title}`,
    validFrom: sidecar.validFrom || "",
    validTo: sidecar.validTo || "",
    owner: sidecar.owner || "GPC Legal",
    version: sidecar.version || clause.version,
    revision: sidecar.revision || revisionFromVersion(clause.version),
    status,
    statusState: getTemplateStatusState(status),
    variantsOf: sidecar.variantsOf || null,
    sourcePath: clause.relativePath,
    availableActions: getAvailableTemplateActions(status)
  };
}

function getClauses({ category, status, includeHtml = false } = {}) {
  ensureClausesRoot();

  const files = walkFiles(CLAUSES_ROOT, CLAUSES_ROOT)
    .filter((file) => file.extension === ".html")
    .map(parseClauseFile)
    .filter((clause) => {
      if (category && clause.category !== category) {
        return false;
      }

      if (status && clause.status !== status) {
        return false;
      }

      return true;
    });

  if (includeHtml) {
    return files;
  }

  return files.map(({ html, fullPath, ...clause }) => clause);
}

function getClauseById(clauseId) {
  const clauses = getClauses({ includeHtml: true });
  const clause = clauses.find((item) => item.clauseId === clauseId);

  if (!clause) {
    const error = new Error(`Cláusula no encontrada: ${clauseId}`);
    error.statusCode = 404;
    throw error;
  }

  return clause;
}

function pickClauseMetadata(payload = {}) {
  const allowedFields = [
    "title",
    "class",
    "type",
    "categories",
    "governingLaw",
    "language",
    "description",
    "validFrom",
    "validTo",
    "owner"
  ];

  return allowedFields.reduce((metadata, field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      metadata[field] = payload[field];
    }

    return metadata;
  }, {});
}

function updateClauseMetadata(clauseId, payload) {
  const clause = getClauseById(clauseId);
  const currentMetadata = readClauseSidecar(clause);

  writeClauseSidecar(clause, {
    ...currentMetadata,
    ...pickClauseMetadata(payload),
    status: normalizeTemplateStatus(currentMetadata.status || clause.status),
    updatedAt: new Date().toISOString()
  });

  return getClauseById(clauseId);
}

function getNextClauseVersion(clause) {
  const clauses = getClauses({ includeHtml: true }).filter((item) => {
    return item.category === clause.category && item.code === clause.code;
  });
  const maxRevision = Math.max(...clauses.map((item) => item.revision || 0), 0);

  return padVersion(maxRevision + 1);
}

function createClauseCopy(clause, { variant = false } = {}) {
  const nextVersion = variant ? "v001" : getNextClauseVersion(clause);
  const nextCode = variant
    ? `${clause.code}_VARIANT_${Date.now()}`
    : clause.code;
  const nextBaseName = `CLA_${clause.category}_${nextCode}_${nextVersion}_DRAFT`;
  const nextFileName = `${nextBaseName}.html`;
  const nextRelativeWithoutRoot = path.join(path.dirname(clause.relativePath.replace(/^clauses[\\/]/, "")), nextFileName);
  const nextFullPath = safeJoin(CLAUSES_ROOT, nextRelativeWithoutRoot);

  if (fs.existsSync(nextFullPath)) {
    const error = new Error(`Ya existe el text block destino: ${nextFileName}`);
    error.statusCode = 409;
    throw error;
  }

  fs.copyFileSync(clause.fullPath, nextFullPath);

  const newClause = {
    clauseId: nextBaseName,
    name: nextFileName,
    title: clause.title,
    category: clause.category,
    code: nextCode,
    version: nextVersion,
    status: "DRAFT",
    relativePath: path.join("clauses", nextRelativeWithoutRoot),
    fullPath: nextFullPath,
    modifiedAt: new Date().toISOString(),
    extension: ".html",
    html: clause.html
  };

  writeClauseSidecar(newClause, {
    title: clause.title,
    class: clause.class,
    type: clause.type,
    categories: clause.categories,
    governingLaw: clause.governingLaw,
    language: clause.language,
    description: clause.description,
    validFrom: clause.validFrom,
    validTo: clause.validTo,
    owner: clause.owner,
    version: nextVersion,
    revision: revisionFromVersion(nextVersion),
    status: "DRAFT",
    variantsOf: variant ? clause.clauseId : clause.variantsOf || null,
    createdFrom: clause.clauseId,
    updatedAt: new Date().toISOString()
  });

  return getClauseById(nextBaseName);
}

function applyClauseAction(clauseId, action) {
  const clause = getClauseById(clauseId);
  const normalizedAction = assertTemplateActionAllowed(clause.status, action);
  const currentMetadata = readClauseSidecar(clause);
  const nextMetadata = {
    ...currentMetadata,
    updatedAt: new Date().toISOString()
  };

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
      return {
        clause,
        newClause: createClauseCopy(clause)
      };
    case "RESTORE":
      return {
        clause,
        newClause: createClauseCopy(clause)
      };
    default:
      break;
  }

  writeClauseSidecar(clause, nextMetadata);

  return {
    clause: getClauseById(clauseId)
  };
}

function createClauseVersion(clauseId) {
  const clause = getClauseById(clauseId);
  return createClauseCopy(clause);
}

function createClauseVariant(clauseId) {
  const clause = getClauseById(clauseId);
  return createClauseCopy(clause, { variant: true });
}

module.exports = {
  getClauses,
  getClauseById,
  updateClauseMetadata,
  applyClauseAction,
  createClauseVersion,
  createClauseVariant
};
