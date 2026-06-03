const express = require("express");
const router = express.Router();

const {
  updateContractStatus
} = require("../services/contractService");

router.post("/viafirma", async (req, res, next) => {
  try {
    const receivedSecret = req.header("X-Api-Key");
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (expectedSecret && receivedSecret !== expectedSecret) {
      return res.status(401).json({
        error: "Webhook no autorizado"
      });
    }

    const payload = req.body;

    console.log("Webhook Viafirma recibido:");
    console.log(JSON.stringify(payload, null, 2));

    const contractId = payload.externalCode || payload.contractNumber;
    const status = payload.status || "RESPONSED";

    if (!contractId) {
      return res.status(400).json({
        error: "No se recibió externalCode / contractNumber"
      });
    }

    let mappedStatus = "SIGNATURE_STATUS_UPDATED";

    if (status === "RESPONSED" || status === "SIGNED") {
      mappedStatus = "SIGNED";
    }

    if (status === "REJECTED") {
      mappedStatus = "REJECTED";
    }

    if (status === "ERROR") {
      mappedStatus = "SIGNATURE_ERROR";
    }

    if (status === "EXPIRED") {
      mappedStatus = "EXPIRED";
    }

    const updatedContract = updateContractStatus(contractId, mappedStatus, {
      viafirmaStatus: status,
      viafirmaLastCallback: payload
    });

    res.json({
      received: true,
      contract: updatedContract
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;