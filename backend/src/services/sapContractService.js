function normalizeDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const sapDateMatch = value.match(/\/Date\((\d+)\)\//);

    if (sapDateMatch) {
      const date = new Date(Number(sapDateMatch[1]));
      return formatDate(date);
    }

    if (/^\d{8}$/.test(value)) {
      return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return formatDate(new Date(value));
    }

    return value;
  }

  if (value instanceof Date) {
    return formatDate(value);
  }

  return String(value);
}

function formatDate(date) {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}

function pick(source, keys, fallback = "") {
  for (const key of keys) {
    if (
      source &&
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== null &&
      source[key] !== undefined &&
      source[key] !== ""
    ) {
      return source[key];
    }
  }

  return fallback;
}

function extractODataEntity(json) {
  if (!json) {
    return {};
  }

  if (json.d) {
    if (Array.isArray(json.d.results)) {
      return json.d.results[0] || {};
    }

    return json.d;
  }

  if (Array.isArray(json.value)) {
    return json.value[0] || {};
  }

  return json;
}

function mapSapContractToTemplateValues(rawContract, requestedContractId) {
  const contractNumber = pick(rawContract, [
    "ContractNumber",
    "ContractNo",
    "ContractId",
    "Contract",
    "contractNumber",
    "contractId",
    "CONTRACT_NUMBER"
  ], requestedContractId);

  const contractorName = pick(rawContract, [
    "ContractorName",
    "SupplierName",
    "VendorName",
    "BusinessPartnerName",
    "PartnerName",
    "Name1",
    "NAME1",
    "CONTRACTOR_NAME"
  ], "");

  const contractorId = pick(rawContract, [
    "ContractorId",
    "SupplierId",
    "Vendor",
    "VendorId",
    "BusinessPartner",
    "BusinessPartnerId",
    "Lifnr",
    "LIFNR",
    "TaxNumber",
    "RNC",
    "CONTRACTOR_ID"
  ], "");

  const contractorAddress = pick(rawContract, [
    "ContractorAddress",
    "Address",
    "FullAddress",
    "Street",
    "Location",
    "CONTRACTOR_ADDRESS"
  ], "");

  const contractorEmail = pick(rawContract, [
    "ContractorEmail",
    "Email",
    "EmailAddress",
    "SmtpAddr",
    "SMTP_ADDR",
    "CONTRACTOR_EMAIL"
  ], "");

  const contractPurpose = pick(rawContract, [
    "ContractPurpose",
    "Purpose",
    "Description",
    "ContractDescription",
    "ShortText",
    "Text",
    "CONTRACT_PURPOSE"
  ], "");

  const amount = pick(rawContract, [
    "ContractAmount",
    "Amount",
    "TotalAmount",
    "NetValue",
    "Value",
    "NET_VALUE",
    "CONTRACT_AMOUNT"
  ], "");

  const currency = pick(rawContract, [
    "ContractCurrency",
    "Currency",
    "Waers",
    "WAERS",
    "CONTRACT_CURRENCY"
  ], "USD");

  const startDate = pick(rawContract, [
    "StartDate",
    "ValidFrom",
    "ValidityStartDate",
    "BeginDate",
    "BEGDA",
    "CONTRACT_START_DATE",
    "START_DATE"
  ], "");

  const endDate = pick(rawContract, [
    "EndDate",
    "ValidTo",
    "ValidityEndDate",
    "FinishDate",
    "ENDDA",
    "CONTRACT_END_DATE",
    "END_DATE"
  ], "");

  return {
    CONTRACT_NUMBER: String(contractNumber || requestedContractId || ""),
    CONTRACTOR_NAME: String(contractorName || ""),
    CONTRACTOR_ID: String(contractorId || ""),
    CONTRACTOR_ADDRESS: String(contractorAddress || ""),
    CONTRACTOR_EMAIL: String(contractorEmail || ""),
    CONTRACT_PURPOSE: String(contractPurpose || ""),
    CONTRACT_AMOUNT: String(amount || ""),
    CONTRACT_CURRENCY: String(currency || "USD"),
    START_DATE: normalizeDate(startDate),
    END_DATE: normalizeDate(endDate)
  };
}

function getMockContract(contractId) {
  const samples = [
    {
      ContractNumber: contractId,
      ContractorName: "Servicios Técnicos del Caribe, S.R.L.",
      ContractorId: "RNC-123456789",
      ContractorAddress: "Av. Principal, Punta Cana, República Dominicana",
      ContractorEmail: "contratista.demo@example.com",
      ContractPurpose: "Prestación de servicios profesionales de mantenimiento preventivo.",
      ContractAmount: "25,000.00",
      ContractCurrency: "USD",
      StartDate: "20260701",
      EndDate: "20261231"
    },
    {
      ContractNumber: contractId,
      ContractorName: "Constructora Atlántica Dominicana, S.A.",
      ContractorId: "RNC-987654321",
      ContractorAddress: "Boulevard Turístico del Este, La Altagracia",
      ContractorEmail: "legal@constructora-demo.com",
      ContractPurpose: "Ejecución de obras menores y adecuaciones de infraestructura.",
      ContractAmount: "180,000.00",
      ContractCurrency: "USD",
      StartDate: "20260815",
      EndDate: "20270215"
    },
    {
      ContractNumber: contractId,
      ContractorName: "Consultores Aeroportuarios Integrados, S.R.L.",
      ContractorId: "RNC-456789123",
      ContractorAddress: "Calle Principal No. 45, Santo Domingo",
      ContractorEmail: "firma@consultores-demo.com",
      ContractPurpose: "Servicios de consultoría técnica, operativa y documental.",
      ContractAmount: "45,500.00",
      ContractCurrency: "USD",
      StartDate: "20260901",
      EndDate: "20270301"
    }
  ];

  const index = Math.abs(String(contractId).split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0)) % samples.length;

  return samples[index];
}

function buildODataUrl(contractId) {
  const baseUrl = process.env.SAP_ODATA_BASE_URL;

  if (!baseUrl) {
    return null;
  }

  const entityPath =
    process.env.SAP_ODATA_CONTRACT_PATH ||
    "/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet";

  const escapedContractId = String(contractId).replace(/'/g, "''");
  const fullEntityPath = `${entityPath}('${escapedContractId}')`;

  const url = new URL(fullEntityPath, baseUrl);
  url.searchParams.set("$format", "json");

  return url.toString();
}

async function fetchSapODataContract(contractId) {
  const url = buildODataUrl(contractId);

  if (!url) {
    const error = new Error("SAP_ODATA_BASE_URL no está configurado");
    error.code = "SAP_ODATA_NOT_CONFIGURED";
    throw error;
  }

  const headers = {
    Accept: "application/json"
  };

  if (process.env.SAP_ODATA_USERNAME && process.env.SAP_ODATA_PASSWORD) {
    const token = Buffer
      .from(`${process.env.SAP_ODATA_USERNAME}:${process.env.SAP_ODATA_PASSWORD}`)
      .toString("base64");

    headers.Authorization = `Basic ${token}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`SAP OData respondió ${response.status}: ${text}`);
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

async function getContractData(contractId, options = {}) {
  const forceMock =
    options.forceMock ||
    process.env.SAP_ODATA_FORCE_MOCK === "true";

  if (!contractId) {
    const error = new Error("Falta contractId");
    error.statusCode = 400;
    throw error;
  }

  if (forceMock) {
    const rawMock = getMockContract(contractId);

    return {
      contractId,
      source: "MOCK",
      fallback: true,
      reason: "Mock forzado",
      raw: rawMock,
      values: mapSapContractToTemplateValues(rawMock, contractId)
    };
  }

  try {
    const rawResponse = await fetchSapODataContract(contractId);
    const rawContract = extractODataEntity(rawResponse);

    return {
      contractId,
      source: "SAP_ODATA",
      fallback: false,
      raw: rawContract,
      values: mapSapContractToTemplateValues(rawContract, contractId)
    };
  } catch (error) {
    const rawMock = getMockContract(contractId);

    return {
      contractId,
      source: "MOCK",
      fallback: true,
      reason: error.message,
      raw: rawMock,
      values: mapSapContractToTemplateValues(rawMock, contractId)
    };
  }
}

module.exports = {
  getContractData
};
