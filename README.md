# GPC Contract Management MVP interno

MVP interno / prototipo funcional para gestion y ensamblaje de contratos de Grupo Punta Cana. El prototipo combina un frontend SAPUI5/Fiori freestyle con un backend Node/Express para seleccionar plantillas, completar variables desde SAP o mock, generar documentos DOCX/PDF y administrar un repositorio local de plantillas, clausulas y versiones.

## Alcance actual

- Listado de plantillas DOCX/HTML desde un repositorio local.
- Extraccion de variables `{VARIABLE}` desde plantillas.
- Consulta de datos de contrato via SAP OData con fallback mock.
- Autocompletado de formulario dinamico y generacion de DOCX/PDF.
- Navegacion de repositorio local, preview, descarga y edicion HTML.
- Biblioteca simple de clausulas HTML insertables en el editor.
- Guardado de nuevas versiones HTML y exportacion de versiones Word.

No es todavia un reemplazo productivo de SAP Enterprise Contract Assembly (ECA). Es un prototipo funcional para validar flujos, integraciones y experiencia operativa de MVP interno.

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


## UI tipo SAP ECM/ECA y flujo documental

La pantalla principal se organiza en tabs SAPUI5 para acercar la experiencia al modelo SAP ECM/ECA sin copiar HTML plano del mockup de referencia:

1. **Información general**: contexto de la transacción legal, categoría, Contract ID, estado, responsable y perfil simulado.
2. **Documentos**: tab principal con tabla de documentos generados/relevantes del repositorio, acciones de preview, descarga, edición RichText y acceso a detalle.
3. **Plantillas**: catálogo filtrable con metadata, estado, versión, owner, ley aplicable, idioma y acciones existentes de variables, propiedades/lifecycle y uso de plantilla.
4. **Cláusulas**: biblioteca de text blocks con filtros y acceso al gestor actual de lifecycle/versiones/variantes.
5. **Documento virtual**: estado, mensajes, variables SAP e input fields del último documento generado o refrescado. El refresh recalcula metadata/valores SAP/mock, pero todavía no regenera DOCX/PDF.
6. **Repositorio**: árbol local actual para preview, descarga y edición.

El botón **Crear documento** ofrece las acciones **Cargar archivo** (placeholder visual para iteración posterior) y **Crear a partir de plantilla**. El flujo de plantilla abre un diálogo con contexto/categoría/perfil autocompletados, buscador, plantillas recomendadas y reutiliza el formulario dinámico existente para consultar SAP/mock y generar DOCX/PDF.

## Modelo de contexto, categoria y perfil simulado

El frontend crea un modelo JSON local en `app>/appContext` con valores por defecto:

```json
{
  "legalTransactionId": "1000000016",
  "legalTransactionName": "CONTRATO DE ARRENDAMIENTO",
  "context": "Arrendamiento",
  "category": "",
  "profile": "LEGAL_USER",
  "roles": ["LEGAL_USER"],
  "roleFiltersEnabled": true
}
```

La app esta preparada para recibir datos de un paso anterior mediante query params:

```text
?contractId=1000000016&context=Arrendamiento&category=Arrendamiento%20de%20inmuebles&profile=LEGAL_USER
```

Roles/perfiles simulados actuales:

- `LEGAL_ADMIN`: ve todas las plantillas.
- `LEGAL_USER`: ve plantillas no archivadas.
- `BUSINESS_USER`: ve preferiblemente plantillas `RELEASED` o `APPROVED`.
- `VIEWER`: ve solo plantillas `RELEASED`.

Pendiente para roles reales: autenticacion, autorizacion centralizada, usuarios reales, asignacion de perfiles desde IdP/SAP y auditoria de decisiones de filtrado.

## Query params de filtros backend

`GET /api/templates` acepta filtros opcionales sin romper llamadas existentes:

```text
/api/templates?context=Arrendamiento&category=Arrendamiento%20de%20inmuebles&profile=LEGAL_USER&status=RELEASED&language=es&governingLaw=DO&contentType=DOCX&q=arrendamiento
```

`GET /api/clauses` acepta filtros opcionales:

```text
/api/clauses?category=SERVICIOS&status=APPROVED&language=es&governingLaw=DO&type=CLAUSE&q=terminacion
```

Los filtros son tolerantes: comparan texto en metadata derivada/sidecar y mantienen compatibilidad cuando no se envian parametros.

## Endpoints principales

- `GET /health`
- `GET /api/templates`
- `GET /api/templates/:templateId`
- `GET /api/templates/:templateId/variables`
- `PATCH /api/templates/:templateId/metadata`
- `POST /api/templates/:templateId/actions/:action`
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
- `PATCH /api/clauses/:clauseId/metadata`
- `POST /api/clauses/:clauseId/actions/:action`
- `POST /api/clauses/:clauseId/version`
- `POST /api/clauses/:clauseId/variant`
- `GET /api/sap/contracts/:contractId`
- `POST /api/virtual-documents/refresh`
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

Para trabajar sin SAP, levantar el backend con `SAP_ODATA_FORCE_MOCK=true`. `ui5-local-nosap.yaml` solo proxya `/api` y `/health`; `ui5-local.yaml` tambien proxya `/sap` hacia la Destination `GPC_CLM_CONTRACT_ODATA`.

## Estado actual de integracion SAP

- Cloud Connector/Destination se considera alcanzable desde BAS cuando el proxy local UI5 esta levantado en `localhost:8080`.
- Destination elegida para el prototipo funcional: `GPC_CLM_CONTRACT_ODATA`.
- El backend esta preparado para consultar SAP OData usando `SAP_ODATA_BASE_URL`.
- Para probar SAP real localmente: levantar `frontend/ui5-local.yaml`, configurar `SAP_ODATA_BASE_URL=http://localhost:8080` en backend y consultar `GET /api/sap/contracts/900000000001`.
- El endpoint probado por ABAP se documenta como `/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet('900000000001')`.
- El modo recomendado es `SAP_ODATA_LOOKUP_MODE=shortKey`.
- El backend soporta respuesta JSON y XML/Atom basica mediante `SAP_ODATA_RESPONSE_FORMAT`.
- El fallback mock permanece activo si SAP no responde o si se fuerza con `SAP_ODATA_FORCE_MOCK=true`.

## Alineacion con SAP Enterprise Contract Assembly

Cubierto en el MVP interno / prototipo funcional:

- Gestion basica de plantillas en repositorio local.
- Metadatos ligeros de plantillas en `GET /api/templates`: `contentType`, `categories`, `governingLaw`, `language`, `description`, `validFrom`, `validTo`, `owner`, `revision`, `replacedBy` y `availableActions`.
- Estados normalizados de plantillas: `DRAFT`, `SENT_FOR_APPROVAL`, `APPROVED`, `RELEASED`, `EXPIRED`, `REPLACED`, `ARCHIVED`.
- Acciones reales de lifecycle para plantillas: enviar a aprobacion, aprobar, liberar, aprobar+liberar, reabrir, archivar, crear nueva version y restaurar.
- Text Block Library ligera con metadata, estados, acciones, versionado y variantes para clausulas HTML.
- Separacion de text elements en `SAP_VARIABLE`/`VARIABLE` e `USER_INPUT`/`INPUT_FIELD`.
- Metadata de documento virtual en generacion: estado, mensajes, input fields, variables y refresh SAP/mock sin regenerar DOCX/PDF.
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
- Aprobacion/release existe como sidecar local; todavia no hay usuarios, roles ni workflow real.
- Insercion manual de clausulas en documentos.
- Preview y edicion HTML como aproximacion a documentos virtuales.
- Refresh Document actualiza valores y estado, pero no regenera automaticamente el DOCX/PDF.

Backlog funcional frente a ECA:

- Persistir y administrar metadatos enriquecidos desde UI.
- Historial formal de versiones y marcado de versiones reemplazadas.
- Bloquear uso productivo de plantillas no `RELEASED`; hoy solo se advierte.
- Text Block Library avanzada con clases Clause y Signature Block administradas desde UI completa.
- Versiones, variantes y estados de text blocks.
- Edicion centralizada de text blocks.
- Template rules y text block rules.
- Condiciones If / Else If / Else con expresiones y acciones.
- Alternativas con risk level: Low, Medium, High, Very High.
- Estado de documento virtual y refresh document.

## Backlog sugerido

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

Las acciones de lifecycle escriben este sidecar. `CREATE_NEW_VERSION` copia el archivo actual a la siguiente version `v###`, deja la nueva en `DRAFT` y marca la anterior como `REPLACED`.

## Metadata de cláusulas / text blocks

Las clausulas usan la convencion:

```text
CLA_<categoria>_<titulo>_<version>_<estado>.html
```

Pueden enriquecerse con sidecar:

```text
CLA_SERVICIOS_CONFIDENCIALIDAD_v001_APROBADO.metadata.json
```

Campos soportados: `title`, `class`, `type`, `categories`, `governingLaw`, `language`, `description`, `validFrom`, `validTo`, `owner`, `version`, `revision`, `status`, `variantsOf`.

## Documento virtual mínimo

La generacion guarda metadata de documento virtual:

- `PENDING`: faltan campos `USER_INPUT`.
- `ERROR`: faltan variables `SAP_VARIABLE`.
- `COMPLETED`: todos los campos requeridos tienen valor.
- `FINAL`: reservado para futuro.

`POST /api/virtual-documents/refresh` refresca variables SAP/mock y recalcula estado/mensajes. En esta iteracion no regenera automaticamente DOCX/PDF.

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

## API de documentos de negocio

La vista **Documentos** consume `GET /api/documents` para evitar mostrar el repositorio técnico como un dump de archivos. La tab muestra una fila por documento lógico y reserva `GET /api/repository` para la tab **Repositorio**.

Parámetros soportados:

- `contractId`
- `category`
- `templateId`
- `status`
- `assemblyStatus`
- `fileType`
- `documentClass` / `contentType`
- `q`
- `limit` (por defecto `20`)
- `offset` (por defecto `0`)
- `sortBy`
- `sortDirection`
- `includeAll`

Heurística de agrupación: el backend deriva documentos desde `backend/repository/generated` y agrupa archivos por `contractNumber`, `templateId` o nombre de plantilla, versión y prefijo semántico antes de sufijos técnicos como `_GENERADO`, `_PARA_FIRMA`, `_EDITADO_BORRADOR` o `_METADATA`. La metadata JSON se adjunta como archivo relacionado y no aparece como fila principal. Para `primaryFile`, se prefiere PDF final/para firma, luego PDF, DOCX generado, DOCX y finalmente HTML borrador. Si no hay match perfecto de nombres, el agrupamiento se mantiene simple y conservador.

Respuesta resumida:

```json
{
  "documents": [
    {
      "documentId": "...",
      "displayName": "...",
      "contractNumber": "...",
      "templateId": "...",
      "templateVersion": "...",
      "status": "GENERATED",
      "assemblyStatus": "PENDING",
      "primaryFile": { "type": "PDF", "relativePath": "..." },
      "relatedFiles": []
    }
  ],
  "total": 0,
  "filtered": 0,
  "limit": 20,
  "offset": 0
}
```
