const { getContractData } = require("./sapContractService");

function hasRequiredValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function splitValuesByVariableType(variables, values) {
  return variables.reduce((result, variable) => {
    const target = variable.source === "SAP_VARIABLE"
      ? result.variables
      : result.inputFields;

    const value = values[variable.name];
    target[variable.name] = value === null || value === undefined ? "" : value;

    return result;
  }, {
    inputFields: {},
    variables: {}
  });
}

function getMissingRequired(variables, values, source) {
  return variables
    .filter((variable) => variable.required && variable.source === source)
    .filter((variable) => !hasRequiredValue(values[variable.name]))
    .map((variable) => variable.name);
}

function applySessionFallbacks(variables, values, userContext = {}) {
  const resolved = { ...(values || {}) };
  const requiresEmail = (variables || []).some((variable) => variable.name === "SALES_SUPPORT_EMAIL" && variable.required);
  if (requiresEmail && !hasRequiredValue(resolved.SALES_SUPPORT_EMAIL)) {
    // Fallback temporal hasta integrar identidad real SAP/BTP.
    resolved.SALES_SUPPORT_EMAIL = userContext.email || process.env.GPC_MOCK_USER_EMAIL || "usuario.demo@gpc.local";
  }
  return resolved;
}

function validateRequiredTemplateValues({ variables, values, userContext }) {
  const sourceValues = applySessionFallbacks(variables, values, userContext);
  const missingSapVariables = getMissingRequired(variables || [], sourceValues, "SAP_VARIABLE");
  const missingUserInputs = getMissingRequired(variables || [], sourceValues, "USER_INPUT");
  const missingRequiredVariables = [...missingSapVariables, ...missingUserInputs];
  const messages = [];

  if (missingSapVariables.length > 0) {
    messages.push(`Bloqueado por variables SAP faltantes: ${missingSapVariables.join(", ")}`);
  }

  if (missingUserInputs.length > 0) {
    messages.push(`Bloqueado por campos de usuario requeridos: ${missingUserInputs.join(", ")}`);
  }

  if (!messages.length) {
    messages.push("Listo para generar");
  }

  return {
    isValid: missingRequiredVariables.length === 0,
    missingSapVariables,
    missingUserInputs,
    missingRequiredVariables,
    messages
  };
}

function buildVirtualDocumentMetadata({
  contractNumber,
  template,
  variables,
  values,
  refreshed = false
}) {
  const missingUserInput = getMissingRequired(variables, values, "USER_INPUT");
  const missingSapVariables = getMissingRequired(variables, values, "SAP_VARIABLE");
  const messages = [];
  let status = "COMPLETED";

  if (missingSapVariables.length > 0) {
    status = "ERROR";
    messages.push(`Faltan variables SAP: ${missingSapVariables.join(", ")}`);
  } else if (missingUserInput.length > 0) {
    status = "PENDING";
    messages.push(`Faltan campos de usuario: ${missingUserInput.join(", ")}`);
  }

  if (template.status !== "RELEASED") {
    messages.push(`Advertencia: la plantilla está en estado ${template.status}; en productivo debería usarse RELEASED.`);
  }

  const splitValues = splitValuesByVariableType(variables, values);
  const now = new Date().toISOString();

  return {
    virtualDocumentId: `VD_${contractNumber}_${template.templateId}`,
    contractNumber,
    templateId: template.templateId,
    templateVersion: template.version,
    status,
    messages,
    inputFields: splitValues.inputFields,
    variables: splitValues.variables,
    generatedAt: now,
    lastRefreshedAt: refreshed ? now : null,
    missingSapVariables,
    missingUserInputs: missingUserInput,
    missingRequiredVariables: [...missingSapVariables, ...missingUserInput]
  };
}

async function refreshVirtualDocument({ template, variables, contractNumber, values, userContext }) {
  const sapResult = await getContractData(contractNumber, { templateId: template.templateId });
  const refreshedValues = applySessionFallbacks(variables, {
    ...(values || {}),
    ...(sapResult.values || {})
  }, userContext);

  const metadata = buildVirtualDocumentMetadata({
    contractNumber,
    template,
    variables,
    values: refreshedValues,
    refreshed: true
  });
  const refreshedSapVariables = variables
    .filter((variable) => variable.source === "SAP_VARIABLE" && refreshedValues[variable.name])
    .map((variable) => variable.name);
  const pendingVariables = variables
    .filter((variable) => variable.required && !refreshedValues[variable.name])
    .map((variable) => variable.name);

  return {
    message: `Refresh completado: ${refreshedSapVariables.length} variables SAP/mock actualizadas. Pendientes requeridos: ${pendingVariables.length ? pendingVariables.join(", ") : "ninguno"}. Este refresh solo actualiza datos automáticos SAP/mock; usa Completar campos de usuario para capturar valores manuales y Regenerar DOCX/PDF para producir archivos finales actualizados.`,
    refreshedVariables: refreshedSapVariables,
    pendingVariables,
    source: sapResult.source,
    fallback: sapResult.fallback,
    reason: sapResult.reason || null,
    values: refreshedValues,
    virtualDocument: metadata
  };
}

module.exports = {
  buildVirtualDocumentMetadata,
  hasRequiredValue,
  refreshVirtualDocument,
  validateRequiredTemplateValues,
  applySessionFallbacks
};
