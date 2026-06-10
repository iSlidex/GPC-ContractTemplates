const { getContractData } = require("./sapContractService");

function splitValuesByVariableType(variables, values) {
  return variables.reduce((result, variable) => {
    const target = variable.source === "SAP_VARIABLE"
      ? result.variables
      : result.inputFields;

    target[variable.name] = values[variable.name] || "";

    return result;
  }, {
    inputFields: {},
    variables: {}
  });
}

function getMissingRequired(variables, values, source) {
  return variables
    .filter((variable) => variable.required && variable.source === source)
    .filter((variable) => !values[variable.name])
    .map((variable) => variable.name);
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
    lastRefreshedAt: refreshed ? now : null
  };
}

async function refreshVirtualDocument({ template, variables, contractNumber, values }) {
  const sapResult = await getContractData(contractNumber);
  const refreshedValues = {
    ...(values || {}),
    ...(sapResult.values || {})
  };

  return {
    message: "Variables SAP refrescadas. No se regeneraron DOCX/PDF en esta iteración.",
    source: sapResult.source,
    fallback: sapResult.fallback,
    reason: sapResult.reason || null,
    values: refreshedValues,
    virtualDocument: buildVirtualDocumentMetadata({
      contractNumber,
      template,
      variables,
      values: refreshedValues,
      refreshed: true
    })
  };
}

module.exports = {
  buildVirtualDocumentMetadata,
  refreshVirtualDocument
};
