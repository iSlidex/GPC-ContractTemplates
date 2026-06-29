const fs = require("fs");
const path = require("path");
const Docxtemplater = require("docxtemplater");
const PizZip = require("pizzip");
const {
  getTemplates,
  getTemplateById,
  getTemplateAbsolutePath
} = require("./templateMetadataService");
const {
  buildVirtualDocumentMetadata,
  validateRequiredTemplateValues
} = require("./virtualDocumentService");
const { classifyCatalogVariable } = require("../domain/variableCatalog");
const { convertDocxToPdf } = require("./pdfConversionService");

const REPO_ROOT = path.resolve(__dirname, "../../repository");

function getCurrentUserContext(userContext = {}) {
  return {
    id: userContext.id || userContext.userId || process.env.GPC_MOCK_USER_ID || "demo.user",
    email: userContext.email || process.env.GPC_MOCK_USER_EMAIL || "usuario.demo@gpc.local"
  };
}

function isProductionMode() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

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

function getRepositoryTree() {
  ensureDir(REPO_ROOT);

  return {
    root: REPO_ROOT,
    tree: walkFiles(REPO_ROOT, REPO_ROOT)
  };
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

const LEGACY_SAP_VARIABLES = new Set([
  "CONTRACT_NUMBER",
  "CONTRACTOR_NAME",
  "CONTRACTOR_ID",
  "CONTRACTOR_ADDRESS",
  "CONTRACTOR_EMAIL",
  "CONTRACT_PURPOSE",
  "CONTRACT_AMOUNT",
  "CONTRACT_CURRENCY",
  "START_DATE",
  "END_DATE"
]);

function classifyVariable(variableName) {
  const catalogClassification = classifyCatalogVariable(variableName);

  if (catalogClassification) {
    return catalogClassification;
  }

  if (LEGACY_SAP_VARIABLES.has(variableName)) {
    return {
      source: "SAP_VARIABLE",
      ecaType: "VARIABLE"
    };
  }

  return {
    source: "USER_INPUT",
    ecaType: "INPUT_FIELD"
  };
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
      type: inferVariableType(name),
      ...classifyVariable(name)
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
    rendered = rendered.replace(regex, value === null || value === undefined ? "" : value);
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

function buildPdfFileName({ template, contractNumber }) {
  return `CTR_${contractNumber}_${template.category}_${template.contractType}_${template.version}_PARA_FIRMA.pdf`;
}

function enrichValuesWithSessionFallbacks(variables, values, userContext) {
  const normalizedValues = { ...(values || {}) };
  const requiresSalesSupportEmail = (variables || []).some((variable) => variable.name === "SALES_SUPPORT_EMAIL" && variable.required);

  if (requiresSalesSupportEmail && !normalizedValues.SALES_SUPPORT_EMAIL) {
    // Fallback temporal hasta integrar identidad real SAP/BTP.
    normalizedValues.SALES_SUPPORT_EMAIL = getCurrentUserContext(userContext).email;
  }

  return normalizedValues;
}

function buildPdfUnavailableMetadata(error) {
  return {
    available: false,
    status: error.code || "PDF_CONVERSION_FAILED",
    message: "El DOCX fue generado correctamente, pero no se pudo convertir a PDF. Configure LibreOffice/headless converter para generar el documento final de firma.",
    technicalDetail: error.details || error.message
  };
}

function findLatestMetadata(predicate) {
  const metadataDir = path.join(REPO_ROOT, "generated", "metadata");
  let latest = null;

  if (!fs.existsSync(metadataDir)) {
    return null;
  }

  flattenTree(walkFiles(metadataDir, REPO_ROOT))
    .filter((file) => file.type === "file" && file.extension === ".json")
    .forEach((file) => {
      try {
        const metadata = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file.relativePath), "utf8"));
        const enriched = { metadata, file };
        if (predicate(enriched) && (!latest || String(metadata.generatedAt || file.modifiedAt || "") > String(latest.metadata.generatedAt || latest.file.modifiedAt || ""))) {
          latest = enriched;
        }
      } catch (error) {
        // Ignore invalid generated metadata.
      }
    });

  return latest;
}

function throwIfVirtualDocumentFinal({ templateId, contractNumber, virtualDocumentId }) {
  const latest = findLatestMetadata(({ metadata }) => {
    const virtualDocument = metadata.virtualDocument || {};
    return virtualDocument.status === "FINAL" && (
      (virtualDocumentId && virtualDocument.virtualDocumentId === virtualDocumentId) ||
      (templateId && contractNumber && metadata.templateId === templateId && String(metadata.contractNumber) === String(contractNumber))
    );
  });

  if (latest) {
    const error = new Error("El documento virtual ya está FINAL. No se puede editar, refrescar variables ni regenerar documentos.");
    error.statusCode = 409;
    error.code = "DOCUMENT_ALREADY_FINAL";
    throw error;
  }
}

function getMetadataByVirtualDocumentId(virtualDocumentId) {
  return findLatestMetadata(({ metadata }) => {
    const virtualDocument = metadata.virtualDocument || {};
    return virtualDocument.virtualDocumentId === virtualDocumentId;
  });
}

async function generateContractDocuments({ templateId, contractNumber, values, userContext }) {
  const variablesInfo = extractTemplateVariables(templateId);
  const template = variablesInfo.template;
  const templatePath = getTemplateAbsolutePath(template);

  throwIfVirtualDocumentFinal({ templateId, contractNumber });

  const effectiveValues = enrichValuesWithSessionFallbacks(variablesInfo.variables, values, userContext);
  const validation = validateRequiredTemplateValues({
    variables: variablesInfo.variables,
    values: effectiveValues
  });

  if (!validation.isValid) {
    const error = new Error("No se puede generar el contrato: faltan variables requeridas.");
    error.statusCode = 422;
    error.code = "DOCUMENT_VALIDATION_FAILED";
    error.details = validation;
    throw error;
  }

  const normalizedValues = {};

  variablesInfo.variables.forEach((variable) => {
    const value = effectiveValues[variable.name];
    normalizedValues[variable.name] = value === null || value === undefined
      ? ""
      : value;
  });

  let generatedDocument;
  let pdf = null;
  let pdfConversion = null;

  if (template.extension === ".docx") {
    generatedDocument = renderDocxFromTemplate({
      template,
      templatePath,
      contractNumber,
      values: normalizedValues
    });

    const pdfOutputDir = path.join(REPO_ROOT, "generated", "pdf", template.category);
    const pdfOutputFileName = buildPdfFileName({ template, contractNumber });

    try {
      const convertedPdf = await convertDocxToPdf({
        docxPath: generatedDocument.absolutePath,
        outputDir: pdfOutputDir,
        outputFileName: pdfOutputFileName
      });

      pdf = {
        ...convertedPdf,
        relativePath: path.relative(REPO_ROOT, convertedPdf.absolutePath),
        documentRole: "SIGNATURE_FINAL",
        label: "Contrato final para firma",
        available: true
      };
      pdfConversion = {
        available: true,
        status: "COMPLETED",
        converter: convertedPdf.converter
      };
    } catch (error) {
      pdfConversion = buildPdfUnavailableMetadata(error);
    }
  } else if (template.extension === ".html") {
    generatedDocument = renderHtmlFromTemplate({
      template,
      templatePath,
      contractNumber,
      values: normalizedValues
    });

    delete generatedDocument.renderedHtml;
    pdfConversion = {
      available: false,
      status: "PDF_CONVERSION_UNAVAILABLE",
      message: "El PDF final para firma solo se genera desde el DOCX renderizado. Use una plantilla DOCX o configure un conversor equivalente para este formato."
    };
  } else {
    const error = new Error("Tipo de plantilla no soportado para generación");
    error.statusCode = 400;
    throw error;
  }

  const metadata = {
    contractNumber,
    templateId,
    template,
    variables: variablesInfo.variables,
    values: normalizedValues,
    generatedAt: new Date().toISOString(),
    virtualDocument: buildVirtualDocumentMetadata({
      contractNumber,
      template,
      variables: variablesInfo.variables,
      values: normalizedValues
    }),
    pdfConversion,
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


function localFieldMatches(value, queryValue) {
  if (!queryValue) {
    return true;
  }

  const normalizedValue = Array.isArray(value) ? value.join(" ") : String(value || "");
  return normalizedValue.toLowerCase().includes(String(queryValue || "").toLowerCase());
}


function normalizeFileType(extension) {
  return String(extension || "").replace(".", "").toUpperCase() || "N/D";
}

function parseGeneratedName(fileName) {
  const extension = path.extname(fileName);
  const name = path.basename(fileName, extension);
  const match = name.match(/^CTR_([^_]+)_(.+)$/i);

  return {
    contractNumber: match ? match[1] : "",
    templateToken: match ? match[2] : name,
    baseName: name.replace(/_METADATA$/i, "")
  };
}

function stripTechnicalSuffix(baseName) {
  return String(baseName || "")
    .replace(/_(GENERADO|PARA_FIRMA|EDITADO_BORRADOR|METADATA)$/i, "")
    .replace(/_(DRAFT|BORRADOR|FINAL|SIGNED|ARCHIVED)$/i, "");
}

function getSemanticBase(fileName) {
  return stripTechnicalSuffix(path.basename(fileName, path.extname(fileName)));
}

function getMetadataByContract() {
  const metadataDir = path.join(REPO_ROOT, "generated", "metadata");
  const metadataByContract = new Map();

  if (!fs.existsSync(metadataDir)) {
    return metadataByContract;
  }

  flattenTree(walkFiles(metadataDir, REPO_ROOT))
    .filter((file) => file.type === "file" && file.extension === ".json")
    .forEach((file) => {
      try {
        const metadata = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file.relativePath), "utf8"));
        const contractNumber = metadata.contractNumber || parseGeneratedName(file.name).contractNumber;

        if (contractNumber) {
          const existing = metadataByContract.get(String(contractNumber));
          const enrichedMetadata = {
            ...metadata,
            metadataFile: {
              name: file.name,
              type: "METADATA",
              fileType: "METADATA",
              relativePath: file.relativePath,
              modifiedAt: file.modifiedAt,
              size: file.size,
              extension: file.extension
            }
          };

          if (!existing || String(existing.generatedAt || "") < String(metadata.generatedAt || file.modifiedAt || "")) {
            metadataByContract.set(String(contractNumber), enrichedMetadata);
          }
        }
      } catch (error) {
        // Ignore invalid generated metadata; business document derivation must remain resilient.
      }
    });

  return metadataByContract;
}

function getDocumentActions(fileType) {
  const actions = ["PREVIEW", "DOWNLOAD", "DETAIL"];

  if (["DOCX", "HTML"].includes(fileType)) {
    actions.splice(2, 0, "EDIT");
  }

  actions.push("VERSIONS");
  return actions;
}

function getDocumentClassFromName(fileName, metadata = {}) {
  const text = [
    fileName,
    metadata.documentClass,
    metadata.contentType,
    metadata.template && metadata.template.contentType,
    metadata.template && metadata.template.contractType
  ].join(" ").toLowerCase();

  if (text.includes("anexo")) {
    return "Anexo";
  }

  if (text.includes("garant")) {
    return "Garantía";
  }

  if (text.includes("contrato") || text.includes("contract")) {
    return "Contrato";
  }

  return metadata.documentClass || "Contrato";
}

function getDocumentStatus(file, metadata = {}) {
  const name = String(file.name || "").toUpperCase();

  if (metadata.status) {
    return metadata.status;
  }

  if (name.includes("EDITADO_BORRADOR") || name.includes("BORRADOR") || name.includes("DRAFT")) {
    return "DRAFT";
  }

  if (name.includes("FIRMADO") || name.includes("SIGNED")) {
    return "SIGNED";
  }

  if (name.includes("FINAL")) {
    return "FINAL";
  }

  if (name.includes("ARCHIVED")) {
    return "ARCHIVED";
  }

  return "GENERATED";
}

function buildFileDescriptor(file, metadataByContract) {
  const parsed = parseGeneratedName(file.name);
  const fileType = normalizeFileType(file.extension);
  const metadata = metadataByContract.get(String(parsed.contractNumber)) || {};
  const template = metadata.template || {};
  const virtualDocument = metadata.virtualDocument || {};
  const isMetadata = fileType === "JSON" || /metadata/i.test(file.name);
  const documentId = Buffer.from(file.relativePath).toString("base64url");
  const templateId = metadata.templateId || template.templateId || parsed.templateToken;
  const templateVersion = template.version || (parsed.templateToken.match(/_v\d+/i) || ["N/D"])[0].replace(/^_/, "");
  const metadataSemanticBase = [
    "CTR",
    metadata.contractNumber || parsed.contractNumber,
    template.category,
    template.contractType,
    template.version
  ].filter(Boolean).join("_");
  const semanticBase = isMetadata && metadataSemanticBase ? metadataSemanticBase : getSemanticBase(file.name);
  const groupKey = [
    metadata.contractNumber || parsed.contractNumber || "NO_CONTRACT",
    templateId || "NO_TEMPLATE",
    templateVersion || "NO_VERSION",
    semanticBase
  ].join("|").toUpperCase();

  return {
    documentId,
    groupKey,
    semanticBase,
    name: file.name,
    displayName: String(semanticBase || file.name).replace(/^CTR_/, "").replace(/_/g, " "),
    relativePath: file.relativePath,
    contractNumber: metadata.contractNumber || parsed.contractNumber,
    templateId,
    templateVersion,
    category: template.category || (template.categories && template.categories[0]) || metadata.category || "N/D",
    documentClass: getDocumentClassFromName(file.name, metadata),
    fileType: isMetadata ? "METADATA" : fileType,
    extension: file.extension,
    contentType: metadata.contentType || template.contentType || "Contrato",
    language: metadata.language || template.language || "es",
    status: getDocumentStatus(file, metadata),
    assemblyStatus: virtualDocument.status || metadata.assemblyStatus || "PENDING",
    generatedAt: metadata.generatedAt || file.modifiedAt,
    modifiedAt: file.modifiedAt,
    size: file.size,
    variables: metadata.variables || [],
    values: metadata.values || {},
    inputFields: virtualDocument.inputFields || [],
    messages: virtualDocument.messages || [],
    virtualDocument: {
      ...virtualDocument,
      values: metadata.values || {},
      dataSource: virtualDocument.dataSource || metadata.dataSource || metadata.source || "SAP/mock"
    },
    isMetadata,
    availableActions: isMetadata ? ["DOWNLOAD", "DETAIL"] : getDocumentActions(fileType)
  };
}

function getPrimaryPriority(fileDescriptor) {
  const name = String(fileDescriptor.name || "").toUpperCase();

  if (fileDescriptor.fileType === "PDF" && /(PARA_FIRMA|FINAL|SIGNED|FIRMADO)/.test(name)) {
    return 1;
  }

  if (fileDescriptor.fileType === "PDF") {
    return 2;
  }

  if (fileDescriptor.fileType === "DOCX" && /GENERADO/.test(name)) {
    return 3;
  }

  if (fileDescriptor.fileType === "DOCX") {
    return 4;
  }

  if (fileDescriptor.fileType === "HTML") {
    return 5;
  }

  return 99;
}

function sortBusinessDocuments(documents, sortBy, sortDirection) {
  const field = sortBy || "modifiedAt";
  const direction = String(sortDirection || "desc").toLowerCase() === "asc" ? 1 : -1;

  return documents.sort((a, b) => {
    const left = a[field] || "";
    const right = b[field] || "";

    if (left === right) {
      return 0;
    }

    return left > right ? direction : -direction;
  });
}

function mergeDocumentGroup(group) {
  const allFiles = group.files.slice().sort((a, b) => {
    const priorityDelta = getPrimaryPriority(a) - getPrimaryPriority(b);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return String(b.modifiedAt || "").localeCompare(String(a.modifiedAt || ""));
  });
  const businessFiles = allFiles.filter((file) => !file.isMetadata);
  const primary = businessFiles[0];

  if (!primary) {
    return null;
  }

  const relatedFiles = allFiles.map((file) => ({
    documentId: file.documentId,
    type: file.fileType,
    fileType: file.fileType,
    name: file.name,
    relativePath: file.relativePath,
    modifiedAt: file.modifiedAt,
    size: file.size,
    isMetadata: file.isMetadata,
    extension: file.extension,
    availableActions: file.availableActions
  }));
  const modifiedAt = relatedFiles.reduce((latest, file) => {
    return String(file.modifiedAt || "") > String(latest || "") ? file.modifiedAt : latest;
  }, primary.modifiedAt);
  const fileTypes = Array.from(new Set(relatedFiles.map((file) => file.type)));
  const metadataFile = relatedFiles.find((file) => file.isMetadata || file.type === "METADATA");

  return {
    ...primary,
    name: primary.name,
    displayName: primary.displayName || primary.name,
    relativePath: primary.relativePath,
    modifiedAt,
    primaryFile: {
      type: primary.fileType,
      fileType: primary.fileType,
      name: primary.name,
      relativePath: primary.relativePath,
      modifiedAt: primary.modifiedAt,
      extension: primary.extension
    },
    relatedFiles,
    relatedVersions: relatedFiles,
    fileTypes,
    hasMetadata: !!metadataFile,
    metadataFile,
    availableActions: getDocumentActions(primary.fileType),
    versionCount: relatedFiles.length
  };
}

function filterBusinessDocument(document, query = {}) {
  const searchableText = [
    document.name,
    document.displayName,
    document.relativePath,
    document.contractNumber,
    document.templateId,
    document.templateVersion,
    document.category,
    document.documentClass,
    document.contentType,
    document.status,
    document.assemblyStatus,
    document.fileType,
    (document.relatedFiles || []).map((file) => file.name + " " + file.relativePath + " " + file.type).join(" ")
  ].join(" ");

  return localFieldMatches(searchableText, query.q) &&
    localFieldMatches(document.contractNumber, query.contractId) &&
    localFieldMatches(document.category, query.category) &&
    localFieldMatches(document.templateId, query.templateId) &&
    localFieldMatches(document.status, query.status) &&
    localFieldMatches(document.assemblyStatus, query.assemblyStatus) &&
    localFieldMatches(document.documentClass, query.documentClass || query.contentType) &&
    (!query.fileType || (document.relatedFiles || []).some((file) => localFieldMatches(file.type, query.fileType)) || localFieldMatches(document.fileType, query.fileType));
}

function getBusinessDocuments(query = {}) {
  ensureDir(REPO_ROOT);

  const limit = Math.min(Math.max(parseInt(query.limit || "20", 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset || "0", 10) || 0, 0);
  const includeAll = String(query.includeAll || "").toLowerCase() === "true" || query.includeAll === "1";
  const metadataByContract = getMetadataByContract();
  const generatedRoot = path.join(REPO_ROOT, "generated");
  const allGeneratedFiles = flattenTree(walkFiles(generatedRoot, REPO_ROOT))
    .filter((file) => file.type === "file" && [".docx", ".pdf", ".html", ".json"].includes(file.extension));
  const fileDescriptors = allGeneratedFiles.map((file) => buildFileDescriptor(file, metadataByContract));
  const grouped = new Map();

  fileDescriptors.forEach((file) => {
    const existing = grouped.get(file.groupKey) || { files: [] };
    existing.files.push(file);
    grouped.set(file.groupKey, existing);
  });

  const documents = Array.from(grouped.values())
    .map(mergeDocumentGroup)
    .filter(Boolean);
  const total = documents.length;
  let filteredDocuments = documents.filter((document) => filterBusinessDocument(document, {
    ...query,
    contractId: includeAll ? "" : query.contractId
  }));

  const filtered = filteredDocuments.length;
  sortBusinessDocuments(filteredDocuments, query.sortBy, query.sortDirection);

  return {
    documents: filteredDocuments.slice(offset, offset + limit),
    total,
    filtered,
    limit,
    offset,
    includeAll,
    groupingHeuristic: "Agrupa archivos generados por contractNumber, templateId/nombre, version y prefijo semantico antes de _GENERADO, _PARA_FIRMA, _EDITADO_BORRADOR o _METADATA. La metadata se adjunta como archivo relacionado y no como fila principal."
  };
}

function finalizeVirtualDocument({ virtualDocumentId, userContext }) {
  const found = getMetadataByVirtualDocumentId(virtualDocumentId);

  if (!found) {
    const error = new Error("Documento virtual no encontrado.");
    error.statusCode = 404;
    error.code = "DOCUMENT_NOT_FOUND";
    throw error;
  }

  const metadata = found.metadata;
  const virtualDocument = metadata.virtualDocument || {};
  const pdf = metadata.files && metadata.files.pdf;
  const document = metadata.files && metadata.files.document;
  const missingRequiredVariables = virtualDocument.missingRequiredVariables || [];
  const warnings = [];
  const reasons = [];

  if (virtualDocument.status === "FINAL") {
    const error = new Error("El documento virtual ya está FINAL.");
    error.statusCode = 409;
    error.code = "DOCUMENT_ALREADY_FINAL";
    throw error;
  }

  if (virtualDocument.status !== "COMPLETED") {
    reasons.push("El estado actual debe ser COMPLETED.");
  }
  if (missingRequiredVariables.length) {
    reasons.push("Existen variables requeridas faltantes: " + missingRequiredVariables.join(", "));
  }
  if (!document || !document.relativePath || !fs.existsSync(path.join(REPO_ROOT, document.relativePath))) {
    reasons.push("No existe DOCX generado.");
  }
  if (!pdf || !pdf.available || !pdf.relativePath || !fs.existsSync(path.join(REPO_ROOT, pdf.relativePath))) {
    reasons.push("No existe PDF final generado.");
  } else if (pdf.fallback || pdf.documentRole !== "SIGNATURE_FINAL") {
    reasons.push("El PDF disponible no es el PDF final para firma.");
  }

  const templateStatus = String((metadata.template && metadata.template.status) || "").toUpperCase();
  if (templateStatus !== "RELEASED") {
    if (templateStatus === "APPROVED" && !isProductionMode()) {
      warnings.push("Modo demo: se permite finalizar con plantilla APPROVED; en productivo se exigirá RELEASED.");
    } else {
      reasons.push("La plantilla debe estar RELEASED para finalizar en productivo.");
    }
  }

  if (reasons.length) {
    const error = new Error("No se puede marcar como FINAL.");
    error.statusCode = 422;
    error.code = "DOCUMENT_FINALIZE_VALIDATION_FAILED";
    error.details = { reasons };
    throw error;
  }

  const now = new Date().toISOString();
  const currentUser = getCurrentUserContext(userContext);
  metadata.status = "FINAL";
  metadata.finalizedAt = now;
  metadata.finalizedBy = currentUser.email;
  metadata.finalizationWarnings = warnings;
  metadata.virtualDocument = {
    ...virtualDocument,
    status: "FINAL",
    finalizedAt: now,
    finalizedBy: currentUser.email,
    warnings
  };

  fs.writeFileSync(path.join(REPO_ROOT, found.file.relativePath), JSON.stringify(metadata, null, 2));

  return { message: "Documento virtual marcado como FINAL.", metadata, warnings };
}

function isSourcePathFinal(sourcePath) {
  const relative = String(sourcePath || "");
  const found = findLatestMetadata(({ metadata }) => {
    const files = metadata.files || {};
    const paths = [files.document && files.document.relativePath, files.pdf && files.pdf.relativePath];
    return (metadata.virtualDocument || {}).status === "FINAL" && paths.includes(relative);
  });
  return !!found;
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
  getBusinessDocuments,
  getTemplates,
  extractTemplateVariables,
  generateContractDocuments,
  getFileForDownload,
  finalizeVirtualDocument,
  isSourcePathFinal,
  throwIfVirtualDocumentFinal,
  getCurrentUserContext
};
