const TEMPLATE_STATUSES = [
  "DRAFT",
  "SENT_FOR_APPROVAL",
  "APPROVED",
  "RELEASED",
  "EXPIRED",
  "REPLACED",
  "ARCHIVED"
];

const STATUS_ALIASES = {
  BORRADOR: "DRAFT",
  DRAFT: "DRAFT",
  SENTFORAPPROVAL: "SENT_FOR_APPROVAL",
  SENT_FOR_APPROVAL: "SENT_FOR_APPROVAL",
  ENAPROBACION: "SENT_FOR_APPROVAL",
  APPROVED: "APPROVED",
  APROBADO: "APPROVED",
  RELEASED: "RELEASED",
  LIBERADO: "RELEASED",
  EXPIRED: "EXPIRED",
  EXPIRADO: "EXPIRED",
  REPLACED: "REPLACED",
  REEMPLAZADO: "REPLACED",
  ARCHIVED: "ARCHIVED",
  ARCHIVADO: "ARCHIVED"
};

const ACTIONS_BY_STATUS = {
  DRAFT: ["SEND_FOR_APPROVAL", "APPROVE_AND_RELEASE", "ARCHIVE"],
  SENT_FOR_APPROVAL: ["APPROVE", "REOPEN"],
  APPROVED: ["RELEASE", "REOPEN"],
  RELEASED: ["CREATE_NEW_VERSION", "ARCHIVE"],
  EXPIRED: ["CREATE_NEW_VERSION", "ARCHIVE"],
  REPLACED: ["RESTORE"],
  ARCHIVED: ["REOPEN"]
};

const STATUS_STATE = {
  DRAFT: "Warning",
  SENT_FOR_APPROVAL: "Information",
  APPROVED: "Success",
  RELEASED: "Success",
  EXPIRED: "Error",
  REPLACED: "Information",
  ARCHIVED: "None"
};

function normalizeTemplateStatus(status) {
  const normalized = String(status || "DRAFT")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");

  return STATUS_ALIASES[normalized] || "DRAFT";
}

function getAvailableTemplateActions(status) {
  const normalizedStatus = normalizeTemplateStatus(status);
  return ACTIONS_BY_STATUS[normalizedStatus] || [];
}

function getTemplateStatusState(status) {
  const normalizedStatus = normalizeTemplateStatus(status);
  return STATUS_STATE[normalizedStatus] || "None";
}

function isValidTemplateStatus(status) {
  return TEMPLATE_STATUSES.includes(normalizeTemplateStatus(status));
}

function assertTemplateActionAllowed(status, action) {
  const normalizedAction = String(action || "").trim().toUpperCase();
  const availableActions = getAvailableTemplateActions(status);

  if (!availableActions.includes(normalizedAction)) {
    const error = new Error(`Acción no permitida para estado ${normalizeTemplateStatus(status)}: ${normalizedAction}`);
    error.statusCode = 400;
    throw error;
  }

  return normalizedAction;
}

module.exports = {
  TEMPLATE_STATUSES,
  normalizeTemplateStatus,
  getAvailableTemplateActions,
  getTemplateStatusState,
  isValidTemplateStatus,
  assertTemplateActionAllowed
};
