const express = require("express");
const router = express.Router();

const {
  getContractData
} = require("../services/sapContractService");

router.get("/sap/contracts/:contractId", async (req, res, next) => {
  try {
    const result = await getContractData(req.params.contractId, {
      forceMock: req.query.mock === "true"
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

function buildSapDebugHeaders() {
  const headers = {
    Accept: "application/json, application/xml, text/xml, text/html, */*"
  };

  if (process.env.SAP_ODATA_USERNAME && process.env.SAP_ODATA_PASSWORD) {
    const token = Buffer
      .from(`${process.env.SAP_ODATA_USERNAME}:${process.env.SAP_ODATA_PASSWORD}`)
      .toString("base64");

    headers.Authorization = `Basic ${token}`;
  }

  return headers;
}

function buildSapDebugUrl(path) {
  const baseUrl = process.env.SAP_ODATA_BASE_URL || "http://localhost:8080";
  const url = new URL(path, baseUrl);

  if (process.env.SAP_CLIENT) {
    url.searchParams.set("sap-client", process.env.SAP_CLIENT);
  }

  return url.toString();
}

async function proxySapDebugRequest(path) {
  const url = buildSapDebugUrl(path);

  const response = await fetch(url, {
    method: "GET",
    headers: buildSapDebugHeaders()
  });

  const contentType = response.headers.get("content-type") || "text/plain";
  const body = await response.text();

  return {
    status: response.status,
    contentType,
    body
  };
}

router.get("/sap/debug/root", async (req, res, next) => {
  try {
    const result = await proxySapDebugRequest(
      "/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/"
    );

    res.status(result.status);
    res.setHeader("Content-Type", result.contentType);
    res.send(result.body);
  } catch (error) {
    next(error);
  }
});

router.get("/sap/debug/metadata", async (req, res, next) => {
  try {
    const result = await proxySapDebugRequest(
      "/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/$metadata"
    );

    res.status(result.status);
    res.setHeader("Content-Type", result.contentType);
    res.send(result.body);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
