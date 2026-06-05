require("dotenv").config();
const sapRoutes = require("./routes/sap.routes");
const express = require("express");
const cors = require("cors");

const contractsRoutes = require("./routes/contracts.routes");
const webhooksRoutes = require("./routes/webhooks.routes");
const repositoryRoutes = require("./routes/repository.routes");

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({
    name: "GPC Contract Flow PoC",
    status: "OK"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString()
  });
});

app.use("/contracts", contractsRoutes);
app.use("/webhooks", webhooksRoutes);
app.use("/api", repositoryRoutes);
app.use("/api", sapRoutes);
app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.statusCode || 500).json({
    error: error.message || "Error interno"
  });
});

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`GPC Contract Flow PoC corriendo en puerto ${port}`);
});
