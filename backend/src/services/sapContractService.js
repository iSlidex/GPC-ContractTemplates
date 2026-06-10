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
function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    return String(value);
  }

  let text = String(value)
    .trim()
    .replace(/[^\d.,-]/g, "");

  if (!text) {
    return "";
  }

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // Formato europeo: 180.000,00 -> 180000.00
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 180,000.00 -> 180000.00
      text = text.replace(/,/g, "");
    }

    return text;
  }

  if (lastComma !== -1) {
    const decimals = text.length - lastComma - 1;

    if (decimals === 2) {
      // 180000,00 -> 180000.00
      return text.replace(",", ".");
    }

    // 180,000 -> 180000
    return text.replace(/,/g, "");
  }

  return text;
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

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractODataXmlEntity(xml) {
  const entity = {};
  const propertyRegex = /<d:([A-Za-z0-9_]+)(?:\s[^>]*)?>([\s\S]*?)<\/d:\1>/g;
  let match;

  while ((match = propertyRegex.exec(xml)) !== null) {
    entity[match[1]] = decodeXmlEntities(match[2].replace(/<[^>]+>/g, "").trim());
  }

  return entity;
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
    "ContractorID",
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
    CONTRACT_AMOUNT: normalizeAmount(amount),
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
      ContractAmount: "180000.00",
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
      ContractAmount: "45500.00",
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

function buildODataEntityPath(contractId) {
  const entityPath =
    process.env.SAP_ODATA_CONTRACT_PATH ||
    "/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet";

  const keyName = process.env.SAP_ODATA_KEY_NAME || "ContractNumber";
  const escapedContractId = String(contractId).replace(/'/g, "''");

  return `${entityPath}(${keyName}='${escapedContractId}')`;
}

function buildODataCollectionPath() {
  return (
    process.env.SAP_ODATA_CONTRACT_PATH ||
    "/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet"
  );
}

function buildODataEntityPath(contractId) {
  const entityPath = buildODataCollectionPath();
  const keyName = process.env.SAP_ODATA_KEY_NAME || "ContractNumber";
  const escapedContractId = String(contractId).replace(/'/g, "''");

  return `${entityPath}(${keyName}='${escapedContractId}')`;
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
  const lookupMode = process.env.SAP_ODATA_LOOKUP_MODE || "shortKey";
  const fullEntityPath = ["filter", "pathOnly"].includes(lookupMode)
    ? entityPath.replace(/\/$/, "")
    : `${entityPath}('${escapedContractId}')`;

  const url = new URL(fullEntityPath, baseUrl);

  if (lookupMode === "filter") {
    url.searchParams.set("$filter", `ContractNumber eq '${escapedContractId}'`);
  }

  const responseFormat = process.env.SAP_ODATA_RESPONSE_FORMAT || "json";

  if (responseFormat === "json") {
    url.searchParams.set("$format", "json");
  }

  if (process.env.SAP_CLIENT) {
    url.searchParams.set("sap-client", process.env.SAP_CLIENT);
  }

  return url.toString();
}
function decodeXml(value) {
  return String(value || "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function getXmlTagValue(xml, tagName) {
  const regex = new RegExp(`<d:${tagName}[^>]*>([\\s\\S]*?)<\\/d:${tagName}>`, "i");
  const match = String(xml || "").match(regex);

  return match ? decodeXml(match[1].trim()) : "";
}

function parseSapAtomXmlContract(xml) {
  const rawContract = {
    ContractNumber: getXmlTagValue(xml, "ContractNumber"),
    ContractorID: getXmlTagValue(xml, "ContractorID"),
    ContractorName: getXmlTagValue(xml, "ContractorName"),
    ContractorEmail: getXmlTagValue(xml, "ContractorEmail"),
    ContractorAddress: getXmlTagValue(xml, "ContractorAddress"),
    ContractAmount: getXmlTagValue(xml, "ContractAmount"),
    ContractCurrency: getXmlTagValue(xml, "ContractCurrency"),
    ContractPurpose: getXmlTagValue(xml, "ContractPurpose"),
    StartDate: getXmlTagValue(xml, "StartDate"),
    EndDate: getXmlTagValue(xml, "EndDate")
  };

  return {
    d: rawContract
  };
}
async function fetchSapODataContract(contractId) {
  const destinationName = process.env.SAP_ODATA_DESTINATION_NAME;
  const lookupMode = process.env.SAP_ODATA_LOOKUP_MODE || "key";
  const keyName = process.env.SAP_ODATA_KEY_NAME || "ContractNumber";
  const escapedContractId = String(contractId).replace(/'/g, "''");

  if (destinationName) {
    const path =
      lookupMode === "filter"
        ? buildODataCollectionPath()
        : buildODataEntityPath(contractId);

    const params = {
      "$format": "json"
    };

    if (lookupMode === "filter") {
      params["$filter"] = `${keyName} eq '${escapedContractId}'`;
      params["$top"] = "1";
    }

    if (process.env.SAP_CLIENT) {
      params["sap-client"] = process.env.SAP_CLIENT;
    }

    const requestInfo = [
      "Request vía Destination:",
      `Destination: ${destinationName}`,
      `Method: GET`,
      `Path: ${path}`,
      `Params: ${JSON.stringify(params)}`
    ].join("\n");

    console.log("[SAP OData] Destination request:\n" + requestInfo);

    try {
      const response = await executeHttpRequest(
        {
          destinationName
        },
        {
          method: "GET",
          url: path,
          params,
          headers: {
            Accept: "application/json"
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      const responseStatus = error.response && error.response.status;
      const responseData = error.response && error.response.data;

      const enrichedError = new Error(
        [
          requestInfo,
          "",
          "Error:",
          responseStatus ? `Status: ${responseStatus}` : "",
          responseData ? `Body: ${JSON.stringify(responseData)}` : error.message
        ]
          .filter(Boolean)
          .join("\n")
      );

      enrichedError.statusCode = responseStatus || error.statusCode;
      throw enrichedError;
    }
  }

  const url = buildODataUrl(contractId);

  if (!url) {
    const error = new Error(
      "SAP_ODATA_BASE_URL no está configurado y SAP_ODATA_DESTINATION_NAME tampoco"
    );
    error.code = "SAP_ODATA_NOT_CONFIGURED";
    throw error;
  }

  const responseFormat = process.env.SAP_ODATA_RESPONSE_FORMAT || "json";

  const headers = {
    Accept: responseFormat === "xml"
      ? "application/atom+xml, application/xml, text/xml, */*"
      : "application/json"
  };

  if (process.env.SAP_ODATA_USERNAME && process.env.SAP_ODATA_PASSWORD) {
    const token = Buffer
      .from(`${process.env.SAP_ODATA_USERNAME}:${process.env.SAP_ODATA_PASSWORD}`)
      .toString("base64");

    headers.Authorization = `Basic ${token}`;
  }

  const requestInfo = [
    "Request directo/proxy:",
    `Method: GET`,
    `URL: ${url}`,
    "Headers:",
    `Accept: ${headers.Accept}`,
    headers.Authorization ? "Authorization: Basic ***" : "Authorization: <none>"
  ].join("\n");

  console.log("[SAP OData] Request:\n" + requestInfo);

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10000)
  });

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    const error = new Error(
      [
        requestInfo,
        "",
        "Response:",
        `Status: ${response.status} ${response.statusText}`,
        `Content-Type: ${contentType}`,
        "",
        "Body:",
        responseText.slice(0, 2500)
      ].join("\n")
    );

    error.statusCode = response.status;
    throw error;
  }

  if (responseFormat === "xml") {
    return {
      __format: "xml",
      rawXml: await response.text()
    };
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
    const rawContract = rawResponse && rawResponse.__format === "xml"
      ? extractODataXmlEntity(rawResponse.rawXml)
      : extractODataEntity(rawResponse);

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
