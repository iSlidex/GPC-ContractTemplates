const fs = require("fs");
const path = require("path");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const PDFDocument = require("pdfkit");

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
        extension: path.extname(entry.name)
      });
    }
  }

  return result;
}

function parseTemplateFile(file) {
  const baseName = path.basename(file.name, ".docx");

  const match = baseName.match(/^TPL_([^_]+)_(.+)_(v\d+)_([^_]+)$/);

  if (!match) {
    return {
      templateId: baseName,
      name: file.name,
      category: "Sin categoría",
      contractType: baseName,
      version: "v000",
      status: "DESCONOCIDO",
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
    relativePath: file.relativePath,
    modifiedAt: file.modifiedAt
  };
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
    .filter((item) => item.type === "file" && item.name.endsWith(".docx"))
    .map(parseTemplateFile);
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

function extractTemplateVariables(templateId) {
  const template = getTemplateById(templateId);
  const templatePath = getTemplateAbsolutePath(template);

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  let fullText = "";

  try {
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    fullText = doc.getFullText();
  } catch (error) {
    // Fallback simple: leer XML interno del DOCX
    const xmlFiles = Object.keys(zip.files).filter((fileName) => {
      return fileName.startsWith("word/") && fileName.endsWith(".xml");
    });

    fullText = xmlFiles
      .map((fileName) => zip.files[fileName].asText())
      .join("\n");
  }

  const regex = /\{([A-Za-z0-9_]+)\}/g;
  const variablesSet = new Set();
  let match;

  while ((match = regex.exec(fullText)) !== null) {
    variablesSet.add(match[1]);
  }

  const variables = Array.from(variablesSet)
    .sort()
    .map((name) => ({
      name,
      label: labelFromVariable(name),
      required: true,
      type: inferVariableType(name)
    }));

  return {
    template,
    variables
  };
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

function renderDocxFromTemplate({ templateId, contractNumber, values }) {
  const template = getTemplateById(templateId);
  const templatePath = getTemplateAbsolutePath(template);

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
    relativePath: path.relative(REPO_ROOT, outputPath)
  };
}

function generatePdfFromValues({ templateId, contractNumber, values }) {
  const template = getTemplateById(templateId);

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

  doc.fontSize(11).text(`Número de contrato: ${contractNumber}`);
  doc.text(`Tipo de contrato: ${contractType}`);
  doc.text(`Categoría: ${category}`);
  doc.text(`Versión de plantilla: ${version}`);

  doc.moveDown();

  doc.font("Helvetica-Bold").text("Datos usados para generar el documento:");
  doc.font("Helvetica");

  Object.entries(values).forEach(([key, value]) => {
    doc.moveDown(0.5);
    doc.text(`${key}: ${value || ""}`);
  });

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
        relativePath: path.relative(REPO_ROOT, outputPath)
      });
    });

    stream.on("error", reject);
  });
}

async function generateContractDocuments({ templateId, contractNumber, values }) {
  const variablesInfo = extractTemplateVariables(templateId);

  const normalizedValues = {};

  variablesInfo.variables.forEach((variable) => {
    normalizedValues[variable.name] = values[variable.name] || "";
  });

  const docx = renderDocxFromTemplate({
    templateId,
    contractNumber,
    values: normalizedValues
  });

  const pdf = await generatePdfFromValues({
    templateId,
    contractNumber,
    values: normalizedValues
  });

  const metadata = {
    contractNumber,
    templateId,
    template: variablesInfo.template,
    variables: variablesInfo.variables,
    values: normalizedValues,
    generatedAt: new Date().toISOString(),
    files: {
      docx,
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
    docx,
    pdf,
    metadataFile: {
      fileName: metadataFileName,
      absolutePath: metadataPath,
      relativePath: path.relative(REPO_ROOT, metadataPath)
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
