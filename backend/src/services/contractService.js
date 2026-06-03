const { contracts } = require("../data/contracts.mock");

function getContractById(contractId) {
  const contract = contracts[contractId];

  if (!contract) {
    const error = new Error(`Contrato no encontrado: ${contractId}`);
    error.statusCode = 404;
    throw error;
  }

  return contract;
}

function updateContractStatus(contractId, status, extra = {}) {
  const contract = getContractById(contractId);

  contracts[contractId] = {
    ...contract,
    status,
    ...extra,
    updatedAt: new Date().toISOString()
  };

  return contracts[contractId];
}

module.exports = {
  getContractById,
  updateContractStatus
};