const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_TIMEOUT_MS = Number(process.env.PDF_CONVERSION_TIMEOUT_MS || 60000);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function runConverter(binary, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      const error = new Error(`La conversión DOCX a PDF excedió el tiempo máximo (${timeoutMs} ms).`);
      error.code = "PDF_CONVERSION_TIMEOUT";
      reject(error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`LibreOffice terminó con código ${code}: ${stderr || stdout || "sin detalle"}`);
      error.code = "PDF_CONVERSION_FAILED";
      reject(error);
    });
  });
}

function getCandidateBinaries() {
  if (process.env.LIBREOFFICE_BIN) {
    return [process.env.LIBREOFFICE_BIN];
  }

  return ["soffice", "libreoffice"];
}

async function convertDocxToPdf({ docxPath, outputDir, outputFileName, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!docxPath || !outputDir || !outputFileName) {
    const error = new Error("Faltan parámetros para convertir DOCX a PDF.");
    error.code = "PDF_CONVERSION_INVALID_INPUT";
    throw error;
  }

  if (!fs.existsSync(docxPath)) {
    const error = new Error(`No existe el DOCX generado para convertir a PDF: ${docxPath}`);
    error.code = "PDF_CONVERSION_INPUT_NOT_FOUND";
    throw error;
  }

  ensureDir(outputDir);

  const expectedLibreOfficeOutput = path.join(
    outputDir,
    path.basename(docxPath, path.extname(docxPath)) + ".pdf"
  );
  const finalOutputPath = path.join(outputDir, outputFileName);
  const args = ["--headless", "--convert-to", "pdf", "--outdir", outputDir, docxPath];
  const unavailableErrors = [];

  for (const binary of getCandidateBinaries()) {
    try {
      await runConverter(binary, args, timeoutMs);

      if (!fs.existsSync(expectedLibreOfficeOutput)) {
        const error = new Error("LibreOffice no produjo el archivo PDF esperado.");
        error.code = "PDF_CONVERSION_OUTPUT_NOT_FOUND";
        throw error;
      }

      if (expectedLibreOfficeOutput !== finalOutputPath) {
        if (fs.existsSync(finalOutputPath)) {
          fs.unlinkSync(finalOutputPath);
        }
        fs.renameSync(expectedLibreOfficeOutput, finalOutputPath);
      }

      return {
        fileName: outputFileName,
        absolutePath: finalOutputPath,
        extension: ".pdf",
        converter: binary
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        unavailableErrors.push(binary);
        continue;
      }
      throw error;
    }
  }

  const error = new Error(
    "El DOCX fue generado correctamente, pero no se pudo convertir a PDF. Configure LibreOffice/headless converter para generar el documento final de firma."
  );
  error.code = "PDF_CONVERSION_UNAVAILABLE";
  error.details = `No se encontró binario LibreOffice (${unavailableErrors.join(", ") || "sin candidatos"}).`;
  throw error;
}

module.exports = {
  convertDocxToPdf
};
