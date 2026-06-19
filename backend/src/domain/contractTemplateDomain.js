const path = require("path");
const { variablesCatalog } = require("./variableCatalog");

const templateManifest = require(path.resolve(__dirname, "../../../docs/contracts/template_manifest.json"));

function parseTemplateId(templateId) {
  const match = String(templateId || "").match(/^TPL_([^_]+)_(.+)_(v\d+)_([^_]+)$/);
  if (!match) return { category: "SIN_CATEGORIA", contractType: templateId || "", version: "v000", status: "DRAFT" };
  return { category: match[1], contractType: match[2], version: match[3], status: match[4] };
}

function variablesForTemplate(templateId) {
  return variablesCatalog
    .filter((variable) => Array.isArray(variable.templates) && variable.templates.includes(templateId))
    .map((variable) => variable.name)
    .sort();
}

function businessDescriptionFor(templateId, contractType) {
  const readable = String(contractType || templateId).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return `Plantilla GDL para ${readable}.`;
}

const templateDefinitions = (templateManifest.templates || []).map((entry) => {
  const parsed = parseTemplateId(entry.templateId);
  return {
    templateId: entry.templateId,
    category: parsed.category,
    contractType: parsed.contractType,
    context: parsed.category === "IP" ? "INTERMEDIACION_PUBLICITARIA" : "COLABORACION_COMERCIAL",
    status: parsed.status,
    version: parsed.version,
    requiredVariables: variablesForTemplate(entry.templateId),
    businessDescription: businessDescriptionFor(entry.templateId, parsed.contractType)
  };
});

function getTemplateDefinition(templateId) {
  return templateDefinitions.find((definition) => definition.templateId === templateId) || null;
}

module.exports = { getTemplateDefinition, parseTemplateId, templateDefinitions };
