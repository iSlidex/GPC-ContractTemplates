# GPC Contract Management PoC

PoC funcional para gestion y ensamblaje de contratos de Grupo Punta Cana. El prototipo combina un frontend SAPUI5/Fiori freestyle con un backend Node/Express para seleccionar plantillas, completar variables desde SAP o mock, generar documentos DOCX/PDF y administrar un repositorio local de plantillas, clausulas y versiones.

## Alcance actual

- Listado de plantillas DOCX/HTML desde un repositorio local.
- Extraccion de variables `{VARIABLE}` desde plantillas.
- Consulta de datos de contrato via SAP OData con fallback mock.
- Autocompletado de formulario dinamico y generacion de DOCX/PDF.
- Navegacion de repositorio local, preview, descarga y edicion HTML.
- Biblioteca simple de clausulas HTML insertables en el editor.
- Guardado de nuevas versiones HTML y exportacion de versiones Word.

No es todavia un reemplazo productivo de SAP Enterprise Contract Assembly (ECA). Es una PoC para validar flujos, integraciones y experiencia operativa.

## Arquitectura

- `frontend/`: aplicacion SAPUI5/Fiori freestyle con modelos JSON simples. Consume `/api/*` y `/health`.
- `backend/`: API Node.js + Express. Lee plantillas, extrae variables, genera documentos, sirve previews y consulta SAP OData.
- Repositorio local: `backend/repository/` contiene `templates/`, `clauses/` y carpetas de salida como `generated/`, `signed/` y `evidence/`.
- SAP OData: el backend puede llamar a una Destination/proxy local de BAS o a una URL OData directa. Si SAP no esta configurado, responde error, devuelve login HTML/SAML o falla, el backend usa mock como mecanismo de resiliencia.

## Estructura del repositorio

```text
.
|-- backend/
|   |-- src/
|   |   |-- routes/
|   |   |-- services/
|   |   `-- data/
|   |-- repository/
|   |   |-- templates/
|   |   |-- clauses/
|   |   `-- generated/        # generado localmente, no commitear
|   |-- templates/
|   `-- package.json
|-- frontend/
|   |-- webapp/
|   |-- ui5.yaml
|   |-- ui5-local.yaml
|   |-- ui5-local-nosap.yaml
|   `-- package.json
|-- .env.example
|-- AGENTS.md
|-- README.md
`-- package.json
```

## Flujo funcional de demo

1. Levantar backend y frontend.
2. Abrir la app SAPUI5.
3. Seleccionar una plantilla del repositorio.
4. Ver variables requeridas.
5. Consultar un Contract ID en SAP OData o mock.
6. Autocompletar el formulario dinamico.
7. Generar DOCX/PDF.
8. Revisar el repositorio de archivos.
9. Previsualizar o descargar documentos.
10. Editar la representacion HTML, insertar clausulas y guardar nuevas versiones HTML o Word.

## Endpoints principales

- `GET /health`
- `GET /api/templates`
- `GET /api/templates/:templateId/variables`
- `POST /api/templates/:templateId/generate`
- `GET /api/repository`
- `GET /api/files/download?path=...`
- `GET /api/files/inline?path=...`
- `GET /api/files/preview/docx?path=...`
- `GET /api/files/preview/text?path=...`
- `GET /api/files/edit/html?path=...`
- `POST /api/files/edit/html-version`
- `POST /api/files/edit/docx-version`
- `GET /api/clauses`
- `GET /api/clauses/:clauseId`
- `GET /api/sap/contracts/:contractId`
- Legado/demo backend: `GET /contracts/:contractId`, `POST /contracts/:contractId/generate`, `GET /contracts/:contractId/document`, `POST /contracts/:contractId/generate-pdf`, `GET /contracts/:contractId/pdf`, `POST /webhooks/viafirma`.

## Variables de entorno

Crear un `.env` local desde `.env.example`. No commitear credenciales reales.

```env
PORT=4000
WEBHOOK_SECRET=replace-with-local-secret
SAP_ODATA_FORCE_MOCK=true
SAP_ODATA_BASE_URL=http://localhost:8080
SAP_ODATA_CONTRACT_PATH=/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet
SAP_ODATA_LOOKUP_MODE=shortKey
SAP_ODATA_RESPONSE_FORMAT=xml
SAP_CLIENT=000
SAP_ODATA_USERNAME=your-sap-user
SAP_ODATA_PASSWORD=your-sap-password
```

Notas:

- `SAP_ODATA_FORCE_MOCK=true` evita llamadas SAP y usa datos mock.
- `SAP_ODATA_LOOKUP_MODE=shortKey` construye rutas como `/contractSet('900000000001')`.
- `SAP_ODATA_RESPONSE_FORMAT` soporta `json` y `xml`. En `json` se agrega `$format=json`; en `xml` se usa `Accept: application/atom+xml, application/xml, text/xml, */*` sin forzar `$format`.
- `SAP_CLIENT` se envia como query parameter `sap-client` cuando esta definido.

## Comandos de desarrollo

Instalar dependencias:

```bash
npm run install:all
```

Backend:

```bash
npm run backend:dev
# equivalente:
cd backend && npm run dev
```

Frontend con proxy local hacia backend:

```bash
npm run frontend:dev
# equivalente:
cd frontend && npx ui5 serve --config ./ui5-local.yaml --port 8080 --accept-remote-connections
```

Frontend sin proxy SAP:

```bash
npm run frontend:dev:nosap
# equivalente:
cd frontend && npx ui5 serve --config ./ui5-local-nosap.yaml --port 8080 --accept-remote-connections
```

Para trabajar sin SAP, levantar el backend con `SAP_ODATA_FORCE_MOCK=true`. `ui5-local-nosap.yaml` solo proxya `/api` y `/health`; `ui5-local.yaml` tambien proxya `/sap` hacia la Destination `GPC_SAP_ODATA` o el nombre que se configure en BAS/BTP.

## Estado actual de integracion SAP

- Cloud Connector/Destination se considera alcanzable desde BAS cuando el proxy local UI5 esta levantado en `localhost:8080`.
- El backend esta preparado para consultar SAP OData usando `SAP_ODATA_BASE_URL`.
- Para probar SAP real localmente: levantar `frontend/ui5-local.yaml`, configurar `SAP_ODATA_BASE_URL=http://localhost:8080` en backend y consultar `GET /api/sap/contracts/900000000001`.
- El endpoint probado por ABAP se documenta como `/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet('900000000001')`.
- El modo recomendado es `SAP_ODATA_LOOKUP_MODE=shortKey`.
- El backend soporta respuesta JSON y XML/Atom basica mediante `SAP_ODATA_RESPONSE_FORMAT`.
- El fallback mock permanece activo si SAP no responde o si se fuerza con `SAP_ODATA_FORCE_MOCK=true`.

## Alineacion con SAP Enterprise Contract Assembly

Cubierto en la PoC:

- Gestion basica de plantillas en repositorio local.
- Metadatos ligeros de plantillas en `GET /api/templates`: `contentType`, `categories`, `governingLaw`, `language`, `description`, `validFrom`, `validTo`, `owner`, `revision`, `replacedBy` y `availableActions`.
- Estados normalizados de plantillas: `DRAFT`, `SENT_FOR_APPROVAL`, `APPROVED`, `RELEASED`, `EXPIRED`, `REPLACED`, `ARCHIVED`.
- Variables/input fields por marcadores `{VARIABLE}`.
- Autollenado desde SAP/mock.
- Biblioteca simple de clausulas.
- Generacion/exportacion DOCX y PDF.
- Nueva version HTML/Word desde el editor.

Parcialmente cubierto:

- Metadatos de plantillas inferidos por nombre de archivo y enriquecibles con sidecar JSON.
- Metadatos de clausulas inferidos por nombre de archivo.
- Versionado basado en convencion `v001`, `v002`, `v003`.
- Estados simples en nombres de archivo, como `BORRADOR` y `APROBADO`, normalizados al modelo ECA ligero.
- Acciones de lifecycle calculadas por backend en `availableActions`, aun sin endpoints de transicion.
- Insercion manual de clausulas en documentos.
- Preview y edicion HTML como aproximacion a documentos virtuales.

Backlog funcional frente a ECA:

- Persistir y administrar metadatos enriquecidos desde UI.
- Endpoints reales para acciones de ciclo de vida y aprobacion/release.
- Historial formal de versiones y marcado de versiones reemplazadas.
- Aprobacion/release antes de uso productivo.
- Text Block Library avanzada con clases Clause y Signature Block.
- Versiones, variantes y estados de text blocks.
- Edicion centralizada de text blocks.
- Template rules y text block rules.
- Condiciones If / Else If / Else con expresiones y acciones.
- Alternativas con risk level: Low, Medium, High, Very High.
- Estado de documento virtual y refresh document.

## Backlog sugerido

- Metadata formal para clausulas: title, type, class, categories, governingLaw, language, description, validity, owner, version y status.
- Diferenciar text elements entre Input Fields de usuario y Variables autocompletadas desde SAP/mock.
- Template rules y text block rules: `canRemove`, `fixedPosition`.
- Conditions con expresiones y acciones de insertar, reemplazar o remover bloques.
- Alternatives por text block con risk level `LOW`, `MEDIUM`, `HIGH`, `VERY_HIGH`.
- Virtual documents con estados `PENDING`, `ERROR`, `COMPLETED`, `FINAL` y accion Refresh Document.
- Persistencia real para metadatos, documentos y auditoria.
- Seguridad/autorizacion por rol.
- Sanitizacion y redaccion de logs sensibles.
- Mejoras del editor rich text y conversion HTML/DOCX.
- Tests automatizados para servicios backend y flujos frontend criticos.
- Validacion de variables obligatorias y tipos de datos.
- Separar configuracion local BAS, mock y ambientes desplegados.
- Manejo mas robusto de Atom/XML segun metadata real del servicio OData.

## Metadata de plantillas

Cada plantilla puede funcionar solo con metadata derivada del nombre:

```text
TPL_<categoria>_<tipoContrato>_<version>_<estado>.docx
```

Opcionalmente se puede agregar un sidecar JSON junto al archivo de plantilla:

```text
TPL_SERVICIOS_ContratoServiciosProfesionales_v003_BORRADOR.metadata.json
```

Campos soportados por ahora:

```json
{
  "name": "Contrato de Servicios Profesionales",
  "contentType": "DOCX",
  "categories": ["SERVICIOS"],
  "governingLaw": "DO",
  "language": "es",
  "description": "Plantilla base para servicios profesionales.",
  "validFrom": "2026-01-01",
  "validTo": "2026-12-31",
  "owner": "GPC Legal",
  "status": "DRAFT",
  "replacedBy": null
}
```

## Troubleshooting

- `npx fiori run` puede fallar silenciosamente en BAS. Usar `npx ui5 serve --config ./ui5-local.yaml --port 8080 --accept-remote-connections`.
- El proxy local usa `localhost:8080`; mantenerlo levantado cuando el backend apunte a esa URL como `SAP_ODATA_BASE_URL`.
- Si SAP devuelve HTML de login/SAML o 401, revisar Destination, autenticacion y Cloud Connector. No registrar credenciales en logs.
- Si aparece 404/501 OData, validar `SAP_ODATA_CONTRACT_PATH`, `SAP_ODATA_LOOKUP_MODE` y si el servicio soporta short key o requiere otro patron.
- Si SAP no responde, validar que el fallback mock devuelva datos con `GET /api/sap/contracts/900000000001?mock=true`.
- Si el frontend no conecta, probar `GET http://localhost:4000/health` y confirmar que `ui5-local.yaml` proxie `/api` y `/health`.

## Seguridad

- No commitear `.env`, `default-env.json` ni credenciales.
- No exponer Basic Auth en codigo, logs ni documentacion.
- Sanitizar logs de payloads y errores antes de usar datos reales.
- No subir documentos sensibles, PDFs generados, evidencia de firma ni outputs locales.
- Usar placeholders seguros en ejemplos.
