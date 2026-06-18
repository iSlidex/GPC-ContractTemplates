# Diseño de dominio — Plantillas GDL con placeholders

## 1. Para qué sirve la sección **Ensamblaje**

En esta app, **Ensamblaje** representa el equivalente funcional del “documento virtual”:

1. Se toma una plantilla DOCX/HTML seleccionada.
2. Se extraen los placeholders con sintaxis `{VARIABLE_NAME}`.
3. Se consultan valores desde SAP/mock.
4. Se separan los valores entre **Variables SAP** y **Campos de usuario**.
5. Se muestra el estado del documento virtual: `COMPLETED`, `PENDING`, `ERROR` o `FINAL`.
6. Se muestran mensajes de validación, por ejemplo si la plantilla está `APPROVED` pero no `RELEASED`.
7. El botón **Refrescar Variables SAP** actualiza metadata y valores, pero en el estado actual del MVP **no regenera DOCX/PDF**.

Esto sirve como tablero de control antes de generar o finalizar documentos: permite ver si todos los datos contractuales requeridos están disponibles y qué valores se usarán para rellenar la plantilla.

## 2. Contratos procesados

| Código | Plantilla generada | Tipo funcional | Cant. variables |
|---|---|---|---:|
| CC | `TPL_CC_AcuerdoColaboracionGDL_v001_APPROVED.docx` | GDL - Acuerdo de Colaboración | 15 |
| IP | `TPL_IP_IntermediacionPublicitariaAgenciasActuales_v001_APPROVED.docx` | GDL - Intermediación Publicitaria - Agencias Actuales | 29 |
| IP | `TPL_IP_IntermediacionPublicitariaNuevasAgencias_v001_APPROVED.docx` | GDL - Intermediación Publicitaria - Nuevas Agencias | 36 |
| IP | `TPL_IP_AcuerdoIntercambioPublicidad_v001_APPROVED.docx` | GDL - Acuerdo de Intercambio por Publicidad | 34 |
| IP | `TPL_IP_AcuerdoInversionPublicidadPreventa_v001_APPROVED.docx` | GDL - Acuerdo de Inversión en Publicidad - Preventa | 29 |
| IP | `TPL_IP_AcuerdoInversionPublicidadGeneral_v001_APPROVED.docx` | GDL - Acuerdo de Inversión en Publicidad - General | 39 |

## 3. Sintaxis de placeholders

La sintaxis usada es compatible con el `Docxtemplater` del repositorio:

```text
{VARIABLE_NAME}
```

Ejemplos:

```text
{COUNTERPARTY_LEGAL_NAME}
{COUNTERPARTY_TAX_ID}
{PUBLICITY_INVESTMENT_AMOUNT}
{SIGNING_DAY_WORDS}
{SIGNING_MONTH}
```

## 4. Grupos de variables recomendados

### Datos generales del contrato

- `REQUEST_NUMBER`
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

### Contraparte / cliente / intermediaria

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

### Montos, porcentajes y condiciones comerciales

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

### Campos específicos por tipo

**Acuerdo de colaboración**

- `COLLABORATOR_PROFILE_DESCRIPTION`
- `COLLABORATION_PURPOSE`
- `COLLABORATION_CONTENT_DESCRIPTION`
- `COLLABORATION_CONTENT_FORMAT`
- `COLLABORATION_COMMISSION_PERCENT_NUMBER`
- `COLLABORATION_COMMISSION_PERCENT_WORDS`

**Intermediación publicitaria**

- `INTERMEDIARY_*`
- `COMMISSION_PERCENT_*`
- `OWN_ADVERTISING_DISCOUNT_PERCENT_*`
- `DEFAULT_PAYMENT_TERM_DAYS_*`
- `ALTERNATIVE_PAYMENT_TERM_DAYS_*`
- `COMPENSATION_THRESHOLD_DAYS_*`
- `CONFIDENTIALITY_DURATION_YEARS_*`
- `MIN_AVERAGE_MONTHLY_INVESTMENT_*`
- `UPGRADED_COMMISSION_PERCENT_*`

**Intercambio por publicidad**

- `EXCHANGE_AIR_TICKETS_WORDS`
- `EXCHANGE_AIR_TICKETS_NUMBER`
- `EXCHANGE_LODGING_STAYS_WORDS`
- `EXCHANGE_LODGING_STAYS_NUMBER`
- `PUBLICITY_CREDIT_AMOUNT_*`

**Inversión publicitaria / preventa**

- `PREVENTA_YEAR`
- `PERIOD_START_*`
- `PERIOD_END_*`
- `PUBLICITY_INVESTMENT_AMOUNT_*`
- `DIGITAL_DISCOUNT_PERCENT_*`

## 5. Reglas de dominio sugeridas

### TemplateDefinition

```json
{
  "templateId": "TPL_IP_AcuerdoInversionPublicidadPreventa_v001_APPROVED",
  "category": "IP",
  "contractType": "AcuerdoInversionPublicidadPreventa",
  "context": "Intercambio publicitario",
  "status": "APPROVED",
  "version": "v001",
  "variables": []
}
```

### ContractVariable

```json
{
  "name": "COUNTERPARTY_LEGAL_NAME",
  "label": "Counterparty Legal Name",
  "source": "SAP_VARIABLE",
  "ecaType": "VARIABLE",
  "type": "text",
  "required": true
}
```

### Fuentes de datos

Para el MVP, se recomienda mantener dos fuentes:

1. `SAP_VARIABLE`: valores traídos del `Contract Data Resolver`, SAP/mock o API de Legal Transaction.
2. `USER_INPUT`: valores manuales requeridos por la plantilla cuando no existan en SAP.

En producción, la fuente real debería venir de una capa tipo:

```text
Contract Data Resolver
  -> Legal Transaction / Contract OData
  -> Business Object vinculado, si aplica
  -> Custom fields / BAdI / mock fallback
  -> Payload normalizado para plantilla
```

## 6. Notas de calidad

- Los archivos fueron convertidos a placeholder DOCX manteniendo el contenido base.
- Las líneas de firma se conservaron como líneas de firma, no como placeholders.
- Se aceptaron cambios rastreados, se removieron comentarios y se limpió la marca de agua “REVISIÓN” en los modelos de intermediación.
- El documento “Acuerdo de Inversión en Publicidad General” venía como ejemplo con datos reales y algunos caracteres alterados; se convirtió a plantilla, pero debe pasar por revisión legal/ortográfica antes de usarlo como RELEASED.
- Los placeholders con montos en letras y números se dejaron separados porque los contratos legales suelen requerir ambos formatos.
- El estado recomendado inicial es `APPROVED`; para productivo debería migrarse a `RELEASED` cuando Legal valide cada plantilla.
