Eres Codex trabajando sobre el repositorio `iSlidex/GPC-ContractTemplates`.

Objetivo:
Integrar al MVP las nuevas plantillas DOCX placeholderizadas de GDL y extender el dominio de variables para que la sección Ensamblaje pueda mostrar y refrescar todos los datos requeridos por las plantillas, no solo las variables básicas actuales del contratista.

Contexto del repo:
- Backend: Node.js + Express.
- Frontend: SAPUI5/Fiori freestyle.
- Las plantillas viven bajo `backend/repository/templates/`.
- El patrón actual de nombre es `TPL_<category>_<contractType>_<version>_<status>.docx`.
- La extracción actual detecta placeholders con sintaxis `{VARIABLE_NAME}`.
- No elimines mock fallback ni endpoints existentes.
- No hardcodees credenciales SAP.
- Mantén compatibilidad con BAS/UI5 proxy y `SAP_ODATA_FORCE_MOCK=true`.

Archivos entregados por negocio:
1. `TPL_CC_AcuerdoColaboracionGDL_v001_APPROVED.docx`
2. `TPL_IP_IntermediacionPublicitariaAgenciasActuales_v001_APPROVED.docx`
3. `TPL_IP_IntermediacionPublicitariaNuevasAgencias_v001_APPROVED.docx`
4. `TPL_IP_AcuerdoIntercambioPublicidad_v001_APPROVED.docx`
5. `TPL_IP_AcuerdoInversionPublicidadPreventa_v001_APPROVED.docx`
6. `TPL_IP_AcuerdoInversionPublicidadGeneral_v001_APPROVED.docx`
7. Sidecars `.metadata.json` correspondientes.
8. `variables_catalog.json`.
9. `template_manifest.json`.

Tareas:

1. Copiar plantillas y metadata
- Crear carpetas si no existen:
  - `backend/repository/templates/CC/`
  - `backend/repository/templates/IP/`
- Colocar las plantillas CC en `CC/` e IP en `IP/`.
- Colocar cada `<templateBaseName>.metadata.json` junto a su DOCX.
- No colocar documentos generados dentro de `generated/`.

2. Extender el dominio de plantillas
- Crear o actualizar un módulo de dominio, por ejemplo:
  - `backend/src/domain/contractTemplateDomain.js`
  - `backend/src/domain/variableCatalog.js`
- Cargar/definir los tipos:
  - `CC / AcuerdoColaboracionGDL`
  - `IP / IntermediacionPublicitariaAgenciasActuales`
  - `IP / IntermediacionPublicitariaNuevasAgencias`
  - `IP / AcuerdoIntercambioPublicidad`
  - `IP / AcuerdoInversionPublicidadPreventa`
  - `IP / AcuerdoInversionPublicidadGeneral`
- Cada definición debe incluir:
  - `templateId`
  - `category`
  - `contractType`
  - `context`
  - `status`
  - `version`
  - `requiredVariables`
  - `businessDescription`

3. Extender clasificación de variables
- En `backend/src/services/repositoryService.js`, reemplazar o complementar el `SAP_VARIABLES` set fijo con un catálogo extensible.
- El catálogo debe reconocer como `SAP_VARIABLE` todas las variables que pueden venir del Contract Data Resolver / SAP/mock.
- Mantener `USER_INPUT` para variables que no tengan fuente SAP.
- No romper la respuesta actual de `GET /api/templates/:templateId/variables`.

4. Extender `sapContractService`
- En `backend/src/services/sapContractService.js`, extender `mapSapContractToTemplateValues`.
- Además de las variables actuales:
  - `CONTRACT_NUMBER`
  - `CONTRACTOR_NAME`
  - `CONTRACTOR_ID`
  - `CONTRACTOR_ADDRESS`
  - `CONTRACTOR_EMAIL`
  - `CONTRACT_PURPOSE`
  - `CONTRACT_AMOUNT`
  - `CONTRACT_CURRENCY`
  - `START_DATE`
  - `END_DATE`
- Mapear también:
  - Contraparte/intermediaria/cliente:
    - `COUNTERPARTY_LEGAL_NAME`
    - `COUNTERPARTY_TAX_ID`
    - `COUNTERPARTY_REGISTRY_NUMBER`
    - `COUNTERPARTY_ADDRESS`
    - `COUNTERPARTY_REPRESENTATIVE_NAME`
    - `COUNTERPARTY_REPRESENTATIVE_TITLE`
    - `COUNTERPARTY_REPRESENTATIVE_ID_NUMBER`
    - `COUNTERPARTY_REPRESENTATIVE_CIVIL_STATUS`
    - `CLIENT_LEGAL_NAME`
    - `CLIENT_TAX_ID`
    - `CLIENT_REGISTRY_NUMBER`
    - `CLIENT_ADDRESS`
    - `INTERMEDIARY_LEGAL_NAME`
    - `INTERMEDIARY_TAX_ID`
    - `INTERMEDIARY_REGISTRY_NUMBER`
    - `INTERMEDIARY_ADDRESS`
  - Fechas:
    - `SIGNING_DAY_WORDS`
    - `SIGNING_DAY_NUMBER`
    - `SIGNING_MONTH`
    - `SIGNING_YEAR_WORDS`
    - `SIGNING_YEAR_NUMBER`
    - `START_DAY_WORDS`
    - `START_DAY_NUMBER`
    - `START_MONTH`
    - `START_YEAR_WORDS`
    - `START_YEAR_NUMBER`
    - `END_DAY_WORDS`
    - `END_DAY_NUMBER`
    - `END_MONTH`
    - `END_YEAR_WORDS`
    - `END_YEAR_NUMBER`
  - Montos y condiciones:
    - `PUBLICITY_INVESTMENT_AMOUNT`
    - `PUBLICITY_INVESTMENT_AMOUNT_WORDS`
    - `PUBLICITY_CREDIT_AMOUNT`
    - `PUBLICITY_CREDIT_AMOUNT_WORDS`
    - `TOTAL_PUBLICITY_AMOUNT_USD`
    - `TOTAL_PUBLICITY_AMOUNT_DOP`
    - `BILLABLE_AMOUNT_USD`
    - `BILLABLE_AMOUNT_DOP`
    - `BONUS_AMOUNT_USD`
    - `BONUS_AMOUNT_DOP`
    - `EXCHANGE_RATE_DOP_PER_USD`
    - `COMMISSION_PERCENT_NUMBER`
    - `COMMISSION_PERCENT_WORDS`
    - `DIGITAL_DISCOUNT_PERCENT_NUMBER`
    - `DIGITAL_DISCOUNT_PERCENT_WORDS`
- Para el MVP, los valores en letras pueden venir del mock o de campos SAP si existen. No introduzcas una dependencia pesada para convertir números a letras; deja una función pequeña o usa valores mock explícitos.

5. Mock data
- Ampliar `getMockContract(contractId)` para devolver datasets representativos por tipo de contrato.
- Agregar al menos un dataset para:
  - Acuerdo de Colaboración
  - Intermediación Publicitaria Agencias Actuales
  - Intermediación Publicitaria Nuevas Agencias
  - Acuerdo de Intercambio por Publicidad
  - Acuerdo de Inversión Publicidad Preventa
  - Acuerdo de Inversión Publicidad General
- Asegurar que al refrescar variables en Ensamblaje no queden en error por variables faltantes cuando se use mock.

6. Ensamblaje
- Mantener el comportamiento actual: `POST /api/virtual-documents/refresh` refresca variables y metadata, pero no regenera DOCX/PDF.
- Mejorar el mensaje para que el usuario entienda:
  - qué se actualizó,
  - qué no se regeneró,
  - qué acción debe tomar para generar o volver a generar el documento.
- En la tabla `Variables SAP`, mostrar correctamente variables nuevas y valores largos.
- En `Campos de usuario`, si no hay campos manuales, mostrar un empty state claro.

7. README y documentación interna
- Actualizar `README.md` con:
  - nueva lista de plantillas,
  - sintaxis `{VARIABLE_NAME}`,
  - flujo Ensamblaje,
  - diferencia entre refrescar variables y generar documento.
- Actualizar `AGENTS.md` solo si agregas nuevas reglas de dominio relevantes.

8. Validación
Ejecutar:
```bash
node --check frontend/webapp/controller/Main.controller.js
find backend/src -name "*.js" -print0 | xargs -0 -n1 node --check
```
Cuando sea posible:
```bash
npm run backend:dev
curl http://localhost:<port>/health
```

Criterios de aceptación:
- `GET /api/templates` lista las 6 plantillas nuevas.
- `GET /api/templates/:templateId/variables` detecta todos los placeholders de cada DOCX.
- `POST /api/virtual-documents/refresh` devuelve valores para las variables nuevas usando mock fallback.
- La pestaña Ensamblaje muestra `COMPLETED` cuando no hay variables SAP faltantes.
- La generación DOCX con Docxtemplater no falla por placeholders sin valor.
- No se rompen las pestañas Resumen, Documentos, Plantillas, Cláusulas, Ensamblaje ni Repositorio técnico.
- No se eliminan endpoints existentes ni mock fallback.
