const HTMLtoDOCXModule = require("html-to-docx");
const HTMLtoDOCX = HTMLtoDOCXModule.default || HTMLtoDOCXModule;

const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const REPO_ROOT = path.resolve(__dirname, "../../repository");

function safeJoin(root, relativePath) {
  const fullPath = path.resolve(root, relativePath || "");

  if (!fullPath.startsWith(root)) {
    throw new Error("Ruta no permitida");
  }

  return fullPath;
}

function getFileInfo(relativePath) {
  const fullPath = safeJoin(REPO_ROOT, relativePath);

  if (!fs.existsSync(fullPath)) {
    const error = new Error("Archivo no encontrado");
    error.statusCode = 404;
    throw error;
  }

  const stat = fs.statSync(fullPath);

  return {
    fullPath,
    relativePath,
    fileName: path.basename(fullPath),
    directory: path.dirname(fullPath),
    extension: path.extname(fullPath).toLowerCase(),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

function parseRepositoryDocumentName(fileName) {
  const baseName = fileName.replace(/\.(docx|html)$/i, "");

  const templateMatch = baseName.match(/^TPL_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  if (templateMatch) {
    return {
      documentKind: "template",
      category: templateMatch[1],
      contractType: templateMatch[2],
      version: templateMatch[3],
      status: templateMatch[4],
      baseName
    };
  }

  const contractMatch = baseName.match(/^CTR_([^_]+)_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  if (contractMatch) {
    return {
      documentKind: "generatedContract",
      contractNumber: contractMatch[1],
      category: contractMatch[2],
      contractType: contractMatch[3],
      version: contractMatch[4],
      status: contractMatch[5],
      baseName
    };
  }

  const error = new Error(`Nombre de documento no válido para edición versionada: ${fileName}`);
  error.statusCode = 400;
  throw error;
}

function padVersion(versionNumber) {
  return `v${String(versionNumber).padStart(3, "0")}`;
}

function getNextTemplateVersion({ directory, category, contractType }) {
  const files = fs.readdirSync(directory);

  const versions = files
    .map((fileName) => {
      const match = fileName.match(
        new RegExp(`^TPL_${category}_${contractType}_v(\\d+)_.*\\.(docx|html)$`, "i")
      );

      if (!match) {
        return null;
      }

      return Number(match[1]);
    })
    .filter((version) => Number.isFinite(version));

  const maxVersion = versions.length > 0 ? Math.max(...versions) : 0;

  return padVersion(maxVersion + 1);
}

function buildUniqueFilePath(directory, desiredFileName) {
  let fullPath = path.join(directory, desiredFileName);

  if (!fs.existsSync(fullPath)) {
    return {
      fullPath,
      fileName: desiredFileName
    };
  }

  const extension = path.extname(desiredFileName);
  const baseName = desiredFileName.slice(0, -extension.length);

  let counter = 2;

  while (true) {
    const candidate = `${baseName}_${counter}${extension}`;
    fullPath = path.join(directory, candidate);

    if (!fs.existsSync(fullPath)) {
      return {
        fullPath,
        fileName: candidate
      };
    }

    counter += 1;
  }
}

async function getEditableHtml(relativePath) {
  const fileInfo = getFileInfo(relativePath);

  if (fileInfo.extension === ".docx") {
    const result = await mammoth.convertToHtml({
      path: fileInfo.fullPath
    });

    return {
      fileInfo,
      sourceType: "docx",
      html: result.value,
      messages: result.messages || []
    };
  }

  if (fileInfo.extension === ".html") {
    return {
      fileInfo,
      sourceType: "html",
      html: fs.readFileSync(fileInfo.fullPath, "utf8"),
      messages: []
    };
  }

  const error = new Error("Solo se pueden editar archivos DOCX o HTML");
  error.statusCode = 400;
  throw error;
}

async function saveHtmlDraftVersion({ sourcePath, html, status = "BORRADOR" }) {
  const sourceInfo = getFileInfo(sourcePath);
  const documentInfo = parseRepositoryDocumentName(sourceInfo.fileName);

  const normalizedStatus = String(status || "BORRADOR")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let desiredFileName;

  if (documentInfo.documentKind === "template") {
    const nextVersion = getNextTemplateVersion({
      directory: sourceInfo.directory,
      category: documentInfo.category,
      contractType: documentInfo.contractType
    });

    desiredFileName = `TPL_${documentInfo.category}_${documentInfo.contractType}_${nextVersion}_${normalizedStatus}.html`;
  } else {
    desiredFileName =
      `CTR_${documentInfo.contractNumber}_${documentInfo.category}_${documentInfo.contractType}_${documentInfo.version}_EDITADO_${normalizedStatus}.html`;
  }

  const uniqueFile = buildUniqueFilePath(sourceInfo.directory, desiredFileName);

  const htmlDocument = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8">',
    `  <title>${uniqueFile.fileName}</title>`,
    "</head>",
    "<body>",
    html || "",
    "</body>",
    "</html>"
  ].join("\n");

  fs.writeFileSync(uniqueFile.fullPath, htmlDocument, "utf8");

  const relativePath = path.relative(REPO_ROOT, uniqueFile.fullPath);

  return {
    message:
      documentInfo.documentKind === "template"
        ? "Nueva versión de plantilla HTML guardada correctamente"
        : "Copia HTML editada del documento generada correctamente",
    file: {
      name: uniqueFile.fileName,
      relativePath,
      category: documentInfo.category,
      contractType: documentInfo.contractType,
      version: documentInfo.version,
      status: normalizedStatus,
      documentKind: documentInfo.documentKind,
      extension: ".html"
    }
  };
}

async function saveHtmlDocxVersion({ sourcePath, html, status = "BORRADOR" }) {
  const sourceInfo = getFileInfo(sourcePath);
  const documentInfo = parseRepositoryDocumentName(sourceInfo.fileName);

  const normalizedStatus = String(status || "BORRADOR")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let desiredFileName;

  if (documentInfo.documentKind === "template") {
    const nextVersion = getNextTemplateVersion({
      directory: sourceInfo.directory,
      category: documentInfo.category,
      contractType: documentInfo.contractType
    });

    desiredFileName = `TPL_${documentInfo.category}_${documentInfo.contractType}_${nextVersion}_${normalizedStatus}.docx`;
  } else {
    desiredFileName =
      `CTR_${documentInfo.contractNumber}_${documentInfo.category}_${documentInfo.contractType}_${documentInfo.version}_EDITADO_${normalizedStatus}.docx`;
  }

  const uniqueFile = buildUniqueFilePath(sourceInfo.directory, desiredFileName);

  const fullHtmlDocument = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8">',
    "  <style>",
    "    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; }",
    "    h1, h2, h3 { font-weight: bold; }",
    "    p { margin: 0 0 10px 0; }",
    "    section { margin-top: 12px; }",
    "  </style>",
    "</head>",
    "<body>",
    html || "",
    "</body>",
    "</html>"
  ].join("\n");

  const buffer = await HTMLtoDOCX(
    fullHtmlDocument,
    null,
    {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
      margins: {
        top: 1440,
        right: 1440,
        bottom: 1440,
        left: 1440
      }
    }
  );

  fs.writeFileSync(uniqueFile.fullPath, buffer);

  const relativePath = path.relative(REPO_ROOT, uniqueFile.fullPath);

  return {
    message:
      documentInfo.documentKind === "template"
        ? "Nueva versión Word de plantilla guardada correctamente"
        : "Copia Word editada del documento generada correctamente",
    file: {
      name: uniqueFile.fileName,
      relativePath,
      category: documentInfo.category,
      contractType: documentInfo.contractType,
      version: documentInfo.version,
      status: normalizedStatus,
      documentKind: documentInfo.documentKind,
      extension: ".docx"
    }
  };
}

module.exports = {
  getEditableHtml,
  saveHtmlDraftVersion,
  saveHtmlDocxVersion
};
