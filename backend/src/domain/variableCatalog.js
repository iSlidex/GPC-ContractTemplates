const path = require("path");

const variablesCatalog = require(path.resolve(__dirname, "../../../docs/contracts/variables_catalog.json"));

const variablesByName = new Map(variablesCatalog.map((variable) => [variable.name, variable]));

function getVariableDefinition(variableName) {
  return variablesByName.get(variableName) || null;
}

function classifyCatalogVariable(variableName) {
  const definition = getVariableDefinition(variableName);

  if (!definition) {
    return null;
  }

  return {
    label: definition.label,
    required: definition.required !== false,
    type: definition.type || "text",
    source: definition.source === "SAP_VARIABLE" ? "SAP_VARIABLE" : "USER_INPUT",
    ecaType: definition.source === "SAP_VARIABLE" ? "VARIABLE" : "INPUT_FIELD"
  };
}

function getSapVariableNames() {
  return variablesCatalog
    .filter((variable) => variable.source === "SAP_VARIABLE")
    .map((variable) => variable.name);
}

module.exports = {
  classifyCatalogVariable,
  getSapVariableNames,
  getVariableDefinition,
  variablesCatalog
};
