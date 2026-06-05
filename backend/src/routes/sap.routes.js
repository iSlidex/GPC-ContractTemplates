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

module.exports = router;
