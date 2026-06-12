# AGENTS.md

## Project context

This repository is an internal MVP / functional prototype for Grupo Punta Cana contract management and contract assembly. It demonstrates template selection, SAP/mock data lookup, dynamic variable completion, DOCX/PDF generation, local repository browsing, document preview/editing, clause insertion, and version saving.

Keep the project pragmatic. It is not a full SAP Enterprise Contract Assembly clone yet; document gaps honestly and avoid large rewrites unless explicitly requested.

## Architecture summary

- `backend/`: Node.js + Express API.
- `frontend/`: SAPUI5/Fiori freestyle app.
- `backend/repository/`: local document repository for templates, clauses, generated documents, PDFs, signed files, and evidence.
- SAP integration: backend calls SAP OData through a BAS/UI5 local proxy, Destination/Cloud Connector, or direct base URL. It must keep mock fallback behavior.

## Current known flows

- Main UI is organized into SAP ECM/ECA-inspired tabs: General Information, Documents, Templates, Clauses, Virtual Document, and Repository.
- The frontend owns a local `appContext` model for legal transaction id/name, context, category, simulated profile/roles, and role-filter flags. Query params `contractId`, `context`, `category`, and `profile` can override defaults.
- Roles are simulated only (`LEGAL_ADMIN`, `LEGAL_USER`, `BUSINESS_USER`, `VIEWER`); do not implement real authentication unless explicitly requested.
- Template and clause list endpoints accept optional query filters while preserving no-query compatibility.

- Load templates with `GET /api/templates`.
- Extract variables with `GET /api/templates/:templateId/variables`.
- Fetch SAP/mock data with `GET /api/sap/contracts/:contractId`.
- Generate documents with `POST /api/templates/:templateId/generate`.
- Manage template metadata with `GET /api/templates/:templateId`, `PATCH /api/templates/:templateId/metadata`, and `POST /api/templates/:templateId/actions/:action`.
- Refresh virtual document variables with `POST /api/virtual-documents/refresh`.
- Browse repository with `GET /api/repository`.
- Preview/download files through `/api/files/*`.
- Edit DOCX/HTML as HTML and save HTML or DOCX versions.
- Load clauses with `GET /api/clauses`, manage clause metadata/actions/version/variant, and insert text blocks in the rich text editor.

## Development commands

Install dependencies:

```bash
npm run install:all
```

Backend:

```bash
npm run backend:dev
```

Frontend:

```bash
npm run frontend:dev
```

Direct frontend command:

```bash
cd frontend && npx ui5 serve --config ./ui5-local.yaml --port 8080 --accept-remote-connections
```

Frontend without SAP proxy:

```bash
npm run frontend:dev:nosap
```

For no real SAP access, run the backend with `SAP_ODATA_FORCE_MOCK=true`.

## Coding standards

- Backend: use Express route handlers, async/await, explicit errors, and `next(error)` for route failures.
- Backend: never log secrets, Basic Auth values, real credentials, or sensitive documents.
- Frontend: keep SAPUI5 freestyle patterns and simple JSON models.
- Frontend: do not break namespace `com.gpc.contracts.GPCGestindeContratos`.
- The generated package/UI5 metadata may use lowercase `gpcgestindecontratos`; do not rename it broadly unless the runtime namespace is also migrated and tested.
- Prefer small functions and incremental changes.
- Avoid large refactors unless they are required for the requested behavior.
- Keep API contracts stable. If an endpoint changes, update frontend and README together.

## SAP integration rules

- Keep mock fallback. Do not remove it.
- Never hardcode SAP credentials.
- Preserve BAS/local proxy compatibility through `SAP_ODATA_BASE_URL=http://localhost:8080`.
- Use Destination `GPC_CLM_CONTRACT_ODATA` for the local `/sap` UI5 proxy.
- Preserve JSON and XML/Atom compatibility when touching SAP response parsing.
- For `SAP_ODATA_RESPONSE_FORMAT=xml`, prefer the `Accept` header and do not force `$format=xml`.
- Do not assume OData supports `$filter`; use `SAP_ODATA_LOOKUP_MODE`.
- Recommended known endpoint shape: `/sap/opu/odata/sap/ZCLM_CONTRACT_SRV_SRV/contractSet('900000000001')`.
- Keep `SAP_CLIENT` optional and configurable.

## Document repository rules

- Templates live under `backend/repository/templates/`.
- Template metadata is derived from `TPL_<category>_<contractType>_<version>_<status>` and may be enriched with an adjacent `<templateBaseName>.metadata.json` sidecar.
- Keep template statuses normalized to `DRAFT`, `SENT_FOR_APPROVAL`, `APPROVED`, `RELEASED`, `EXPIRED`, `REPLACED`, `ARCHIVED`.
- Any future lifecycle endpoint must validate transitions in backend lifecycle helpers before mutating metadata.
- Clauses live under `backend/repository/clauses/`.
- Clause metadata is derived from `CLA_<category>_<title>_<version>_<status>` and may be enriched with an adjacent `<clauseBaseName>.metadata.json` sidecar.
- Clause lifecycle actions must also validate transitions in backend helpers.
- Generated outputs live under `backend/repository/generated/`.
- Signed documents and evidence should live under `backend/repository/signed/` and `backend/repository/evidence/`.
- Do not commit generated documents, generated PDFs, signed files, evidence, or local output folders.
- Preserve safe path handling for file download/preview endpoints.

## ECA functional alignment

Use SAP Enterprise Contract Assembly concepts as a functional reference:

- Templates: metadata, versions, lifecycle states, approval/release, Word export.
- Text blocks: clause/signature block library, metadata, variables, input fields, versions, variants, states.
- Text elements: keep `SAP_VARIABLE`/`VARIABLE` separate from `USER_INPUT`/`INPUT_FIELD`.
- Virtual documents: keep status/messages in generation metadata and use refresh endpoint for SAP/mock values.
- Rules and conditions: template rules, text block rules, If / Else If / Else, insert/replace/remove actions.
- Alternatives: alternative text blocks with risk levels Low, Medium, High, Very High.
- Virtual documents: generated or assembled document states and refresh behavior.

Document these as alignment/backlog unless the user explicitly asks to implement them.

## Technical backlog

- Add template rules and text block rules such as `canRemove` and `fixedPosition`.
- Add conditions with expressions and insert/replace/remove actions.
- Add alternatives with risk levels `LOW`, `MEDIUM`, `HIGH`, `VERY_HIGH`.
- Add virtual document states `PENDING`, `ERROR`, `COMPLETED`, `FINAL` and Refresh Document behavior.

## Safe change policy

- Before changing code, inspect routes, services, package scripts, and UI5 config.
- Validate backend with `/health` when feasible.
- Validate frontend with `ui5 serve` when feasible.
- Run `node --check` on modified JavaScript files.
- Keep README and AGENTS synchronized with meaningful API or workflow changes.

## Do not do

- Do not remove fallback mock behavior.
- Do not remove existing endpoints.
- Do not change API contracts without updating frontend and README.
- Do not commit `.env`, `default-env.json`, credentials, or generated sensitive documents.
- Do not introduce large dependencies without a clear reason.
- Do not convert this PoC into a full rewrite.
