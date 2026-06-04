const fs = require("fs");
const path = require("path");

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

function parseClauseFile(file) {
  const baseName = path.basename(file.name, ".html");

  const match = baseName.match(/^CLA_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  const html = fs.readFileSync(file.fullPath, "utf8");

  if (!match) {
    return {
      clauseId: baseName,
      name: file.name,
      title: titleFromHtml(html, baseName),
      category: "SIN_CATEGORIA",
      code: baseName,
      version: "v000",
      status: "DESCONOCIDO",
      relativePath: path.join("clauses", file.relativePath),
      modifiedAt: file.modifiedAt,
      extension: file.extension,
      html
    };
  }

  return {
    clauseId: baseName,
    name: file.name,
    title: titleFromHtml(html, match[2]),
    category: match[1],
    code: match[2],
    version: match[3],
    status: match[4],
    relativePath: path.join("clauses", file.relativePath),
    modifiedAt: file.modifiedAt,
    extension: file.extension,
    html
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

  return files.map(({ html, ...clause }) => clause);
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

module.exports = {
  getClauses,
  getClauseById
};
