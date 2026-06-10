const fs = require("fs");
const path = require("path");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const PDFDocument = require("pdfkit");
const {
  getAvailableTemplateActions,
  getTemplateStatusState,
  normalizeTemplateStatus
} = require("./templateLifecycle");

const REPO_ROOT = path.resolve(__dirname, "../../repository");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeJoin(root, relativePath) {
  const fullPath = path.resolve(root, relativePath || "");

  if (!fullPath.startsWith(root)) {
    throw new Error("Ruta no permitida");
  }

  return fullPath;
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
      result.push({
        type: "folder",
        name: entry.name,
        relativePath,
        children: walkFiles(fullPath, basePath)
      });
    } else {
      const stat = fs.statSync(fullPath);

      result.push({
        type: "file",
        name: entry.name,
        relativePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        extension: path.extname(entry.name).toLowerCase()
      });
    }
  }

  return result;
}

function flattenTree(nodes, result = []) {
  for (const node of nodes) {
    result.push(node);

    if (node.children) {
      flattenTree(node.children, result);
    }
  }

  return result;
}

function parseTemplateFile(file) {
  const extension = path.extname(file.name).toLowerCase();
  const baseName = path.basename(file.name, extension);
  const sidecarMetadata = getTemplateSidecarMetadata(file.relativePath, baseName);

  const match = baseName.match(/^TPL_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  if (!match) {
    return enrichTemplateMetadata({
      templateId: baseName,
      name: file.name,
      category: "SIN_CATEGORIA",
      contractType: baseName,
      version: "v000",
      status: "DRAFT",
      extension,
      relativePath: file.relativePath,
      modifiedAt: file.modifiedAt
    }, sidecarMetadata);
  }

  return enrichTemplateMetadata({
    templateId: baseName,
    name: file.name,
    category: match[1],
    contractType: match[2],
    version: match[3],
    status: match[4],
    extension,
    relativePath: file.relativePath,
    modifiedAt: file.modifiedAt
  }, sidecarMetadata);
}

function getTemplateSidecarMetadata(relativePath, baseName) {
  const templatesRoot = path.join(REPO_ROOT, "templates");
  const templateDirectory = path.dirname(safeJoin(templatesRoot, relativePath));
  const sidecarPath = path.join(templateDirectory, `${baseName}.metadata.json`);

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

function revisionFromVersion(version) {
  const match = String(version || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function contentTypeFromExtension(extension) {
  if (extension === ".docx") {
    return "DOCX";
  }

  if (extension === ".html") {
    return "HTML";
  }

  return "UNKNOWN";
}

function enrichTemplateMetadata(template, sidecarMetadata = {}) {
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
      `Plantilla ${template.contractType} ${template.version}`,
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

function getRepositoryTree() {
  ensureDir(REPO_ROOT);

  return {
    root: REPO_ROOT,
    tree: walkFiles(REPO_ROOT, REPO_ROOT)
  };
}

function getTemplates() {
  const templatesRoot = path.join(REPO_ROOT, "templates");
  const tree = walkFiles(templatesRoot, templatesRoot);
  const flat = flattenTree(tree);

  return flat
    .filter((item) => {
      return (
        item.type === "file" &&
        [".docx", ".html"].includes(item.extension)
      );
    })
    .map(parseTemplateFile)
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.contractType !== b.contractType) return a.contractType.localeCompare(b.contractType);
      return b.version.localeCompare(a.version);
    });
}

function getTemplateById(templateId) {
  const templates = getTemplates();
  const template = templates.find((item) => item.templateId === templateId);

  if (!template) {
    const error = new Error(`Plantilla no encontrada: ${templateId}`);
    error.statusCode = 404;
    throw error;
  }

  return template;
}

function getTemplateAbsolutePath(template) {
  const templatesRoot = path.join(REPO_ROOT, "templates");
  return safeJoin(templatesRoot, template.relativePath);
}

function labelFromVariable(variableName) {
  return variableName
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferVariableType(variableName) {
  if (variableName.includes("DATE") || variableName.includes("FECHA")) {
    return "date";
  }

  if (
    variableName.includes("AMOUNT") ||
    variableName.includes("MONTO") ||
    variableName.includes("TOTAL")
  ) {
    return "number";
  }

  if (variableName.includes("EMAIL") || variableName.includes("CORREO")) {
    return "email";
  }

  return "text";
}

function extractVariablesFromText(fullText) {
  const regex = /\{([A-Za-z0-9_]+)\}/g;
  const variablesSet = new Set();
  let match;

  while ((match = regex.exec(fullText)) !== null) {
    variablesSet.add(match[1]);
  }

  return Array.from(variablesSet)
    .sort()
    .map((name) => ({
      name,
      label: labelFromVariable(name),
      required: true,
      type: inferVariableType(name)
    }));
}

function extractTemplateVariables(templateId) {
  const template = getTemplateById(templateId);
  const templatePath = getTemplateAbsolutePath(template);

  let fullText = "";

  if (template.extension === ".html") {
    fullText = fs.readFileSync(templatePath, "utf8");
  } else if (template.extension === ".docx") {
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    try {
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true
      });

      fullText = doc.getFullText();
    } catch (error) {
      const xmlFiles = Object.keys(zip.files).filter((fileName) => {
        return fileName.startsWith("word/") && fileName.endsWith(".xml");
      });

      fullText = xmlFiles
        .map((fileName) => zip.files[fileName].asText())
        .join("\n");
    }
  } else {
    const error = new Error("Tipo de plantilla no soportado para extracción de variables");
    error.statusCode = 400;
    throw error;
  }

  return {
    template,
    variables: extractVariablesFromText(fullText)
  };
}

function renderStringTemplate(content, values) {
  let rendered = content;

  Object.entries(values).forEach(([key, value]) => {
    const regex = new RegExp("\\{" + key + "\\}", "g");
    rendered = rendered.replace(regex, value || "");
  });

  return rendered;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderDocxFromTemplate({ template, templatePath, contractNumber, values }) {
  const category = template.category;
  const contractType = template.contractType;
  const version = template.version;

  const outputDir = path.join(REPO_ROOT, "generated", "docx", category);
  ensureDir(outputDir);

  const outputFileName = `CTR_${contractNumber}_${category}_${contractType}_${version}_GENERADO.docx`;
  const outputPath = path.join(outputDir, outputFileName);

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });

  doc.render(values);

  fs.writeFileSync(outputPath, doc.toBuffer());

  return {
    fileName: outputFileName,
    absolutePath: outputPath,
    relativePath: path.relative(REPO_ROOT, outputPath),
    extension: ".docx"
  };
}

function renderHtmlFromTemplate({ template, templatePath, contractNumber, values }) {
  const category = template.category;
  const contractType = template.contractType;
  const version = template.version;

  const outputDir = path.join(REPO_ROOT, "generated", "html", category);
  ensureDir(outputDir);

  const outputFileName = `CTR_${contractNumber}_${category}_${contractType}_${version}_GENERADO.html`;
  const outputPath = path.join(outputDir, outputFileName);

  const htmlTemplate = fs.readFileSync(templatePath, "utf8");
  const renderedHtml = renderStringTemplate(htmlTemplate, values);

  fs.writeFileSync(outputPath, renderedHtml, "utf8");

  return {
    fileName: outputFileName,
    absolutePath: outputPath,
    relativePath: path.relative(REPO_ROOT, outputPath),
    extension: ".html",
    renderedHtml
  };
}

function generatePdfFromRenderedContent({ template, contractNumber, renderedContent, values }) {
  const category = template.category;
  const contractType = template.contractType;
  const version = template.version;

  const outputDir = path.join(REPO_ROOT, "generated", "pdf", category);
  ensureDir(outputDir);

  const outputFileName = `CTR_${contractNumber}_${category}_${contractType}_${version}_PARA_FIRMA.pdf`;
  const outputPath = path.join(outputDir, outputFileName);

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 72
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(16).text("CONTRATO GENERADO PARA FIRMA", {
    align: "center"
  });

  doc.moveDown(2);

  doc.fontSize(10).text(`Número de contrato: ${contractNumber}`);
  doc.text(`Tipo de contrato: ${contractType}`);
  doc.text(`Categoría: ${category}`);
  doc.text(`Versión de plantilla: ${version}`);

  doc.moveDown();

  if (renderedContent) {
    doc.fontSize(11).text(stripHtml(renderedContent), {
      align: "justify",
      lineGap: 4
    });
  } else {
    doc.font("Helvetica-Bold").text("Datos usados para generar el documento:");
    doc.font("Helvetica");

    Object.entries(values).forEach(([key, value]) => {
      doc.moveDown(0.5);
      doc.text(`${key}: ${value || ""}`);
    });
  }

  doc.moveDown(4);

  doc.text("______________________________");
  doc.text("EL CONTRATISTA");

  doc.moveDown(2);

  doc.text("______________________________");
  doc.text("LA EMPRESA");

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => {
      resolve({
        fileName: outputFileName,
        absolutePath: outputPath,
        relativePath: path.relative(REPO_ROOT, outputPath),
        extension: ".pdf"
      });
    });

    stream.on("error", reject);
  });
}

async function generateContractDocuments({ templateId, contractNumber, values }) {
  const variablesInfo = extractTemplateVariables(templateId);
  const template = variablesInfo.template;
  const templatePath = getTemplateAbsolutePath(template);

  const normalizedValues = {};

  variablesInfo.variables.forEach((variable) => {
    normalizedValues[variable.name] = values[variable.name] || "";
  });

  let generatedDocument;
  let renderedContent = "";

  if (template.extension === ".docx") {
    generatedDocument = renderDocxFromTemplate({
      template,
      templatePath,
      contractNumber,
      values: normalizedValues
    });

    renderedContent = null;
  } else if (template.extension === ".html") {
    generatedDocument = renderHtmlFromTemplate({
      template,
      templatePath,
      contractNumber,
      values: normalizedValues
    });

    renderedContent = generatedDocument.renderedHtml;
    delete generatedDocument.renderedHtml;
  } else {
    const error = new Error("Tipo de plantilla no soportado para generación");
    error.statusCode = 400;
    throw error;
  }

  const pdf = await generatePdfFromRenderedContent({
    template,
    contractNumber,
    renderedContent,
    values: normalizedValues
  });

  const metadata = {
    contractNumber,
    templateId,
    template,
    variables: variablesInfo.variables,
    values: normalizedValues,
    generatedAt: new Date().toISOString(),
    files: {
      document: generatedDocument,
      pdf
    }
  };

  const metadataDir = path.join(REPO_ROOT, "generated", "metadata");
  ensureDir(metadataDir);

  const metadataFileName = `CTR_${contractNumber}_METADATA.json`;
  const metadataPath = path.join(metadataDir, metadataFileName);

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return {
    metadata,
    document: generatedDocument,
    docx: generatedDocument,
    pdf,
    metadataFile: {
      fileName: metadataFileName,
      absolutePath: metadataPath,
      relativePath: path.relative(REPO_ROOT, metadataPath),
      extension: ".json"
    }
  };
}

function getFileForDownload(relativePath) {
  const fullPath = safeJoin(REPO_ROOT, relativePath);

  if (!fs.existsSync(fullPath)) {
    const error = new Error("Archivo no encontrado");
    error.statusCode = 404;
    throw error;
  }

  return fullPath;
}

module.exports = {
  getRepositoryTree,
  getTemplates,
  extractTemplateVariables,
  generateContractDocuments,
  getFileForDownload
};
