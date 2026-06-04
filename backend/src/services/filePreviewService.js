const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const mime = require("mime-types");

const REPO_ROOT = path.resolve(__dirname, "../../repository");

function safeJoin(root, relativePath) {
  const fullPath = path.resolve(root, relativePath || "");

  if (!fullPath.startsWith(root)) {
    throw new Error("Ruta no permitida");
  }

  return fullPath;
}

function getFilePath(relativePath) {
  const fullPath = safeJoin(REPO_ROOT, relativePath);

  if (!fs.existsSync(fullPath)) {
    const error = new Error("Archivo no encontrado");
    error.statusCode = 404;
    throw error;
  }

  return fullPath;
}

function getFileInfo(relativePath) {
  const fullPath = getFilePath(relativePath);
  const stat = fs.statSync(fullPath);
  const extension = path.extname(fullPath).toLowerCase();

  return {
    fullPath,
    fileName: path.basename(fullPath),
    relativePath,
    extension,
    mimeType: mime.lookup(fullPath) || "application/octet-stream",
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

async function previewDocxAsHtml(relativePath) {
  const fileInfo = getFileInfo(relativePath);

  if (fileInfo.extension !== ".docx") {
    const error = new Error("El archivo no es DOCX");
    error.statusCode = 400;
    throw error;
  }

  const result = await mammoth.convertToHtml({
    path: fileInfo.fullPath
  });

  return {
    fileInfo,
    html: result.value,
    messages: result.messages || []
  };
}

function readTextFile(relativePath) {
  const fileInfo = getFileInfo(relativePath);

  const allowed = [".json", ".txt", ".xml", ".csv", ".md"];

  if (!allowed.includes(fileInfo.extension)) {
    const error = new Error("El archivo no es de texto soportado para preview");
    error.statusCode = 400;
    throw error;
  }

  return {
    fileInfo,
    text: fs.readFileSync(fileInfo.fullPath, "utf8")
  };
}

module.exports = {
  getFileInfo,
  previewDocxAsHtml,
  readTextFile
};
