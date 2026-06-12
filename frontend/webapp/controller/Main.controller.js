sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Link",
    "sap/m/ObjectStatus",
    "sap/ui/core/HTML",
    "sap/ui/richtexteditor/RichTextEditor",
    "sap/m/HBox",
    "sap/m/Title",
    "sap/m/IconTabBar",
    "sap/m/IconTabFilter",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Dialog,
    Button,
    VBox,
    Text,
    Label,
    Input,
    Link,
    ObjectStatus,
    HTML,
    RichTextEditor,
    HBox,
    Title,
    IconTabBar,
    IconTabFilter,
    List,
    StandardListItem,
    Table,
    Column,
    ColumnListItem,
) {
    "use strict";

    return Controller.extend("com.gpc.contracts.GPCGestindeContratos.controller.Main", {
        onInit: function () {
            const sApiBaseUrl = this._getApiBaseUrl();
            const oAppContext = this._buildAppContextFromQuery();

            const oModel = new JSONModel({
                apiBaseUrl: sApiBaseUrl,
                backendStatus: "Validando backend...",
                backendStatusState: "Warning",
                appContext: oAppContext,
                filters: {
                    templateText: "",
                    templateContext: oAppContext.context,
                    templateCategory: oAppContext.category,
                    templateContentType: "",
                    templateGoverningLaw: "",
                    templateLanguage: "",
                    templateStatus: "",
                    templateProfile: oAppContext.profile,
                    clauseText: "",
                    clauseCategory: oAppContext.category,
                    clauseStatus: "",
                    clauseType: "",
                    clauseClass: "",
                    clauseGoverningLaw: "",
                    clauseLanguage: "",
                    documentText: "",
                    documentClass: "",
                    documentFileType: "",
                    documentStatus: "",
                    documentAssemblyStatus: "",
                    documentCategory: oAppContext.category,
                    documentTemplateId: "",
                    documentContractId: oAppContext.legalTransactionId,
                    documentScope: "current",
                    documentSortBy: "modifiedAt",
                    documentSortDirection: "desc"
                },
                templates: [],
                filteredTemplates: [],
                clauses: [],
                filteredClauses: [],
                clauseSummary: { total: 0, filtered: 0 },
                repositoryTree: [],
                documents: [],
                documentSummary: { total: 0, filtered: 0, limit: 20, offset: 0, notice: "", isEmpty: false, canLoadMore: false },
                selectedDocument: null,
                templateSummary: { total: 0, recommended: 0, hiddenByRole: 0 },
                summary: { generatedDocuments: 0, recommendedTemplates: 0, availableClauses: 0, lastAssembly: "Pendiente", lastDataSource: "Sin consulta SAP/mock realizada.", hasVirtualDocument: false },
                virtualDisplay: {
                    hasActiveDocument: false,
                    emptyMessage: "No hay documento virtual seleccionado.",
                    emptyDescription: "Selecciona un documento generado o crea un documento desde una plantilla para iniciar el ensamblaje.",
                    header: {},
                    messages: [],
                    variables: [],
                    inputFields: []
                },
                hasGenerationResult: false,
                generationMessage: "",
                lastGeneration: {
                    docxText: "",
                    docxUrl: "",
                    pdfText: "",
                    pdfUrl: "",
                    metadataText: "",
                    metadataUrl: ""
                },
                virtualDocument: null
            });

            this.getView().setModel(oModel, "app");
            this._syncVirtualDocumentDisplay();
            this._loadInitialData();
        },

        _buildAppContextFromQuery: function () {
            const oParams = new URLSearchParams(window.location.search || "");
            const sProfile = oParams.get("profile") || "LEGAL_USER";
            const sLegalTransactionName = oParams.get("transactionName") || "Contrato de arrendamiento";
            const aRoles = [sProfile];

            return {
                legalTransactionId: oParams.get("contractId") || "1000000016",
                legalTransactionName: sLegalTransactionName,
                legalTransactionDisplayName: this._toDisplayName(sLegalTransactionName),
                context: oParams.get("context") || "Arrendamiento",
                category: oParams.get("category") || "",
                profile: sProfile,
                roles: aRoles,
                rolesText: aRoles.join(", "),
                availableContexts: ["Arrendamiento", "Servicios", "Compras", "Ventas", "RRHH"],
                availableCategories: [
                    "Arrendamiento de inmuebles",
                    "Arrendamiento de espacios físicos",
                    "Arrendamiento de equipos",
                    "Arrendamiento de local",
                    "Arrendamiento de naves",
                    "Servicios profesionales",
                    "Compras",
                    "Ventas"
                ],
                roleFiltersEnabled: true,
                status: "En preparación",
                owner: "GPC Legal"
            };
        },


        _toDisplayName: function (sValue) {
            const aLowercaseWords = ["de", "del", "la", "las", "el", "los", "y"];

            return String(sValue || "")
                .toLocaleLowerCase("es")
                .split(" ")
                .map(function (sWord, iIndex) {
                    if (iIndex > 0 && aLowercaseWords.includes(sWord)) {
                        return sWord;
                    }

                    return sWord.charAt(0).toLocaleUpperCase("es") + sWord.slice(1);
                })
                .join(" ");
        },

        _buildQueryString: function (oParams) {
            const oSearchParams = new URLSearchParams();

            Object.keys(oParams || {}).forEach(function (sKey) {
                const vValue = oParams[sKey];

                if (vValue !== undefined && vValue !== null && vValue !== "") {
                    oSearchParams.set(sKey, vValue);
                }
            });

            const sQuery = oSearchParams.toString();
            return sQuery ? "?" + sQuery : "";
        },

        _getApiBaseUrl: function () {
            const sManualUrl = window.localStorage.getItem("GPC_API_BASE_URL");

            if (sManualUrl) {
                return sManualUrl.replace(/\/$/, "");
            }

            return "";
        },

        _loadInitialData: async function () {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");

            try {
                oModel.setProperty("/backendStatus", "Validando backend...");
                oModel.setProperty("/backendStatusState", "Warning");

                const oAppContext = oModel.getProperty("/appContext") || {};
                const [oTemplates, oRepository, oClauses, oDocuments] = await Promise.all([
                    this._fetchJson(sApiBaseUrl + "/api/templates" + this._buildQueryString({
                        context: oAppContext.context,
                        category: oAppContext.category,
                        profile: oAppContext.profile
                    })),
                    this._fetchJson(sApiBaseUrl + "/api/repository"),
                    this._fetchJson(sApiBaseUrl + "/api/clauses" + this._buildQueryString({
                        category: oAppContext.category
                    })),
                    this._loadBusinessDocuments()
                ]);

                const aPreparedTree = this._prepareTree(oRepository.tree || []);

                oModel.setProperty("/backendStatus", "Backend conectado");
                oModel.setProperty("/backendStatusState", "Success");
                oModel.setProperty("/templates", this._decorateTemplates(oTemplates.templates || []));
                oModel.setProperty("/clauses", this._decorateClauses(oClauses.clauses || []));
                oModel.setProperty("/repositoryTree", aPreparedTree);
                this._setBusinessDocuments(oDocuments);
                this._applyTemplateFilters();
                this._applyClauseFilters();
                this._updateSummaryCards();

                MessageToast.show("Repositorio cargado correctamente");
            } catch (oError) {
                console.error(oError);

                oModel.setProperty("/backendStatus", "Error conectando backend");
                oModel.setProperty("/backendStatusState", "Error");

                MessageBox.error(
                    "No se pudo conectar con el backend.\n\n" +
                    "URL usada:\n" + sApiBaseUrl + "\n\n" +
                    "Detalle:\n" + oError.message
                );
            }
        },

        _sleep: function (iMilliseconds) {
            return new Promise(function (resolve) {
                setTimeout(resolve, iMilliseconds);
            });
        },

        _fetchJson: async function (sUrl, oOptions) {
            const sMethod = ((oOptions && oOptions.method) || "GET").toUpperCase();
            const bCanRetry = sMethod === "GET";
            const iMaxAttempts = bCanRetry ? 3 : 1;

            let oLastError;

            for (let iAttempt = 1; iAttempt <= iMaxAttempts; iAttempt++) {
                try {
                    const oResponse = await fetch(sUrl, oOptions);
                    const sText = await oResponse.text();

                    if (!oResponse.ok) {
                        const bTransientProxyError =
                            bCanRetry &&
                            (
                                sText.includes("ECONNREFUSED") ||
                                sText.includes("AggregateError") ||
                                oResponse.status === 502 ||
                                oResponse.status === 503 ||
                                oResponse.status === 504
                            );

                        if (bTransientProxyError && iAttempt < iMaxAttempts) {
                            await this._sleep(500);
                            continue;
                        }

                        throw new Error(
                            oResponse.status +
                            " " +
                            oResponse.statusText +
                            " - " +
                            sText
                        );
                    }

                    if (!sText) {
                        return {};
                    }

                    try {
                        return JSON.parse(sText);
                    } catch (oParseError) {
                        throw new Error(
                            "La respuesta no es JSON válido desde " +
                            sUrl +
                            ":\n\n" +
                            sText.slice(0, 1500)
                        );
                    }
                } catch (oError) {
                    oLastError = oError;

                    const bTransientFetchError =
                        bCanRetry &&
                        (
                            String(oError.message || "").includes("ECONNREFUSED") ||
                            String(oError.message || "").includes("Failed to fetch") ||
                            String(oError.message || "").includes("NetworkError")
                        );

                    if (bTransientFetchError && iAttempt < iMaxAttempts) {
                        await this._sleep(500);
                        continue;
                    }

                    throw oError;
                }
            }

            throw oLastError;
        },

        _loadBusinessDocuments: async function (oOptions) {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");
            const oFilters = oModel.getProperty("/filters") || {};
            const oAppContext = oModel.getProperty("/appContext") || {};
            const iOffset = oOptions && Number.isFinite(oOptions.offset) ? oOptions.offset : 0;
            const iLimit = oOptions && Number.isFinite(oOptions.limit) ? oOptions.limit : 20;
            const bIncludeAll = oFilters.documentScope === "all";

            return this._fetchJson(sApiBaseUrl + "/api/documents" + this._buildQueryString({
                contractId: bIncludeAll ? "" : (oFilters.documentContractId || oAppContext.legalTransactionId),
                category: oFilters.documentCategory,
                templateId: oFilters.documentTemplateId,
                status: oFilters.documentStatus,
                assemblyStatus: oFilters.documentAssemblyStatus,
                fileType: oFilters.documentFileType,
                documentClass: oFilters.documentClass,
                q: oFilters.documentText,
                sortBy: oFilters.documentSortBy,
                sortDirection: oFilters.documentSortDirection,
                includeAll: bIncludeAll ? "true" : "",
                limit: iLimit,
                offset: iOffset
            }));
        },

        _getDocumentFileBadges: function (oDocument) {
            const aRelated = oDocument.relatedFiles || [];
            const aTypes = [];

            aRelated.forEach(function (oFile) {
                if (aTypes.indexOf(oFile.type) === -1) {
                    aTypes.push(oFile.type);
                }
            });

            if (!aTypes.length && oDocument.fileType) {
                aTypes.push(oDocument.fileType);
            }

            return aTypes.map(function (sType) {
                return {
                    type: sType,
                    state: sType === "METADATA" ? "None" : "Information"
                };
            });
        },

        _toRepositoryFileItem: function (oDocument, oFile) {
            const oPrimary = oFile || oDocument.primaryFile || oDocument;
            const sType = oPrimary.type || oPrimary.fileType || oDocument.fileType || "";

            return {
                ...oDocument,
                ...oPrimary,
                name: oPrimary.name || oDocument.name,
                relativePath: oPrimary.relativePath || oDocument.relativePath,
                fileType: sType,
                extension: oPrimary.extension || (sType ? "." + String(sType).toLowerCase() : oDocument.extension)
            };
        },

        _setBusinessDocuments: function (oDocumentsResult, bAppend) {
            const oModel = this.getView().getModel("app");
            const oResult = oDocumentsResult || {};
            const aIncomingDocuments = (oResult.documents || []).map(function (oDocument) {
                const sPath = oDocument.relativePath || (oDocument.primaryFile && oDocument.primaryFile.relativePath) || "";
                const aPathParts = String(sPath).split(/[\/]/);

                return {
                    ...oDocument,
                    type: "file",
                    extension: oDocument.extension || (oDocument.fileType ? "." + String(oDocument.fileType).toLowerCase() : ""),
                    icon: this._getFileIcon("." + String(oDocument.fileType || "").toLowerCase()),
                    statusState: this._statusToState(oDocument.status),
                    assemblyState: this._statusToState(oDocument.assemblyStatus),
                    modifiedAtText: this._formatDateTime(oDocument.modifiedAt),
                    shortPath: aPathParts.slice(-3).join("/"),
                    fileBadges: this._getDocumentFileBadges(oDocument),
                    statusCssClass: this._statusToCssClass(oDocument.status),
                    assemblyCssClass: this._statusToCssClass(oDocument.assemblyStatus),
                    templateText: [oDocument.templateId, oDocument.templateVersion].filter(Boolean).join(" / "),
                    versionsText: (oDocument.versionCount || 1) + " archivo(s) relacionado(s)"
                };
            }.bind(this));
            const aExistingDocuments = bAppend ? (oModel.getProperty("/documents") || []) : [];
            const aDocuments = aExistingDocuments.concat(aIncomingDocuments);
            const iFiltered = oResult.filtered || aDocuments.length;
            const bHasAnyFilter = !!(
                (oModel.getProperty("/filters/documentText")) ||
                (oModel.getProperty("/filters/documentClass")) ||
                (oModel.getProperty("/filters/documentFileType")) ||
                (oModel.getProperty("/filters/documentStatus")) ||
                (oModel.getProperty("/filters/documentAssemblyStatus")) ||
                (oModel.getProperty("/filters/documentTemplateId"))
            );
            const sNotice = "Mostrando " + aDocuments.length + " de " + iFiltered + " documentos. Ajusta filtros para ver más.";

            oModel.setProperty("/documents", aDocuments);
            oModel.setProperty("/documentSummary", {
                total: oResult.total || 0,
                filtered: iFiltered,
                limit: oResult.limit || 20,
                offset: oResult.offset || 0,
                notice: sNotice,
                isEmpty: aDocuments.length === 0,
                canLoadMore: aDocuments.length < iFiltered,
                emptyText: bHasAnyFilter
                    ? "No hay documentos que coincidan con los filtros. Puede que el estado, tipo de archivo o alcance no aplique; limpia filtros o cambia la transacción actual."
                    : "No hay documentos para esta transacción. Puede estar vacía porque aún no se ha generado contenido; crea un documento desde una plantilla.",
                showCreateEmptyAction: !bHasAnyFilter,
                showClearEmptyAction: bHasAnyFilter
            });
        },

        _formatDateTime: function (sDate) {
            if (!sDate) {
                return "N/D";
            }

            try {
                return new Date(sDate).toLocaleString();
            } catch (oError) {
                return sDate;
            }
        },

        _statusToState: function (sStatus) {
            const sNormalized = String(sStatus || "").toUpperCase();

            if (["APPROVED", "RELEASED", "COMPLETED", "FINAL", "SIGNED"].includes(sNormalized)) {
                return "Success";
            }

            if (["ERROR", "REJECTED"].includes(sNormalized)) {
                return "Error";
            }

            if (["PENDING", "DRAFT"].includes(sNormalized)) {
                return "Warning";
            }

            if (["ARCHIVED"].includes(sNormalized)) {
                return "None";
            }

            return "Information";
        },

        _statusToCssClass: function (sStatus) {
            const sNormalized = String(sStatus || "").toUpperCase();
            const mClasses = {
                DRAFT: "gpcStatusBadge gpcStatusDraft",
                SENT_FOR_APPROVAL: "gpcStatusBadge gpcStatusSentForApproval",
                APPROVED: "gpcStatusBadge gpcStatusApproved",
                RELEASED: "gpcStatusBadge gpcStatusReleased",
                ARCHIVED: "gpcStatusBadge gpcStatusArchived",
                REPLACED: "gpcStatusBadge gpcStatusReplaced",
                GENERATED: "gpcStatusBadge gpcStatusGenerated",
                PENDING: "gpcStatusBadge gpcStatusPending",
                ERROR: "gpcStatusBadge gpcStatusError",
                COMPLETED: "gpcStatusBadge gpcStatusCompleted",
                FINAL: "gpcStatusBadge gpcStatusFinal",
                SIGNED: "gpcStatusBadge gpcStatusFinal"
            };

            return mClasses[sNormalized] || "gpcStatusBadge";
        },

        _labelForStatus: function (sStatus) {
            const mLabels = {
                DRAFT: "Borrador",
                SENT_FOR_APPROVAL: "En aprobación",
                APPROVED: "Aprobado",
                RELEASED: "Liberado",
                EXPIRED: "Expirado",
                REPLACED: "Reemplazado",
                ARCHIVED: "Archivado",
                GENERATED: "Generado",
                PENDING: "Pendiente",
                ERROR: "Error",
                COMPLETED: "Completado",
                FINAL: "Final"
            };

            return mLabels[String(sStatus || "").toUpperCase()] || sStatus || "N/D";
        },

        _updateSummaryCards: function () {
            const oModel = this.getView().getModel("app");
            const aTemplates = oModel.getProperty("/templates") || [];
            const aFilteredTemplates = oModel.getProperty("/filteredTemplates") || [];
            const aClauses = oModel.getProperty("/filteredClauses") || [];
            const aDocuments = oModel.getProperty("/documents") || [];
            const oVirtualDocument = oModel.getProperty("/virtualDocument") || {};

            const bHasVirtualDocument = !!oVirtualDocument.virtualDocumentId;
            const sLastDataSource =
                oModel.getProperty("/lastSapDataSource") ||
                oVirtualDocument.dataSource ||
                oVirtualDocument.source ||
                "Sin consulta SAP/mock realizada.";

            oModel.setProperty("/summary", {
                generatedDocuments: aDocuments.length,
                recommendedTemplates: aFilteredTemplates.filter(function (oTemplate) { return oTemplate.recommendationState === "Success"; }).length,
                availableClauses: aClauses.length,
                lastAssembly: bHasVirtualDocument ? (oVirtualDocument.status || "Activo") : "Pendiente",
                lastDataSource: sLastDataSource,
                hasVirtualDocument: bHasVirtualDocument
            });
            oModel.setProperty("/templateSummary", {
                total: aTemplates.length,
                recommended: aTemplates.filter(function (oTemplate) { return oTemplate.recommendationState === "Success"; }).length,
                hiddenByRole: Math.max(aTemplates.length - aFilteredTemplates.length, 0)
            });
        },

        onDocumentFilterChange: async function () {
            try {
                this._setBusinessDocuments(await this._loadBusinessDocuments());
                this._updateSummaryCards();
            } catch (oError) {
                MessageBox.error("No se pudieron aplicar los filtros de documentos:\n\n" + oError.message);
            }
        },

        onClearDocumentFilters: async function () {
            const oModel = this.getView().getModel("app");
            const oAppContext = oModel.getProperty("/appContext") || {};

            oModel.setProperty("/filters/documentText", "");
            oModel.setProperty("/filters/documentClass", "");
            oModel.setProperty("/filters/documentFileType", "");
            oModel.setProperty("/filters/documentStatus", "");
            oModel.setProperty("/filters/documentAssemblyStatus", "");
            oModel.setProperty("/filters/documentCategory", oAppContext.category || "");
            oModel.setProperty("/filters/documentTemplateId", "");
            oModel.setProperty("/filters/documentContractId", oAppContext.legalTransactionId || "");
            oModel.setProperty("/filters/documentScope", "current");
            oModel.setProperty("/filters/documentSortBy", "modifiedAt");
            oModel.setProperty("/filters/documentSortDirection", "desc");
            await this.onDocumentFilterChange();
        },

        _prepareTree: function (aNodes) {
            return aNodes.map(function (oNode) {
                return {
                    ...oNode,
                    icon: oNode.type === "folder"
                        ? "sap-icon://folder"
                        : this._getFileIcon(oNode.extension),
                    children: oNode.children
                        ? this._prepareTree(oNode.children)
                        : []
                };
            }.bind(this));
        },

        _getFileIcon: function (sExtension) {
            switch (sExtension) {
                case ".docx":
                    return "sap-icon://doc-attachment";
                case ".pdf":
                    return "sap-icon://pdf-attachment";
                case ".json":
                    return "sap-icon://attachment-text-file";
                case ".xlsx":
                    return "sap-icon://excel-attachment";
                case ".html":
                    return "sap-icon://source-code";
                default:
                    return "sap-icon://document";
            }
        },

        _flattenRepositoryNodes: function (aNodes, aResult) {
            const aItems = aResult || [];

            (aNodes || []).forEach(function (oNode) {
                aItems.push(oNode);

                if (oNode.children && oNode.children.length) {
                    this._flattenRepositoryNodes(oNode.children, aItems);
                }
            }.bind(this));

            return aItems;
        },

        _buildDocumentRows: function (aRepositoryTree) {
            return this._flattenRepositoryNodes(aRepositoryTree || [])
                .filter(function (oNode) {
                    return oNode.type === "file" &&
                        String(oNode.relativePath || "").indexOf("generated") === 0 &&
                        [".docx", ".pdf", ".html", ".json"].includes(String(oNode.extension || "").toLowerCase());
                })
                .map(function (oNode) {
                    const sExtension = String(oNode.extension || "").replace(".", "").toUpperCase() || "N/D";
                    const bMetadata = String(oNode.extension || "").toLowerCase() === ".json";

                    return {
                        ...oNode,
                        documentClass: bMetadata ? "Metadata" : "Contrato",
                        fileType: sExtension,
                        contentType: sExtension,
                        language: "es",
                        status: bMetadata ? "COMPLETED" : "GENERATED",
                        statusState: bMetadata ? "Success" : "Information",
                        assemblyStatus: bMetadata ? "COMPLETED" : "PENDING",
                        assemblyState: bMetadata ? "Success" : "Warning"
                    };
                });
        },

        _decorateTemplates: function (aTemplates) {
            return (aTemplates || []).map(function (oTemplate) {
                const bRecommended = this._templateMatchesContext(oTemplate);

                return {
                    ...oTemplate,
                    recommendationText: bRecommended ? "Recomendada" : "Disponible",
                    recommendationState: bRecommended ? "Success" : "None",
                    statusState: this._statusToState(oTemplate.status),
                    statusCssClass: this._statusToCssClass(oTemplate.status)
                };
            }.bind(this));
        },

        _decorateClauses: function (aClauses) {
            return (aClauses || []).map(function (oClause) {
                const aAvailableActions = oClause.availableActions || [];
                const aActionLabels = aAvailableActions.map(this._labelForAction.bind(this));

                return {
                    ...oClause,
                    statusState: this._statusToState(oClause.status),
                    statusCssClass: this._statusToCssClass(oClause.status),
                    statusLabel: this._labelForStatus(oClause.status),
                    actionLabels: aActionLabels,
                    actionLabelsText: aActionLabels.join(", ") || "Sin acciones disponibles",
                    actionsSummary: "Acciones disponibles: " + aAvailableActions.length
                };
            }.bind(this));
        },

        _textMatches: function (vValue, sNeedle) {
            if (!sNeedle) {
                return true;
            }

            const sText = Array.isArray(vValue) ? vValue.join(" ") : String(vValue || "");
            return sText.toLowerCase().indexOf(String(sNeedle).toLowerCase()) !== -1;
        },

        _templateMatchesContext: function (oTemplate) {
            const oContext = this.getView().getModel("app").getProperty("/appContext") || {};
            const sContext = oContext.context;
            const sCategory = oContext.category;
            const sHaystack = [
                oTemplate.contentType,
                oTemplate.category,
                (oTemplate.categories || []).join(" "),
                oTemplate.description,
                oTemplate.name,
                oTemplate.contractType,
                JSON.stringify(oTemplate.metadata || {})
            ].join(" ").toLowerCase();

            if (sCategory && sHaystack.indexOf(sCategory.toLowerCase()) !== -1) {
                return true;
            }

            return !!sContext && sHaystack.indexOf(sContext.toLowerCase()) !== -1;
        },

        _profileAllowsTemplate: function (oTemplate, sProfile) {
            const sStatus = String(oTemplate.status || "").toUpperCase();

            switch (sProfile) {
                case "LEGAL_ADMIN":
                    return true;
                case "BUSINESS_USER":
                    return ["RELEASED", "APPROVED"].includes(sStatus);
                case "VIEWER":
                    return sStatus === "RELEASED";
                case "LEGAL_USER":
                default:
                    return sStatus !== "ARCHIVED";
            }
        },

        _applyTemplateFilters: function () {
            const oModel = this.getView().getModel("app");
            const oFilters = oModel.getProperty("/filters") || {};
            const aTemplates = oModel.getProperty("/templates") || [];
            const aBaseFiltered = aTemplates.filter(function (oTemplate) {
                const sFullText = [
                    oTemplate.name,
                    oTemplate.description,
                    oTemplate.contractType,
                    oTemplate.contentType,
                    oTemplate.governingLaw,
                    oTemplate.language,
                    oTemplate.status,
                    oTemplate.owner,
                    (oTemplate.categories || []).join(" ")
                ].join(" ");

                return this._textMatches(sFullText, oFilters.templateText) &&
                    this._textMatches(oTemplate.contentType, oFilters.templateContentType) &&
                    this._textMatches(oTemplate.governingLaw, oFilters.templateGoverningLaw) &&
                    this._textMatches(oTemplate.language, oFilters.templateLanguage) &&
                    this._textMatches(oTemplate.status, oFilters.templateStatus) &&
                    this._profileAllowsTemplate(oTemplate, oFilters.templateProfile);
            }.bind(this));
            const aContextFiltered = aBaseFiltered.filter(function (oTemplate) {
                const sContextText = [
                    oTemplate.contentType,
                    oTemplate.category,
                    oTemplate.description,
                    (oTemplate.categories || []).join(" ")
                ].join(" ");

                return this._textMatches(sContextText, oFilters.templateContext) &&
                    (!oFilters.templateCategory || String(oFilters.templateCategory).toLowerCase() === "todas" || this._textMatches([oTemplate.category, (oTemplate.categories || []).join(" ")].join(" "), oFilters.templateCategory));
            }.bind(this));
            const aFiltered = (oFilters.templateContext || oFilters.templateCategory) && aContextFiltered.length
                ? aContextFiltered
                : aBaseFiltered;

            aFiltered.sort(function (a, b) {
                return Number(b.recommendationState === "Success") - Number(a.recommendationState === "Success");
            });

            oModel.setProperty("/filteredTemplates", aFiltered);
            this._updateSummaryCards();
        },

        _applyClauseFilters: function () {
            const oModel = this.getView().getModel("app");
            const oFilters = oModel.getProperty("/filters") || {};
            const aClauses = oModel.getProperty("/clauses") || [];
            const aFiltered = aClauses.filter(function (oClause) {
                const sFullText = [
                    oClause.title,
                    oClause.description,
                    oClause.category,
                    (oClause.categories || []).join(" "),
                    oClause.status,
                    oClause.type,
                    oClause.class,
                    oClause.governingLaw,
                    oClause.language
                ].join(" ");

                return this._textMatches(sFullText, oFilters.clauseText) &&
                    this._textMatches([oClause.category, (oClause.categories || []).join(" ")].join(" "), oFilters.clauseCategory) &&
                    this._textMatches(oClause.status, oFilters.clauseStatus) &&
                    this._textMatches(oClause.type, oFilters.clauseType) &&
                    this._textMatches(oClause.class, oFilters.clauseClass) &&
                    this._textMatches(oClause.governingLaw, oFilters.clauseGoverningLaw) &&
                    this._textMatches(oClause.language, oFilters.clauseLanguage);
            }.bind(this));

            oModel.setProperty("/filteredClauses", aFiltered);
            oModel.setProperty("/clauseSummary", {
                total: aClauses.length,
                filtered: aFiltered.length
            });
            this._updateSummaryCards();
        },

        onTemplateFilterChange: function () {
            this._applyTemplateFilters();
        },

        onClauseFilterChange: function () {
            this._applyClauseFilters();
        },

        onClearTemplateFilters: function () {
            const oModel = this.getView().getModel("app");
            const oAppContext = oModel.getProperty("/appContext") || {};

            oModel.setProperty("/filters/templateText", "");
            oModel.setProperty("/filters/templateContext", oAppContext.context || "");
            oModel.setProperty("/filters/templateCategory", oAppContext.category || "");
            oModel.setProperty("/filters/templateContentType", "");
            oModel.setProperty("/filters/templateGoverningLaw", "");
            oModel.setProperty("/filters/templateLanguage", "");
            oModel.setProperty("/filters/templateStatus", "");
            oModel.setProperty("/filters/templateProfile", oAppContext.profile || "LEGAL_USER");
            this._applyTemplateFilters();
        },

        onClearClauseFilters: function () {
            const oModel = this.getView().getModel("app");
            const oAppContext = oModel.getProperty("/appContext") || {};

            oModel.setProperty("/filters/clauseText", "");
            oModel.setProperty("/filters/clauseCategory", oAppContext.category || "");
            oModel.setProperty("/filters/clauseStatus", "");
            oModel.setProperty("/filters/clauseType", "");
            oModel.setProperty("/filters/clauseClass", "");
            oModel.setProperty("/filters/clauseGoverningLaw", "");
            oModel.setProperty("/filters/clauseLanguage", "");
            this._applyClauseFilters();
        },

        _getContextFromEvent: function (oEvent) {
            let oControl = oEvent.getSource();

            while (oControl) {
                const oContext = oControl.getBindingContext("app");

                if (oContext) {
                    return oContext;
                }

                oControl = oControl.getParent && oControl.getParent();
            }

            return null;
        },

        _getTemplateFromEvent: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (!oContext) {
                throw new Error("No se pudo obtener el contexto de la plantilla");
            }

            return oContext.getObject();
        },

        onReload: function () {
            this._loadInitialData();
        },

        _refreshTemplatesAndRepository: async function () {
            await this._loadInitialData();
        },


        onGoToDocuments: function () {
            this.byId("mainTabs").setSelectedKey("documents");
        },

        onGoToTemplates: function () {
            this.byId("mainTabs").setSelectedKey("templates");
        },

        onGoToVirtualAssembly: function () {
            this.byId("mainTabs").setSelectedKey("virtual");
        },

        onCreateDocumentAction: function (oEvent) {
            const sKey = oEvent.getParameter("item") && oEvent.getParameter("item").getKey();

            if (sKey === "upload") {
                MessageBox.information("Carga de archivo reservada para una iteración posterior. Usa el repositorio para previsualizar/editar archivos existentes.");
                return;
            }

            this.onCreateFromTemplate();
        },

        onCreateFromTemplate: function () {
            const oModel = this.getView().getModel("app");
            const oContext = oModel.getProperty("/appContext") || {};
            const aTemplates = oModel.getProperty("/filteredTemplates") || [];
            const oDialogModel = new JSONModel({
                templates: aTemplates,
                selectedTemplate: aTemplates[0] || null,
                documentName: this._buildDefaultDocumentName(aTemplates[0], oContext),
                search: ""
            });
            const oList = new List({
                mode: "SingleSelectMaster",
                selectionChange: function (oEvent) {
                    const oItem = oEvent.getParameter("listItem");
                    const oTemplate = oItem && oItem.getBindingContext("createDoc").getObject();
                    oDialogModel.setProperty("/selectedTemplate", oTemplate || null);
                    oDialogModel.setProperty("/documentName", this._buildDefaultDocumentName(oTemplate, oContext));
                }.bind(this)
            });

            oList.setModel(oDialogModel, "createDoc");
            oList.bindItems({
                path: "createDoc>/templates",
                template: new StandardListItem({
                    title: "{createDoc>name}",
                    description: "{createDoc>description}",
                    info: "{createDoc>recommendationText}",
                    type: "Active"
                })
            });

            const oSearchInput = new Input({
                placeholder: "Buscar plantilla",
                liveChange: function (oEvent) {
                    const sValue = oEvent.getParameter("value");
                    const aBaseTemplates = oModel.getProperty("/filteredTemplates") || [];
                    const aDialogTemplates = aBaseTemplates.filter(function (oTemplate) {
                        return this._textMatches([
                            oTemplate.name,
                            oTemplate.description,
                            oTemplate.category,
                            (oTemplate.categories || []).join(" ")
                        ].join(" "), sValue);
                    }.bind(this));

                    oDialogModel.setProperty("/templates", aDialogTemplates);
                    oDialogModel.setProperty("/selectedTemplate", aDialogTemplates[0] || null);
                    oDialogModel.setProperty("/documentName", this._buildDefaultDocumentName(aDialogTemplates[0], oContext));
                }.bind(this)
            });

            const oDocumentNameInput = new Input({
                value: "{createDoc>/documentName}",
                placeholder: "Nombre del documento"
            });
            oDocumentNameInput.setModel(oDialogModel, "createDoc");

            const oSelectedTitle = new Text({
                text: "{= ${createDoc>/selectedTemplate/name} || 'Selecciona una plantilla' }"
            });
            oSelectedTitle.setModel(oDialogModel, "createDoc");

            const oSelectedDescription = new Text({
                text: "{= ${createDoc>/selectedTemplate/description} || 'El panel mostrará metadata, versión, estado, variables y coincidencia de contexto.' }"
            });
            oSelectedDescription.setModel(oDialogModel, "createDoc");

            const oDialog = new Dialog({
                title: "Crear documento a partir de plantilla",
                contentWidth: "980px",
                contentHeight: "760px",
                verticalScrolling: true,
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        items: [
                            new ObjectStatus({
                                text: "Transacción " + oContext.legalTransactionId + " · " + oContext.context + (oContext.category ? " · " + oContext.category : ""),
                                state: "Information"
                            }).addStyleClass("sapUiSmallMarginBottom"),
                            oSearchInput,
                            new HBox({
                                wrap: "Wrap",
                                items: [
                                    new ObjectStatus({ text: "Contexto: " + (oContext.context || "N/D"), state: "Information" }).addStyleClass("sapUiTinyMarginEnd"),
                                    new ObjectStatus({ text: "Categoría: " + (oContext.category || "Todas"), state: "Information" }).addStyleClass("sapUiTinyMarginEnd"),
                                    new ObjectStatus({ text: "Perfil: " + (oContext.profile || "N/D"), state: "Warning" })
                                ]
                            }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
                            new HBox({
                                width: "100%",
                                items: [
                                    new VBox({ width: "55%", items: [new Title({ text: "Plantillas disponibles", level: "H4" }), oList] }).addStyleClass("sapUiSmallMarginEnd"),
                                    new VBox({
                                        width: "45%",
                                        items: [
                                            new Title({ text: "Detalle de plantilla", level: "H4" }),
                                            oSelectedTitle,
                                            oSelectedDescription,
                                            new Text({ text: "Campos automáticos: contexto, categoría, contract ID y perfil se enviarán al formulario dinámico." }).addStyleClass("sapUiSmallMarginTop"),
                                            new Label({ text: "Nombre del documento" }).addStyleClass("sapUiSmallMarginTop"),
                                            oDocumentNameInput
                                        ]
                                    }).addStyleClass("gpcEcmCard")
                                ]
                            })
                        ]
                    }).addStyleClass("gpcContractFormContent")
                ],
                beginButton: new Button({
                    text: "Crear documento",
                    type: "Emphasized",
                    icon: "sap-icon://add-document",
                    press: async function () {
                        const oTemplate = oDialogModel.getProperty("/selectedTemplate");

                        if (!oTemplate) {
                            MessageBox.warning("Selecciona una plantilla.");
                            return;
                        }

                        oDialog.close();
                        const oVariablesInfo = await this._loadTemplateVariables(oTemplate.templateId);
                        this._openDynamicFormDialog(oTemplate, oVariablesInfo.variables || []);
                    }.bind(this)
                }),
                endButton: new Button({
                    text: "Cancelar",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.open();
        },

        _buildDefaultDocumentName: function (oTemplate, oContext) {
            if (!oTemplate) {
                return "";
            }

            return [
                oContext.legalTransactionId || "CONTRATO",
                oTemplate.contractType || oTemplate.name,
                oTemplate.version || "v000"
            ].join("_");
        },

        onDocumentAction: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (!oContext) {
                return;
            }

            this._openDocumentDetailDialog(oContext.getObject());
        },

        onDocumentPreview: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (oContext) {
                this._previewRepositoryFile(this._toRepositoryFileItem(oContext.getObject()));
            }
        },

        onDocumentDownload: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (oContext) {
                this._downloadRepositoryFile(this._toRepositoryFileItem(oContext.getObject()));
            }
        },

        onDocumentEdit: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (oContext) {
                this._editRepositoryFile(this._toRepositoryFileItem(oContext.getObject()));
            }
        },

        onDocumentVersions: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (oContext) {
                this._openDocumentDetailDialog(oContext.getObject(), "files");
            }
        },

        onDocumentAssembly: function (oEvent) {
            const oContext = this._getContextFromEvent(oEvent);

            if (oContext) {
                this._selectDocumentForAssembly(oContext.getObject());
                this.onGoToVirtualAssembly();
            }
        },

        onLoadMoreDocuments: async function () {
            const oModel = this.getView().getModel("app");
            const aCurrent = oModel.getProperty("/documents") || [];

            try {
                this._setBusinessDocuments(await this._loadBusinessDocuments({ offset: aCurrent.length, limit: 20 }), true);
                this._updateSummaryCards();
            } catch (oError) {
                MessageBox.error("No se pudieron cargar más documentos:\n\n" + oError.message);
            }
        },

        onRefreshVirtualDocument: async function () {
            await this._refreshVirtualDocument({
                setBusy: function () {}
            });
        },

        onSelectedAssemblyDocumentPreview: function () {
            const oModel = this.getView().getModel("app");
            const oSelectedDocument = oModel.getProperty("/selectedDocument");
            const oVirtualDisplay = oModel.getProperty("/virtualDisplay/header") || {};

            if (oSelectedDocument) {
                this._previewRepositoryFile(this._toRepositoryFileItem(oSelectedDocument));
                return;
            }

            if (oVirtualDisplay.documentPath) {
                this._previewRepositoryFile({
                    relativePath: oVirtualDisplay.documentPath,
                    extension: oVirtualDisplay.documentPath.slice(oVirtualDisplay.documentPath.lastIndexOf("."))
                });
                return;
            }

            const sDocxUrl = oModel.getProperty("/lastGeneration/docxUrl");

            if (sDocxUrl) {
                window.open(sDocxUrl, "_blank");
                return;
            }

            MessageBox.warning("No hay archivo de documento disponible para previsualizar.");
        },

        onSelectedAssemblyDocumentDetail: function () {
            const oSelectedDocument = this.getView().getModel("app").getProperty("/selectedDocument");

            if (oSelectedDocument) {
                this._openDocumentDetailDialog(oSelectedDocument);
                return;
            }

            this.onGoToDocuments();
            MessageToast.show("Selecciona un documento de la lista para abrir su detalle.");
        },

        _createRelatedFilesTable: function (oDocument) {
            const aFiles = (oDocument.relatedFiles || []).slice(0, 20);

            if (!aFiles.length) {
                return new VBox({ items: [new Text({ text: "No hay archivos relacionados para este documento." })] }).addStyleClass("sapUiSmallMargin");
            }

            return new Table({
                columns: [
                    new Column({ header: new Text({ text: "Tipo" }) }),
                    new Column({ header: new Text({ text: "Ruta" }) }),
                    new Column({ header: new Text({ text: "Fecha" }) }),
                    new Column({ header: new Text({ text: "Acciones" }) })
                ],
                items: aFiles.map(function (oFile) {
                    return new ColumnListItem({
                        cells: [
                            new ObjectStatus({ text: oFile.type || oFile.fileType || "N/D", state: oFile.isMetadata ? "None" : "Information" }),
                            new Text({ text: oFile.relativePath || "N/D" }),
                            new Text({ text: this._formatDateTime(oFile.modifiedAt) }),
                            new HBox({
                                renderType: "Bare",
                                items: [
                                    new Button({
                                        text: "Vista previa",
                                        icon: "sap-icon://show",
                                        type: "Transparent",
                                        enabled: !oFile.isMetadata,
                                        press: function () { this._previewRepositoryFile(this._toRepositoryFileItem(oDocument, oFile)); }.bind(this)
                                    }),
                                    new Button({
                                        text: "Descargar",
                                        icon: "sap-icon://download",
                                        type: "Transparent",
                                        press: function () { this._downloadRepositoryFile(this._toRepositoryFileItem(oDocument, oFile)); }.bind(this)
                                    })
                                ]
                            })
                        ]
                    });
                }.bind(this))
            });
        },

        _openDocumentDetailDialog: function (oItem, sInitialTabKey) {
            const oModel = this.getView().getModel("app");
            oModel.setProperty("/selectedDocument", oItem);

            const fnText = function (sLabel, vValue) {
                return new Text({ text: sLabel + ": " + this._formatValueForDisplay(vValue) });
            }.bind(this);
            const oInfoTab = new IconTabFilter({
                key: "info",
                text: "Información",
                content: [new VBox({
                    items: [
                        fnText("Nombre", oItem.displayName || oItem.name),
                        fnText("documentId", oItem.documentId),
                        fnText("relativePath", oItem.relativePath),
                        fnText("contractNumber", oItem.contractNumber),
                        fnText("templateId", oItem.templateId),
                        fnText("templateVersion", oItem.templateVersion),
                        fnText("fileType", oItem.fileType),
                        fnText("contentType", oItem.contentType),
                        fnText("category", oItem.category),
                        fnText("language", oItem.language),
                        fnText("status", oItem.status),
                        fnText("assemblyStatus", oItem.assemblyStatus),
                        fnText("generatedAt", oItem.generatedAt),
                        fnText("modifiedAt", oItem.modifiedAt),
                        fnText("primaryFile", oItem.primaryFile && oItem.primaryFile.relativePath)
                    ]
                }).addStyleClass("sapUiSmallMargin")]
            });
            const oFilesTab = new IconTabFilter({
                key: "files",
                text: "Archivos relacionados",
                content: [this._createRelatedFilesTable(oItem)]
            });
            const oDocumentVirtual = this._buildVirtualDocumentFromDocument(oItem);
            const oVariablesTab = new IconTabFilter({
                key: "variables",
                text: "Variables SAP / Campos de usuario",
                content: [
                    this._createKeyValueTable(
                        "Variables SAP",
                        this._normalizeVariablesForDisplay(oDocumentVirtual.variables || {}, oDocumentVirtual.variableDefinitions || [], oDocumentVirtual.values || {}),
                        "No hay variables SAP registradas para este documento."
                    ),
                    this._createKeyValueTable(
                        "Campos de usuario",
                        this._normalizeInputFieldsForDisplay(oDocumentVirtual.inputFields || {}, oDocumentVirtual.variableDefinitions || [], oDocumentVirtual.values || {}),
                        "No hay campos de usuario registrados para este documento. La plantilla puede no requerir captura manual."
                    )
                ]
            });
            const oHistoryTab = new IconTabFilter({
                key: "history",
                text: "Historial",
                content: [
                    new Text({
                        text: "Historial funcional pendiente de persistencia. Por ahora se muestran archivos relacionados, generatedAt y modifiedAt como trazabilidad disponible."
                    }).addStyleClass("sapUiSmallMargin")
                ]
            });
            const oSignatureTab = new IconTabFilter({
                key: "signature",
                text: "e-Signature",
                content: [new Text({ text: "Placeholder de e-Signature: integración real fuera del alcance del MVP actual." }).addStyleClass("sapUiSmallMargin")]
            });
            const oTabBar = new IconTabBar({ items: [oInfoTab, oFilesTab, oVariablesTab, oHistoryTab, oSignatureTab] });

            if (sInitialTabKey) {
                oTabBar.setSelectedKey(sInitialTabKey);
            }

            const oDialog = new Dialog({
                title: oItem.displayName || oItem.name || "Detalle de documento",
                contentWidth: "980px",
                contentHeight: "700px",
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        items: [
                            new HBox({
                                wrap: "Wrap",
                                items: [
                                    new ObjectStatus({ text: "Estado: " + (oItem.status || "N/D"), state: oItem.statusState || "Information" }).addStyleClass("sapUiTinyMarginEnd"),
                                    new ObjectStatus({ text: "Ensamblaje: " + (oItem.assemblyStatus || "N/D"), state: oItem.assemblyState || "Information" })
                                ]
                            }).addStyleClass("sapUiSmallMarginBottom"),
                            new HBox({
                                wrap: "Wrap",
                                items: [
                                    new Button({ text: "Descargar", icon: "sap-icon://download", press: function () { this._downloadRepositoryFile(this._toRepositoryFileItem(oItem)); }.bind(this) }).addStyleClass("sapUiTinyMarginEnd"),
                                    new Button({ text: "Vista previa", icon: "sap-icon://show", press: function () { this._previewRepositoryFile(this._toRepositoryFileItem(oItem)); }.bind(this) }).addStyleClass("sapUiTinyMarginEnd"),
                                    new Button({ text: "Editar RichText", icon: "sap-icon://edit", press: function () { this._editRepositoryFile(this._toRepositoryFileItem(oItem)); }.bind(this) }).addStyleClass("sapUiTinyMarginEnd"),
                                    new Button({ text: "Versiones", icon: "sap-icon://history", press: function () { oTabBar.setSelectedKey("files"); } }).addStyleClass("sapUiTinyMarginEnd"),
                                    new Button({ text: "Ver ensamblaje", icon: "sap-icon://synchronize", type: "Emphasized", press: function () {
                                        this._selectDocumentForAssembly(oItem);
                                        this.onGoToVirtualAssembly();
                                        oDialog.close();
                                    }.bind(this) })
                                ]
                            }).addStyleClass("sapUiSmallMarginBottom"),
                            oTabBar
                        ]
                    }).addStyleClass("gpcContractFormContent")
                ],
                endButton: new Button({ text: "Cerrar", press: function () { oDialog.close(); } }),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.open();
        },

        onRepositoryItemPress: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("app");

            if (!oContext) {
                return;
            }

            const oItem = oContext.getObject();

            if (oItem.type === "folder") {
                MessageBox.information(
                    "Carpeta del repositorio:\n\n" +
                    oItem.relativePath
                );
                return;
            }

            const sExtension = (oItem.extension || "").toLowerCase();

            const aActions = ["Vista previa"];

            if (sExtension === ".docx" || sExtension === ".html") {
                aActions.push("Editar HTML");
            }

            aActions.push("Descargar", MessageBox.Action.CLOSE);

            MessageBox.information(
                "Archivo del repositorio:\n\n" +
                oItem.name +
                "\n\nRuta:\n" +
                oItem.relativePath +
                "\n\nModificado:\n" +
                (oItem.modifiedAt || "N/D"),
                {
                    actions: aActions,
                    emphasizedAction: "Vista previa",
                    onClose: function (sAction) {
                        if (sAction === "Vista previa") {
                            this._previewRepositoryFile(oItem);
                        }

                        if (sAction === "Editar HTML") {
                            this._editRepositoryFile(oItem);
                        }

                        if (sAction === "Descargar") {
                            this._downloadRepositoryFile(oItem);
                        }
                    }.bind(this)
                }
            );
        },

        _downloadRepositoryFile: function (oItem) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            const sDownloadUrl =
                sApiBaseUrl +
                "/api/files/download?path=" +
                encodeURIComponent(oItem.relativePath);

            window.open(sDownloadUrl, "_blank");
        },

        _previewRepositoryFile: async function (oItem) {
            const sExtension = (oItem.extension || "").toLowerCase();

            if (sExtension === ".pdf") {
                this._previewPdf(oItem);
                return;
            }

            if (sExtension === ".docx") {
                await this._previewDocx(oItem);
                return;
            }

            if (sExtension === ".html") {
                await this._previewEditableHtml(oItem);
                return;
            }

            if ([".json", ".txt", ".xml", ".csv", ".md"].includes(sExtension)) {
                await this._previewTextFile(oItem);
                return;
            }

            MessageBox.information(
                "No hay vista previa disponible para este tipo de archivo.\n\n" +
                "Archivo: " + oItem.name
            );
        },

        _previewPdf: function (oItem) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            const sInlineUrl =
                sApiBaseUrl +
                "/api/files/inline?path=" +
                encodeURIComponent(oItem.relativePath);

            const oHtml = new HTML({
                content:
                    "<iframe " +
                    "src='" + sInlineUrl + "' " +
                    "style='width:100%;height:70vh;border:0;'>" +
                    "</iframe>"
            });

            const oDialog = new Dialog({
                title: "Vista previa PDF - " + oItem.name,
                contentWidth: "90%",
                contentHeight: "80%",
                resizable: true,
                draggable: true,
                content: [oHtml],
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },


        _previewDocx: async function (oItem) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            try {
                const oResult = await this._fetchJson(
                    sApiBaseUrl +
                    "/api/files/preview/docx?path=" +
                    encodeURIComponent(oItem.relativePath)
                );

                const sContentId = "gpcDocxPreview_" + Date.now();

                const oHtml = new HTML({
                    sanitizeContent: false,
                    content:
                        "<div style='padding:1rem;font-family:Arial, sans-serif;line-height:1.5;'>" +
                        "<h3>" + this._escapeHtml(oItem.name) + "</h3>" +
                        "<div id='" + sContentId + "'></div>" +
                        "</div>"
                });

                const oDialog = new Dialog({
                    title: "Vista previa DOCX",
                    contentWidth: "900px",
                    contentHeight: "700px",
                    verticalScrolling: true,
                    resizable: true,
                    draggable: true,
                    content: [oHtml],
                    beginButton: new Button({
                        text: "Descargar",
                        press: function () {
                            this._downloadRepositoryFile(oItem);
                        }.bind(this)
                    }),
                    endButton: new Button({
                        text: "Cerrar",
                        press: function () {
                            oDialog.close();
                        }
                    }),
                    afterOpen: function () {
                        const oContainer = document.getElementById(sContentId);

                        if (oContainer) {
                            oContainer.innerHTML = oResult.html || "<p>Sin contenido para mostrar.</p>";
                        }
                    },
                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                oDialog.open();
            } catch (oError) {
                MessageBox.error("No se pudo previsualizar el DOCX:\n\n" + oError.message);
            }
        },

        _previewEditableHtml: async function (oItem) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            try {
                const oResult = await this._fetchJson(
                    sApiBaseUrl +
                    "/api/files/edit/html?path=" +
                    encodeURIComponent(oItem.relativePath)
                );

                const sContentId = "gpcHtmlPreview_" + Date.now();

                const oHtml = new HTML({
                    sanitizeContent: false,
                    content:
                        "<div style='padding:1rem;font-family:Arial, sans-serif;line-height:1.5;'>" +
                        "<h3>" + this._escapeHtml(oItem.name) + "</h3>" +
                        "<div id='" + sContentId + "'></div>" +
                        "</div>"
                });

                const oDialog = new Dialog({
                    title: "Vista previa HTML",
                    contentWidth: "900px",
                    contentHeight: "700px",
                    verticalScrolling: true,
                    resizable: true,
                    draggable: true,
                    content: [oHtml],
                    beginButton: new Button({
                        text: "Editar",
                        type: "Emphasized",
                        press: function () {
                            oDialog.close();
                            this._editRepositoryFile(oItem);
                        }.bind(this)
                    }),
                    endButton: new Button({
                        text: "Cerrar",
                        press: function () {
                            oDialog.close();
                        }
                    }),
                    afterOpen: function () {
                        const oContainer = document.getElementById(sContentId);

                        if (oContainer) {
                            oContainer.innerHTML = oResult.html || "<p>Sin contenido para mostrar.</p>";
                        }
                    },
                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                oDialog.open();
            } catch (oError) {
                MessageBox.error("No se pudo previsualizar el HTML:\n\n" + oError.message);
            }
        },

        _previewTextFile: async function (oItem) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            try {
                const oResult = await this._fetchJson(
                    sApiBaseUrl +
                    "/api/files/preview/text?path=" +
                    encodeURIComponent(oItem.relativePath)
                );

                const sText = this._escapeHtml(oResult.text);

                const oHtml = new HTML({
                    content:
                        "<pre style='padding:1rem;white-space:pre-wrap;font-family:monospace;'>" +
                        sText +
                        "</pre>"
                });

                const oDialog = new Dialog({
                    title: "Vista previa - " + oItem.name,
                    contentWidth: "900px",
                    contentHeight: "700px",
                    verticalScrolling: true,
                    resizable: true,
                    draggable: true,
                    content: [oHtml],
                    endButton: new Button({
                        text: "Cerrar",
                        press: function () {
                            oDialog.close();
                        }
                    }),
                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                oDialog.open();
            } catch (oError) {
                MessageBox.error("No se pudo previsualizar el archivo:\n\n" + oError.message);
            }
        },

        onShowVariables: async function (oEvent) {
            try {
                const oTemplate = this._getTemplateFromEvent(oEvent);
                const oVariablesInfo = await this._loadTemplateVariables(oTemplate.templateId);

                const sVariables = oVariablesInfo.variables
                    .map(function (oVariable) {
                        return "- " + oVariable.name + " (" + oVariable.ecaType + " / " + oVariable.source + ")";
                    })
                    .join("\n");

                MessageBox.information(
                    "Variables requeridas por la plantilla:\n\n" +
                    oTemplate.name +
                    "\n\n" +
                    sVariables
                );
            } catch (oError) {
                MessageBox.error(oError.message);
            }
        },

        onUseTemplate: async function (oEvent) {
            try {
                const oTemplate = this._getTemplateFromEvent(oEvent);
                const oVariablesInfo = await this._loadTemplateVariables(oTemplate.templateId);

                this._openDynamicFormDialog(oTemplate, oVariablesInfo.variables);
            } catch (oError) {
                MessageBox.error(oError.message);
            }
        },

        _labelForAction: function (sAction) {
            const ACTION_LABELS = {
                SEND_FOR_APPROVAL: "Enviar aprobación",
                APPROVE: "Aprobar",
                RELEASE: "Liberar",
                APPROVE_AND_RELEASE: "Aprobar + liberar",
                REOPEN: "Reabrir",
                ARCHIVE: "Archivar",
                CREATE_NEW_VERSION: "Crear versión",
                CREATE_VARIANT: "Crear variante",
                RESTORE: "Restaurar"
            };

            return ACTION_LABELS[sAction] || sAction;
        },

        onOpenTemplateProperties: async function (oEvent) {
            try {
                const oTemplate = this._getTemplateFromEvent(oEvent);
                const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
                const oDetail = await this._fetchJson(
                    sApiBaseUrl + "/api/templates/" + encodeURIComponent(oTemplate.templateId)
                );

                this._openTemplatePropertiesDialog(oDetail.template, oDetail.variables || []);
            } catch (oError) {
                MessageBox.error("No se pudieron abrir las propiedades:\n\n" + oError.message);
            }
        },

        onManageClauses: async function () {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            try {
                const oResult = await this._fetchJson(sApiBaseUrl + "/api/clauses?includeHtml=true");
                this._openClausesManagementDialog(oResult.clauses || []);
            } catch (oError) {
                MessageBox.error("No se pudo cargar la biblioteca de cláusulas:\n\n" + oError.message);
            }
        },

        _openClausesManagementDialog: function (aClauses) {
            const sManagerId = "gpcClauseManager_" + Date.now();
            let aCurrentClauses = this._decorateClauses(aClauses || []);
            let sSelectedClauseId = aCurrentClauses[0] && aCurrentClauses[0].clauseId;
            const bCanInsertInActiveEditor = !!(this._activeRichTextEditorId && this._rteEditors && this._rteEditors[this._activeRichTextEditorId]);

            const fnGetClauseById = function (sClauseId) {
                return (aCurrentClauses || []).find(function (oClause) {
                    return oClause.clauseId === sClauseId;
                });
            };

            const fnActionButton = function (oClause, sAction, sGroupClass) {
                return [
                    "<button type='button' class='gpcClauseAction ", sGroupClass || "", "' data-action='", this._escapeHtml(sAction), "' data-clause-id='", this._escapeHtml(oClause.clauseId), "'>",
                    this._escapeHtml(this._labelForAction(sAction)),
                    "</button>"
                ].join("");
            }.bind(this);

            const fnRenderMeta = function (sLabel, vValue) {
                const sValue = Array.isArray(vValue) ? vValue.join(", ") : vValue;

                return [
                    "<div class='gpcClauseDetailMetaItem'><span>", this._escapeHtml(sLabel), "</span><strong>",
                    this._escapeHtml(sValue || "N/D"),
                    "</strong></div>"
                ].join("");
            }.bind(this);

            const fnRender = function () {
                const oSelectedClause = fnGetClauseById(sSelectedClauseId) || aCurrentClauses[0];

                if (oSelectedClause) {
                    sSelectedClauseId = oSelectedClause.clauseId;
                }

                const sMasterItems = (aCurrentClauses || []).map(function (oClause) {
                    return [
                        "<button type='button' class='gpcClauseMasterItem ", oClause.clauseId === sSelectedClauseId ? "isSelected" : "", "' ",
                        "data-action='select' data-clause-id='", this._escapeHtml(oClause.clauseId), "' ",
                        "data-search='", this._escapeHtml([oClause.title, oClause.description, oClause.category, oClause.status, oClause.class, oClause.type, oClause.governingLaw, oClause.language].join(" ").toLowerCase()), "' ",
                        "data-category='", this._escapeHtml([oClause.category, (oClause.categories || []).join(" ")].join(" ").toLowerCase()), "' ",
                        "data-status='", this._escapeHtml(String(oClause.status || "").toLowerCase()), "' ",
                        "data-class='", this._escapeHtml(String(oClause.class || "").toLowerCase()), "' ",
                        "data-type='", this._escapeHtml(String(oClause.type || "").toLowerCase()), "' ",
                        "data-law='", this._escapeHtml(String(oClause.governingLaw || "").toLowerCase()), "' ",
                        "data-language='", this._escapeHtml(String(oClause.language || "").toLowerCase()), "'>",
                        "<span class='gpcClauseMasterTitle'>", this._escapeHtml(oClause.title || oClause.clauseId), "</span>",
                        "<span class='gpcClauseMasterMeta'>", this._escapeHtml(oClause.version || "N/D"), " · ", this._escapeHtml(oClause.category || "N/D"), "</span>",
                        "<span class='gpcClauseMasterMeta'>", this._escapeHtml(oClause.class || "N/D"), " / ", this._escapeHtml(oClause.type || "N/D"), "</span>",
                        "<span class='gpcManagerBadge'>", this._escapeHtml(oClause.statusLabel || oClause.status || "N/D"), "</span>",
                        "</button>"
                    ].join("");
                }.bind(this)).join("");

                const aAvailableActions = (oSelectedClause && oSelectedClause.availableActions) || [];
                const aLifecycleActions = ["SEND_FOR_APPROVAL", "APPROVE", "RELEASE", "APPROVE_AND_RELEASE", "REOPEN", "ARCHIVE"].filter(function (sAction) {
                    return aAvailableActions.includes(sAction);
                });
                const aVersionActions = ["CREATE_NEW_VERSION", "CREATE_VARIANT"].filter(function (sAction) {
                    return aAvailableActions.includes(sAction);
                });
                const sInsertButton = bCanInsertInActiveEditor
                    ? fnActionButton(oSelectedClause || {}, "insert", "gpcClauseContentAction")
                    : "<button type='button' class='gpcClauseAction gpcClauseActionDisabled' disabled title='Disponible al editar una plantilla o documento.'>Insertar en editor</button>";
                const sPreviewHtml = oSelectedClause && oSelectedClause.html
                    ? oSelectedClause.html
                    : "<p class='gpcEmptyPreview'>Sin contenido disponible para previsualizar.</p>";
                const sDetail = oSelectedClause
                    ? [
                        "<section class='gpcClauseDetail'>",
                        "<div class='gpcClauseDetailHeader'><div><h3>", this._escapeHtml(oSelectedClause.title || "Cláusula (text block)"), "</h3><p>", this._escapeHtml(oSelectedClause.clauseId || "N/D"), "</p></div><span class='gpcManagerBadge'>", this._escapeHtml(oSelectedClause.statusLabel || oSelectedClause.status || "N/D"), "</span></div>",
                        "<div class='gpcClauseDetailMetaGrid'>",
                        fnRenderMeta("ID cláusula", oSelectedClause.clauseId),
                        fnRenderMeta("Versión / revisión", [oSelectedClause.version || "N/D", oSelectedClause.revision || "N/D"].join(" / ")),
                        fnRenderMeta("Estado", oSelectedClause.statusLabel || oSelectedClause.status),
                        fnRenderMeta("Clase", oSelectedClause.class),
                        fnRenderMeta("Tipo", oSelectedClause.type),
                        fnRenderMeta("Categorías", oSelectedClause.categories && oSelectedClause.categories.length ? oSelectedClause.categories : oSelectedClause.category),
                        fnRenderMeta("Ley aplicable", oSelectedClause.governingLaw),
                        fnRenderMeta("Idioma", oSelectedClause.language),
                        fnRenderMeta("Responsable", oSelectedClause.owner || "GPC Legal"),
                        fnRenderMeta("Vigencia", [oSelectedClause.validFrom || "N/D", oSelectedClause.validTo || "N/D"].join(" / ")),
                        fnRenderMeta("Variante de", oSelectedClause.variantsOf),
                        fnRenderMeta("Creada desde", oSelectedClause.createdFrom),
                        fnRenderMeta("Ruta técnica", oSelectedClause.sourcePath || oSelectedClause.path || oSelectedClause.relativePath),
                        "</div>",
                        "<h4>Vista previa</h4><div class='gpcClausePreview'>", sPreviewHtml, "</div>",
                        "<div class='gpcClauseActions'>",
                        "<section><h4>A. Estado y aprobación</h4><div>", aLifecycleActions.map(function (sAction) { return fnActionButton(oSelectedClause, sAction, "gpcClauseLifecycle"); }).join("") || "<span class='gpcClauseEmptyAction'>Sin acciones de estado disponibles para esta cláusula.</span>", "</div></section>",
                        "<section><h4>B. Versionado</h4><div>", aVersionActions.map(function (sAction) { return fnActionButton(oSelectedClause, sAction, "gpcClauseVersionAction"); }).join("") || "<span class='gpcClauseEmptyAction'>Sin acciones de versionado disponibles.</span>", "</div></section>",
                        "<section><h4>C. Contenido</h4><div>", fnActionButton(oSelectedClause, "preview", "gpcClauseContentAction"), sInsertButton, "</div></section>",
                        "</div></section>"
                    ].join("")
                    : "<section class='gpcClauseDetail'><p>No hay cláusulas disponibles.</p></section>";

                return [
                    "<div class='gpcClauseManagerShell'>",
                    "<header class='gpcClauseManagerHeader'><div><h2>Gestionar cláusulas (text blocks)</h2><p>Biblioteca central de cláusulas (text blocks) y bloques de firma</p></div><div class='gpcClauseHeaderStats'><span class='gpcManagerBadge'>Total: ", String((aCurrentClauses || []).length), "</span><button type='button' class='gpcClauseCloseButton' data-action='close'>Cerrar</button></div></header>",
                    "<section class='gpcClauseManagerFilters'><input data-filter='q' placeholder='Buscar'><input data-filter='category' placeholder='Categoría'><input data-filter='status' placeholder='Estado'><input data-filter='class' placeholder='Clase'><input data-filter='type' placeholder='Tipo'><input data-filter='law' placeholder='Ley'><input data-filter='language' placeholder='Idioma'><button type='button' data-action='clear-filters'>Limpiar filtros</button></section>",
                    "<section class='gpcClauseManagerLayout'><aside><div class='gpcClauseFilteredCounter' data-filtered-counter>Filtradas: ", String((aCurrentClauses || []).length), "</div><div class='gpcClauseManagerList'>", sMasterItems || "<p>No hay cláusulas disponibles.</p>", "</div></aside>",
                    sDetail,
                    "</section></div>"
                ].join("");
            }.bind(this);

            const oHtml = new HTML({ sanitizeContent: false, content: "<div id='" + sManagerId + "' class='gpcClauseManager'>" + fnRender() + "</div>" });

            const oDialog = new Dialog({
                title: "Gestionar cláusulas (text blocks)",
                contentWidth: "88rem",
                contentHeight: "42rem",
                resizable: true,
                draggable: true,
                verticalScrolling: false,
                content: [oHtml],
                afterOpen: function () {
                    const oRoot = document.getElementById(sManagerId);
                    const fnApplyFilters = function () {
                        const aInputs = Array.from(oRoot.querySelectorAll("[data-filter]"));
                        const mFilters = aInputs.reduce(function (mValues, oInput) {
                            mValues[oInput.getAttribute("data-filter")] = String(oInput.value || "").toLowerCase();
                            return mValues;
                        }, {});
                        let iVisible = 0;

                        Array.from(oRoot.querySelectorAll(".gpcClauseMasterItem")).forEach(function (oItem) {
                            const bVisible = Object.keys(mFilters).every(function (sKey) {
                                const sTarget = sKey === "q"
                                    ? (oItem.getAttribute("data-search") || "")
                                    : (oItem.getAttribute("data-" + sKey) || "");

                                return !mFilters[sKey] || sTarget.indexOf(mFilters[sKey]) !== -1;
                            });

                            oItem.style.display = bVisible ? "flex" : "none";
                            if (bVisible) {
                                iVisible += 1;
                            }
                        });

                        const oCounter = oRoot.querySelector("[data-filtered-counter]");
                        if (oCounter) {
                            oCounter.textContent = "Filtradas: " + iVisible;
                        }
                    };
                    const fnRerender = function () {
                        const mFilterValues = Array.from(oRoot.querySelectorAll("[data-filter]")).reduce(function (mValues, oInput) {
                            mValues[oInput.getAttribute("data-filter")] = oInput.value || "";
                            return mValues;
                        }, {});

                        oRoot.innerHTML = fnRender();
                        Array.from(oRoot.querySelectorAll("[data-filter]")).forEach(function (oInput) {
                            oInput.value = mFilterValues[oInput.getAttribute("data-filter")] || "";
                        });
                        fnApplyFilters();
                    };

                    oRoot.addEventListener("input", fnApplyFilters);
                    oRoot.addEventListener("click", async function (oEvent) {
                        const oButton = oEvent.target.closest("[data-action]");
                        const sAction = oButton && oButton.getAttribute("data-action");
                        const sClauseId = oButton && oButton.getAttribute("data-clause-id");

                        if (!sAction) {
                            return;
                        }

                        if (sAction === "close") {
                            oDialog.close();
                            return;
                        }

                        if (sAction === "clear-filters") {
                            Array.from(oRoot.querySelectorAll("[data-filter]")).forEach(function (oInput) { oInput.value = ""; });
                            fnApplyFilters();
                            return;
                        }

                        if (sAction === "select" && sClauseId) {
                            sSelectedClauseId = sClauseId;
                            fnRerender();
                            return;
                        }

                        if (!sClauseId) {
                            return;
                        }

                        const oClause = fnGetClauseById(sClauseId);

                        if (sAction === "preview") {
                            this._previewClause(oClause);
                            return;
                        }

                        if (sAction === "insert") {
                            if (!bCanInsertInActiveEditor) {
                                MessageToast.show("Disponible al editar una plantilla o documento.");
                                return;
                            }

                            this._insertClauseInEditor(this._activeRichTextEditorId, oClause);
                            MessageToast.show("Cláusula insertada: " + (oClause.title || oClause.clauseId));
                            return;
                        }

                        const oResult = await this._executeClauseManagerAction(sClauseId, sAction, oDialog);
                        if (!oResult) {
                            return;
                        }

                        const oNewClause = oResult && (oResult.newClause || oResult.clause);
                        sSelectedClauseId = (oNewClause && oNewClause.clauseId) || sClauseId;
                        aCurrentClauses = await this._refreshClausesOnly({ includeHtml: true });
                        if (!fnGetClauseById(sSelectedClauseId) && aCurrentClauses[0]) {
                            sSelectedClauseId = aCurrentClauses[0].clauseId;
                        }
                        fnRerender();
                    }.bind(this));
                    fnApplyFilters();
                }.bind(this),
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.open();
        },

        _refreshClausesOnly: async function (oOptions) {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");
            const oAppContext = oModel.getProperty("/appContext") || {};
            const bIncludeHtml = !!(oOptions && oOptions.includeHtml);
            const oClauses = await this._fetchJson(sApiBaseUrl + "/api/clauses" + this._buildQueryString({
                category: oAppContext.category,
                includeHtml: bIncludeHtml ? "true" : ""
            }));
            const aClauses = this._decorateClauses(oClauses.clauses || []);

            oModel.setProperty("/clauses", aClauses);
            this._applyClauseFilters();
            this._updateSummaryCards();

            return aClauses;
        },

        _executeClauseManagerAction: async function (sClauseId, sAction, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
            let sUrl;

            if (sAction === "CREATE_NEW_VERSION") {
                sUrl = sApiBaseUrl + "/api/clauses/" + encodeURIComponent(sClauseId) + "/version";
            } else if (sAction === "CREATE_VARIANT") {
                sUrl = sApiBaseUrl + "/api/clauses/" + encodeURIComponent(sClauseId) + "/variant";
            } else {
                sUrl =
                    sApiBaseUrl +
                    "/api/clauses/" +
                    encodeURIComponent(sClauseId) +
                    "/actions/" +
                    encodeURIComponent(sAction);
            }

            try {
                oDialog.setBusy(true);
                const oResult = await this._fetchJson(sUrl, { method: "POST" });
                oDialog.setBusy(false);
                MessageToast.show(this._labelForAction(sAction) + " ejecutada");

                return oResult;
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo ejecutar la acción de cláusula:\n\n" + oError.message);
                return null;
            }
        },

        _openTemplatePropertiesDialog: function (oTemplate, aVariables) {
            const oInputs = {};
            const aFields = [
                ["name", "Nombre"],
                ["contentType", "Tipo documental"],
                ["categories", "Categorías"],
                ["governingLaw", "Ley aplicable"],
                ["language", "Idioma"],
                ["description", "Descripción"],
                ["validFrom", "Válido desde"],
                ["validTo", "Válido hasta"],
                ["owner", "Responsable"]
            ];

            const oBox = new VBox({ width: "100%" }).addStyleClass("sapUiMediumMargin");

            oBox.addItem(new ObjectStatus({
                text: "Estado: " + oTemplate.status,
                state: oTemplate.statusState || "None"
            }).addStyleClass("sapUiSmallMarginBottom"));

            oBox.addItem(new Text({
                text:
                    "Template ID: " + oTemplate.templateId +
                    "\nVersión: " + oTemplate.version +
                    " / Rev. " + oTemplate.revision +
                    "\nReemplazada por: " + (oTemplate.replacedBy || "N/D") +
                    "\nVariables detectadas: " + aVariables.length
            }).addStyleClass("sapUiSmallMarginBottom"));

            aFields.forEach(function (aField) {
                const sField = aField[0];
                const sLabel = aField[1];
                const vValue = sField === "categories"
                    ? (oTemplate.categories || []).join(", ")
                    : (oTemplate[sField] || "");

                oBox.addItem(new Label({ text: sLabel }).addStyleClass("sapUiSmallMarginTop"));

                const oInput = new Input({
                    value: vValue
                });

                oInputs[sField] = oInput;
                oBox.addItem(oInput);
            });

            oBox.addItem(new Text({
                text: "Acciones disponibles: " + ((oTemplate.availableActions || []).join(", ") || "Ninguna")
            }).addStyleClass("sapUiSmallMarginTop"));

            const oActionBox = new HBox({
                wrap: "Wrap",
                items: (oTemplate.availableActions || []).map(function (sAction) {
                    return new Button({
                        text: this._labelForAction(sAction),
                        type: sAction === "APPROVE_AND_RELEASE" || sAction === "RELEASE"
                            ? "Emphasized"
                            : "Transparent",
                        press: async function () {
                            await this._executeTemplateAction(oTemplate.templateId, sAction, oDialog);
                        }.bind(this)
                    }).addStyleClass("sapUiTinyMarginEnd");
                }.bind(this))
            }).addStyleClass("sapUiSmallMarginTop");

            oBox.addItem(oActionBox);

            const oDialog = new Dialog({
                title: "Propiedades y estado de plantilla",
                contentWidth: "720px",
                contentHeight: "760px",
                verticalScrolling: true,
                resizable: true,
                draggable: true,
                content: [oBox],
                beginButton: new Button({
                    text: "Guardar propiedades",
                    type: "Emphasized",
                    press: async function () {
                        await this._saveTemplateMetadata(oTemplate.templateId, oInputs, oDialog);
                    }.bind(this)
                }),
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _saveTemplateMetadata: async function (sTemplateId, oInputs, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
            const oPayload = {};

            Object.keys(oInputs).forEach(function (sField) {
                const sValue = oInputs[sField].getValue();
                oPayload[sField] = sField === "categories"
                    ? sValue.split(",").map(function (sItem) { return sItem.trim(); }).filter(Boolean)
                    : sValue;
            });

            try {
                oDialog.setBusy(true);
                await this._fetchJson(
                    sApiBaseUrl + "/api/templates/" + encodeURIComponent(sTemplateId) + "/metadata",
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(oPayload)
                    }
                );
                oDialog.setBusy(false);
                oDialog.close();
                MessageToast.show("Propiedades de plantilla guardadas");
                await this._refreshTemplatesAndRepository();
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudieron guardar las propiedades:\n\n" + oError.message);
            }
        },

        _executeTemplateAction: async function (sTemplateId, sAction, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            try {
                oDialog.setBusy(true);
                const oResult = await this._fetchJson(
                    sApiBaseUrl +
                    "/api/templates/" +
                    encodeURIComponent(sTemplateId) +
                    "/actions/" +
                    encodeURIComponent(sAction),
                    { method: "POST" }
                );
                oDialog.setBusy(false);
                oDialog.close();
                MessageToast.show("Acción ejecutada: " + this._labelForAction(sAction));
                await this._refreshTemplatesAndRepository();

                if (oResult.newTemplate) {
                    MessageBox.success("Nueva versión creada:\n\n" + oResult.newTemplate.templateId);
                }
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo ejecutar la acción:\n\n" + oError.message);
            }
        },

        _loadTemplateVariables: async function (sTemplateId) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            return this._fetchJson(
                sApiBaseUrl + "/api/templates/" + encodeURIComponent(sTemplateId) + "/variables"
            );
        },

        _openDynamicFormDialog: function (oTemplate, aVariables) {
            const oInputsByVariable = {};
            const oRawContractLookupRef = {
                value: null
            };

            const oAppContext = this.getView().getModel("app").getProperty("/appContext") || {};
            const sDefaultContractNumber = oAppContext.legalTransactionId || "900000000001";

            const aFormVariables = (aVariables || [])
                .filter(function (oVariable) {
                    return oVariable.name !== "CONTRACT_NUMBER";
                })
                .sort(function (a, b) {
                    const aOrder = this._variableDisplayOrder(a.name);
                    const bOrder = this._variableDisplayOrder(b.name);
                    return aOrder - bOrder;
                }.bind(this));

            const oFormBox = new VBox({
                width: "100%"
            });

            oFormBox.addItem(new ObjectStatus({
                text: "Plantilla: " + oTemplate.name + " · Contexto: " + (oAppContext.context || "N/D") + " · Categoría: " + (oAppContext.category || "Todas"),
                state: "Success"
            }).addStyleClass("sapUiSmallMarginBottom"));

            oFormBox.addItem(new Title({
                text: "1. Datos de contrato SAP/mock",
                level: "H4"
            }).addStyleClass("sapUiSmallMarginTop gpcContractSectionHeader"));

            oFormBox.addItem(new Text({
                text: "Ingresa el ID del contrato SAP para autocompletar los datos del formulario. Si el servicio real no está disponible, se utilizará un mock de respaldo."
            }).addStyleClass("sapUiSmallMarginBottom"));

            const oContractNumberInput = new Input({
                value: sDefaultContractNumber,
                required: true,
                width: "100%",
                placeholder: "Ej: 900000000001"
            });

            const oLookupStatus = new ObjectStatus({
                text: "Sin consulta realizada",
                state: "None"
            }).addStyleClass("sapUiSmallMarginTop sapUiTinyMarginBottom");

            const oConsultButton = new Button({
                text: "Consultar datos de contrato",
                icon: "sap-icon://search",
                type: "Emphasized",
                press: async function () {
                    await this._fetchAndApplyContractData({
                        contractNumberInput: oContractNumberInput,
                        inputsByVariable: oInputsByVariable,
                        lookupStatus: oLookupStatus,
                        rawContractLookupRef: oRawContractLookupRef
                    });
                }.bind(this)
            }).addStyleClass("sapUiTinyMarginEnd");

            const oClearButton = new Button({
                text: "Limpiar datos",
                icon: "sap-icon://decline",
                press: function () {
                    this._clearContractForm({
                        contractNumberInput: oContractNumberInput,
                        inputsByVariable: oInputsByVariable,
                        lookupStatus: oLookupStatus,
                        rawContractLookupRef: oRawContractLookupRef
                    });
                }.bind(this)
            }).addStyleClass("sapUiTinyMarginEnd");

            const oRawJsonButton = new Button({
                text: "Ver JSON",
                icon: "sap-icon://inspect",
                press: function () {
                    this._showRawContractDataDialog(oRawContractLookupRef.value);
                }.bind(this)
            });

            oFormBox.addItem(new Label({
                text: "ID / número de contrato SAP"
            }).addStyleClass("sapUiSmallMarginTop"));

            oFormBox.addItem(oContractNumberInput);

            oFormBox.addItem(new HBox({
                wrap: "Wrap",
                alignItems: "Center",
                items: [
                    oConsultButton,
                    oClearButton,
                    oRawJsonButton
                ]
            }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"));

            oFormBox.addItem(oLookupStatus);

            const addSection = function (sTitle, aVariableNames) {
                const aSectionVariables = aFormVariables.filter(function (oVariable) {
                    return aVariableNames.includes(oVariable.name);
                });

                if (!aSectionVariables.length) {
                    return;
                }

                oFormBox.addItem(new Title({
                    text: sTitle,
                    level: "H4"
                }).addStyleClass("sapUiMediumMarginTop sapUiSmallMarginBottom"));

                aSectionVariables.forEach(function (oVariable) {
                    oFormBox.addItem(new Label({
                        text: this._businessLabelForVariable(oVariable.name)
                    }).addStyleClass("sapUiSmallMarginTop"));

                    const oInput = new Input({
                        required: true,
                        width: "100%",
                        placeholder: this._placeholderForVariable(oVariable),
                        type: this._inputTypeForVariable(oVariable)
                    });

                    if (oVariable.name === "CONTRACT_CURRENCY") {
                        oInput.setValue("USD");
                    }

                    oInputsByVariable[oVariable.name] = oInput;
                    oFormBox.addItem(oInput);
                }.bind(this));
            }.bind(this);

            addSection("2. Variables SAP · Datos del contratista", [
                "CONTRACTOR_NAME",
                "CONTRACTOR_ID",
                "CONTRACTOR_ADDRESS",
                "CONTRACTOR_EMAIL"
            ]);

            addSection("2. Variables SAP · Datos comerciales", [
                "CONTRACT_PURPOSE",
                "CONTRACT_AMOUNT",
                "CONTRACT_CURRENCY"
            ]);

            addSection("2. Variables SAP · Vigencia", [
                "START_DATE",
                "END_DATE"
            ]);

            const aKnownVariables = [
                "CONTRACTOR_NAME",
                "CONTRACTOR_ID",
                "CONTRACTOR_ADDRESS",
                "CONTRACTOR_EMAIL",
                "CONTRACT_PURPOSE",
                "CONTRACT_AMOUNT",
                "CONTRACT_CURRENCY",
                "START_DATE",
                "END_DATE"
            ];

            const aOtherVariables = aFormVariables
                .map(function (oVariable) {
                    return oVariable.name;
                })
                .filter(function (sVariableName) {
                    return !aKnownVariables.includes(sVariableName);
                });

            addSection("3. Campos a completar por usuario", aOtherVariables);

            oFormBox.addItem(new Title({
                text: "4. Documento virtual",
                level: "H4"
            }).addStyleClass("sapUiMediumMarginTop sapUiSmallMarginBottom gpcContractSectionHeader"));
            oFormBox.addItem(new ObjectStatus({
                text: "Status inicial: PENDING · El refresh recalcula metadata SAP/mock sin regenerar DOCX/PDF.",
                state: "Information"
            }));

            oFormBox.addItem(new Title({
                text: "5. Acciones",
                level: "H4"
            }).addStyleClass("sapUiMediumMarginTop sapUiSmallMarginBottom gpcContractSectionHeader"));
            const oDialogContent = new VBox({
                width: "100%",
                items: [oFormBox]
            }).addStyleClass("gpcContractFormContent");
            const oDialog = new Dialog({
                title: "Generar contrato desde plantilla",
                contentWidth: "820px",
                contentHeight: "760px",
                verticalScrolling: true,
                resizable: true,
                draggable: true,
                content: [oDialogContent],
                beginButton: new Button({
                    text: "Generar documento/PDF",
                    type: "Emphasized",
                    icon: "sap-icon://documents",
                    press: async function () {
                        await this._generateDocumentsFromDialog({
                            dialog: oDialog,
                            template: oTemplate,
                            contractNumberInput: oContractNumberInput,
                            inputsByVariable: oInputsByVariable
                        });
                    }.bind(this)
                }),
                endButton: new Button({
                    text: "Cancelar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },
        _variableDisplayOrder: function (sVariableName) {
            const mOrder = {
                CONTRACTOR_NAME: 10,
                CONTRACTOR_ID: 20,
                CONTRACTOR_ADDRESS: 30,
                CONTRACTOR_EMAIL: 40,
                CONTRACT_PURPOSE: 50,
                CONTRACT_AMOUNT: 60,
                CONTRACT_CURRENCY: 70,
                START_DATE: 80,
                END_DATE: 90
            };

            return mOrder[sVariableName] || 999;
        },

        _businessLabelForVariable: function (sVariableName) {
            const mLabels = {
                CONTRACTOR_NAME: "Nombre del contratista",
                CONTRACTOR_ID: "RNC / identificación del contratista",
                CONTRACTOR_ADDRESS: "Dirección del contratista",
                CONTRACTOR_EMAIL: "Correo del contratista para firma",
                CONTRACT_PURPOSE: "Objeto del contrato",
                CONTRACT_AMOUNT: "Monto del contrato",
                CONTRACT_CURRENCY: "Moneda",
                START_DATE: "Fecha de inicio",
                END_DATE: "Fecha de fin"
            };

            return mLabels[sVariableName] || sVariableName;
        },

        _clearContractForm: function (oParams) {
            Object.keys(oParams.inputsByVariable).forEach(function (sVariableName) {
                const oInput = oParams.inputsByVariable[sVariableName];

                if (oInput) {
                    if (sVariableName === "CONTRACT_CURRENCY") {
                        oInput.setValue("USD");
                    } else {
                        oInput.setValue("");
                    }
                }
            });

            if (oParams.lookupStatus) {
                oParams.lookupStatus.setText("Datos limpiados");
                oParams.lookupStatus.setState("None");
            }

            if (oParams.rawContractLookupRef) {
                oParams.rawContractLookupRef.value = null;
            }

            MessageToast.show("Formulario limpiado");
        },

        _showRawContractDataDialog: function (oRawData) {
            if (!oRawData) {
                MessageBox.information("Todavía no hay una respuesta SAP/mock cargada.");
                return;
            }

            const sJson = JSON.stringify(oRawData, null, 2);
            const sJsonContainerId = "gpcRawJson_" + Date.now();

            const oHtml = new HTML({
                sanitizeContent: false,
                content:
                    "<div style='padding:1rem;box-sizing:border-box;height:560px;'>" +
                    "<pre id='" + sJsonContainerId + "' " +
                    "style='height:100%;overflow:auto;margin:0;padding:1rem;" +
                    "box-sizing:border-box;border:1px solid #d9e2ec;border-radius:0.5rem;" +
                    "background:#f7f9fb;font-family:monospace;font-size:0.85rem;" +
                    "white-space:pre-wrap;'></pre>" +
                    "</div>"
            });

            const oDialog = new Dialog({
                title: "Respuesta cruda SAP/mock",
                contentWidth: "820px",
                contentHeight: "640px",
                verticalScrolling: false,
                resizable: true,
                draggable: true,
                content: [oHtml],
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterOpen: function () {
                    const oContainer = document.getElementById(sJsonContainerId);

                    if (oContainer) {
                        oContainer.textContent = sJson;
                    }
                },
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _fetchAndApplyContractData: async function (oParams) {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");

            const sContractId = oParams.contractNumberInput.getValue();

            if (!sContractId) {
                MessageBox.warning("Indica primero el ID o número de contrato SAP.");
                return;
            }

            try {
                oParams.contractNumberInput.setBusy(true);

                if (oParams.lookupStatus) {
                    oParams.lookupStatus.setText("Consultando datos del contrato...");
                    oParams.lookupStatus.setState("Warning");
                }

                const oResult = await this._fetchJson(
                    sApiBaseUrl +
                    "/api/sap/contracts/" +
                    encodeURIComponent(sContractId)
                );

                oParams.contractNumberInput.setBusy(false);

                if (oParams.rawContractLookupRef) {
                    oParams.rawContractLookupRef.value = oResult;
                }

                const oValues = oResult.values || {};

                if (oValues.CONTRACT_NUMBER) {
                    oParams.contractNumberInput.setValue(oValues.CONTRACT_NUMBER);
                }

                Object.keys(oParams.inputsByVariable).forEach(function (sVariableName) {
                    const oInput = oParams.inputsByVariable[sVariableName];

                    if (
                        oInput &&
                        Object.prototype.hasOwnProperty.call(oValues, sVariableName)
                    ) {
                        oInput.setValue(oValues[sVariableName] || "");
                    }
                });

                if (oParams.lookupStatus) {
                    if (oResult.fallback) {
                        oParams.lookupStatus.setText(
                            "Datos cargados desde MOCK. Motivo: " +
                            (oResult.reason || "Servicio SAP no disponible")
                        );
                        oParams.lookupStatus.setState("Warning");
                    } else {
                        oParams.lookupStatus.setText("Datos cargados desde SAP OData");
                        oParams.lookupStatus.setState("Success");
                    }
                }

                oModel.setProperty(
                    "/lastSapDataSource",
                    oResult.fallback ? "MOCK" : "SAP OData"
                );
                this._updateSummaryCards();

                MessageToast.show(
                    oResult.fallback
                        ? "Datos cargados desde mock"
                        : "Datos cargados desde SAP"
                );
            } catch (oError) {
                oParams.contractNumberInput.setBusy(false);

                if (oParams.lookupStatus) {
                    oParams.lookupStatus.setText("Error consultando datos del contrato");
                    oParams.lookupStatus.setState("Error");
                }

                MessageBox.error(
                    "No se pudieron consultar los datos del contrato:\n\n" +
                    oError.message
                );
            }
        },

        _placeholderForVariable: function (oVariable) {
            switch (oVariable.name) {
                case "CONTRACTOR_NAME":
                    return "Ej: Servicios Técnicos del Caribe, S.R.L.";
                case "CONTRACTOR_ID":
                    return "Ej: RNC-123456789";
                case "CONTRACTOR_ADDRESS":
                    return "Ej: Av. Principal, Punta Cana";
                case "CONTRACTOR_EMAIL":
                    return "Ej: contratista@example.com";
                case "CONTRACT_AMOUNT":
                    return "Ej: 25000.00";
                case "CONTRACT_CURRENCY":
                    return "Ej: USD";
                case "CONTRACT_PURPOSE":
                    return "Ej: Prestación de servicios profesionales de mantenimiento preventivo.";
                case "START_DATE":
                    return "Ej: 01/07/2026";
                case "END_DATE":
                    return "Ej: 31/12/2026";
                default:
                    return oVariable.label || oVariable.name;
            }
        },
        _inputTypeForVariable: function (oVariable) {
            if (oVariable.name === "CONTRACT_AMOUNT") {
                return "Text";
            }

            if (oVariable.type === "email") {
                return "Email";
            }

            return "Text";
        },

        _generateDocumentsFromDialog: async function (oParams) {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");

            const sContractNumber = oParams.contractNumberInput.getValue();

            if (!sContractNumber) {
                MessageBox.warning("Debes indicar un número de contrato.");
                return;
            }

            const oValues = {
                CONTRACT_NUMBER: sContractNumber
            };

            Object.keys(oParams.inputsByVariable).forEach(function (sVariableName) {
                oValues[sVariableName] = oParams.inputsByVariable[sVariableName].getValue();
            });

            try {
                oParams.dialog.setBusy(true);

                const oResult = await this._fetchJson(
                    sApiBaseUrl +
                    "/api/templates/" +
                    encodeURIComponent(oParams.template.templateId) +
                    "/generate",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            contractNumber: sContractNumber,
                            values: oValues
                        })
                    }
                );

                oParams.dialog.setBusy(false);
                oParams.dialog.close();

                this._setGenerationResult(oResult);
                this._lastGenerationContext = {
                    templateId: oParams.template.templateId,
                    contractNumber: sContractNumber,
                    values: oValues
                };

                await this._refreshRepositoryAfterGeneration();

                MessageToast.show("Documentos generados correctamente");
                this._showGenerationDialog(oResult);
            } catch (oError) {
                oParams.dialog.setBusy(false);
                MessageBox.error("Error generando documentos:\n\n" + oError.message);
            }
        },

        _refreshRepositoryAfterGeneration: async function () {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");

            try {
                const oRepository = await this._fetchJson(sApiBaseUrl + "/api/repository");

                const aPreparedTree = this._prepareTree(oRepository.tree || []);

                oModel.setProperty("/repositoryTree", aPreparedTree);
                this._setBusinessDocuments(await this._loadBusinessDocuments());
                this._updateSummaryCards();
                oModel.setProperty("/backendStatus", "Backend conectado");
                oModel.setProperty("/backendStatusState", "Success");
            } catch (oError) {
                console.warn("No se pudo refrescar el repositorio después de generar:", oError);
                MessageToast.show("Documentos generados. No se pudo refrescar el árbol automáticamente.");
            }
        },

        _setGenerationResult: function (oResult) {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");

            const sDocumentFileName =
                oResult.result &&
                    oResult.result.document &&
                    oResult.result.document.fileName
                    ? oResult.result.document.fileName
                    : "documento generado";

            oModel.setProperty("/hasGenerationResult", true);
            oModel.setProperty("/generationMessage", oResult.message || "Documentos generados correctamente");

            oModel.setProperty("/lastGeneration", {
                docxText: "Descargar documento generado: " + sDocumentFileName,
                docxUrl: sApiBaseUrl + oResult.downloadUrls.docx,
                pdfText: "Descargar PDF para firma",
                pdfUrl: sApiBaseUrl + oResult.downloadUrls.pdf,
                metadataText: "Descargar metadata JSON",
                metadataUrl: sApiBaseUrl + oResult.downloadUrls.metadata
            });

            if (oResult.result && oResult.result.metadata && oResult.result.metadata.virtualDocument) {
                const oVirtualDocument = {
                    ...oResult.result.metadata.virtualDocument,
                    values: oResult.result.metadata.values || {},
                    dataSource: oResult.result.metadata.dataSource || oResult.result.metadata.source || "SAP/mock"
                };
                oModel.setProperty("/selectedDocument", null);
                oModel.setProperty("/virtualDocument", oVirtualDocument);
                this._syncVirtualDocumentDisplay();
            }

            this._updateSummaryCards();
        },

        _showGenerationDialog: function (oResult) {
            const oModel = this.getView().getModel("app");
            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");
            const oVirtualDocument =
                oResult.result &&
                    oResult.result.metadata &&
                    oResult.result.metadata.virtualDocument
                    ? oResult.result.metadata.virtualDocument
                    : null;
            const aMessages = oVirtualDocument ? oVirtualDocument.messages || [] : [];

            const oDialog = new Dialog({
                title: "Documentos generados",
                contentWidth: "600px",
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        items: [
                            new Text({
                                text: oResult.message || "Documentos generados correctamente"
                            }).addStyleClass("sapUiSmallMarginBottom"),

                            new ObjectStatus({
                                text: oVirtualDocument
                                    ? "Documento virtual: " + oVirtualDocument.status
                                    : "Documento virtual: N/D",
                                state: oVirtualDocument && oVirtualDocument.status === "COMPLETED"
                                    ? "Success"
                                    : "Warning"
                            }).addStyleClass("sapUiSmallMarginBottom"),

                            new Text({
                                text: this._normalizeVirtualDocumentMessages(aMessages).map(function (oMessage) {
                                    return oMessage.severity + ": " + oMessage.message;
                                }).join("\n")
                            }).addStyleClass("sapUiSmallMarginBottom"),

                            new Link({
                                text: "Abrir documento generado",
                                href: sApiBaseUrl + oResult.downloadUrls.docx,
                                target: "_blank"
                            }),

                            new Link({
                                text: "Abrir PDF para firma",
                                href: sApiBaseUrl + oResult.downloadUrls.pdf,
                                target: "_blank"
                            }),

                            new Link({
                                text: "Abrir metadata JSON",
                                href: sApiBaseUrl + oResult.downloadUrls.metadata,
                                target: "_blank"
                            })
                        ]
                    }).addStyleClass("sapUiMediumMargin")
                ],
                beginButton: new Button({
                    text: "Refrescar variables SAP/mock",
                    icon: "sap-icon://refresh",
                    press: async function () {
                        await this._refreshVirtualDocument(oDialog);
                    }.bind(this)
                }),
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _refreshVirtualDocument: async function (oDialog) {
            const oModel = this.getView().getModel("app");
            const oContext = this._getVirtualDocumentRefreshContext();

            if (!oContext || !oContext.templateId || !oContext.contractNumber) {
                MessageBox.warning("No hay documento virtual activo con templateId y contractNumber para refrescar.");
                return;
            }

            const sApiBaseUrl = oModel.getProperty("/apiBaseUrl");

            try {
                oDialog.setBusy(true);
                const oResult = await this._fetchJson(
                    sApiBaseUrl + "/api/virtual-documents/refresh",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(oContext)
                    }
                );
                oDialog.setBusy(false);

                this._lastGenerationContext = {
                    templateId: oContext.templateId,
                    contractNumber: oContext.contractNumber,
                    values: oResult.values || oContext.values || {}
                };

                if (oResult.virtualDocument) {
                    oModel.setProperty("/virtualDocument", {
                        ...oResult.virtualDocument,
                        values: oResult.values || oContext.values || {},
                        dataSource: oResult.source || oResult.virtualDocument.dataSource || "SAP/mock",
                        fallback: oResult.fallback,
                        refreshReason: oResult.reason
                    });
                    this._syncVirtualDocumentDisplay();
                    this._updateSummaryCards();
                }

                MessageToast.show("Variables SAP/mock refrescadas");
                MessageBox.information(
                    (oResult.message || "Variables SAP/mock refrescadas") +
                    "\n\nAviso: el refresh actualiza metadata y valores, pero todavía no regenera el archivo DOCX/PDF."
                );
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo refrescar el documento virtual:\n\n" + oError.message);
            }
        },
        _formatValueForDisplay: function (vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return "—";
            }

            if (Array.isArray(vValue)) {
                if (!vValue.length) {
                    return "—";
                }

                return vValue.length + " elemento(s): " + this._formatCompactJson(vValue);
            }

            if (typeof vValue === "object") {
                return this._formatCompactJson(vValue);
            }

            return String(vValue);
        },

        _formatCompactJson: function (vValue) {
            try {
                return JSON.stringify(vValue);
            } catch (oError) {
                return "Objeto complejo";
            }
        },

        _hasDisplayValue: function (vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return false;
            }

            if (Array.isArray(vValue)) {
                return vValue.length > 0;
            }

            return true;
        },

        _toKeyValueRows: function (vData, oOptions) {
            const oSettings = oOptions || {};
            const sDefaultType = oSettings.defaultType || "—";
            const sDefaultSource = oSettings.defaultSource || "—";
            const mDefinitions = {};
            const mValues = oSettings.values || {};

            (oSettings.definitions || []).forEach(function (oDefinition) {
                if (oDefinition && oDefinition.name) {
                    mDefinitions[oDefinition.name] = oDefinition;
                }
            });

            if (!vData) {
                return [];
            }

            if (Array.isArray(vData)) {
                return vData.map(function (vItem, iIndex) {
                    if (typeof vItem === "object" && vItem !== null) {
                        const sName = vItem.name || vItem.label || vItem.key || vItem.field || ("Item " + (iIndex + 1));
                        const vValue = vItem.value !== undefined ? vItem.value : (mValues[sName] !== undefined ? mValues[sName] : "");

                        return {
                            name: sName,
                            type: vItem.type || vItem.ecaType || sDefaultType,
                            source: vItem.source || sDefaultSource,
                            required: !!vItem.required,
                            rawValue: vValue,
                            value: this._formatValueForDisplay(vValue),
                            jsonValue: (typeof vValue === "object" && vValue !== null) ? this._formatCompactJson(vValue) : "",
                            status: vItem.status || (this._hasDisplayValue(vValue) ? (oSettings.completedStatus || "OK") : (oSettings.missingStatus || "Faltante"))
                        };
                    }

                    return {
                        name: "Item " + (iIndex + 1),
                        type: sDefaultType,
                        source: sDefaultSource,
                        required: false,
                        rawValue: vItem,
                        value: this._formatValueForDisplay(vItem),
                        jsonValue: (typeof vItem === "object" && vItem !== null) ? this._formatCompactJson(vItem) : "",
                        status: this._hasDisplayValue(vItem) ? (oSettings.completedStatus || "OK") : (oSettings.missingStatus || "Faltante")
                    };
                }.bind(this));
            }

            if (typeof vData === "object") {
                return Object.keys(vData).map(function (sKey) {
                    const oDefinition = mDefinitions[sKey] || {};
                    const vValue = vData[sKey];

                    return {
                        name: sKey,
                        type: oDefinition.type || oDefinition.ecaType || sDefaultType,
                        source: oDefinition.source || sDefaultSource,
                        required: !!oDefinition.required,
                        rawValue: vValue,
                        value: this._formatValueForDisplay(vValue),
                        jsonValue: (typeof vValue === "object" && vValue !== null) ? this._formatCompactJson(vValue) : "",
                        status: this._hasDisplayValue(vValue) ? (oSettings.completedStatus || "OK") : (oSettings.missingStatus || "Faltante")
                    };
                }.bind(this));
            }

            return [{
                name: "Valor",
                type: sDefaultType,
                source: sDefaultSource,
                required: false,
                rawValue: vData,
                value: this._formatValueForDisplay(vData),
                jsonValue: (typeof vData === "object" && vData !== null) ? this._formatCompactJson(vData) : "",
                status: this._hasDisplayValue(vData) ? (oSettings.completedStatus || "OK") : (oSettings.missingStatus || "Faltante")
            }];
        },

        _objectToKeyValueItems: function (vData) {
            return this._toKeyValueRows(vData);
        },

        _normalizeMessageSeverity: function (sSeverity, sMessage) {
            const sNormalized = String(sSeverity || "").toUpperCase();

            if (["ERROR", "WARNING", "INFO", "SUCCESS"].includes(sNormalized)) {
                return sNormalized;
            }

            if (/^faltan|error|obligatorio/i.test(String(sMessage || ""))) {
                return "ERROR";
            }

            if (/advertencia|warning/i.test(String(sMessage || ""))) {
                return "WARNING";
            }

            return "INFO";
        },

        _messageSeverityToState: function (sSeverity) {
            const mStates = { ERROR: "Error", WARNING: "Warning", INFO: "Information", SUCCESS: "Success" };
            return mStates[sSeverity] || "Information";
        },

        _normalizeVirtualDocumentMessages: function (vMessages) {
            if (!vMessages || (Array.isArray(vMessages) && !vMessages.length)) {
                return [{
                    severity: "SUCCESS",
                    severityState: "Success",
                    message: "Sin mensajes de validación.",
                    field: "—",
                    action: "No se requiere acción."
                }];
            }

            const aMessages = Array.isArray(vMessages) ? vMessages : [vMessages];

            return aMessages.map(function (vMessage) {
                if (typeof vMessage === "object" && vMessage !== null) {
                    const sText = vMessage.message || vMessage.text || vMessage.description || this._formatValueForDisplay(vMessage);
                    const sSeverity = this._normalizeMessageSeverity(vMessage.severity || vMessage.type || vMessage.level, sText);

                    return {
                        severity: sSeverity,
                        severityState: this._messageSeverityToState(sSeverity),
                        message: sText,
                        field: vMessage.field || vMessage.fieldName || vMessage.variable || vMessage.name || "—",
                        action: vMessage.action || vMessage.suggestedAction || this._suggestActionForMessage(sSeverity, sText)
                    };
                }

                const sText = this._formatValueForDisplay(vMessage);
                const sSeverity = this._normalizeMessageSeverity(null, sText);

                return {
                    severity: sSeverity,
                    severityState: this._messageSeverityToState(sSeverity),
                    message: sText,
                    field: this._extractFieldFromMessage(sText),
                    action: this._suggestActionForMessage(sSeverity, sText)
                };
            }.bind(this));
        },

        _extractFieldFromMessage: function (sMessage) {
            const aParts = String(sMessage || "").split(":");
            return aParts.length > 1 ? aParts.slice(1).join(":").trim() : "—";
        },

        _suggestActionForMessage: function (sSeverity, sMessage) {
            if (/variables SAP/i.test(String(sMessage || ""))) {
                return "Refresca SAP/mock o completa el dato faltante antes de finalizar.";
            }

            if (/campos de usuario|input/i.test(String(sMessage || ""))) {
                return "Completa el campo de usuario en la generación o edición del documento.";
            }

            if (sSeverity === "WARNING") {
                return "Revisar antes de liberar o enviar a firma.";
            }

            if (sSeverity === "ERROR") {
                return "Corregir antes de continuar.";
            }

            return "No se requiere acción.";
        },

        _normalizeVariablesForDisplay: function (vVariables, aDefinitions, mValues) {
            return this._toKeyValueRows(vVariables, {
                definitions: aDefinitions,
                values: mValues,
                defaultType: "Variable",
                defaultSource: "SAP/mock",
                completedStatus: "OK",
                missingStatus: "Faltante"
            }).map(function (oRow) {
                return { ...oRow, variable: oRow.name };
            });
        },

        _normalizeInputFieldsForDisplay: function (vInputFields, aDefinitions, mValues) {
            return this._toKeyValueRows(vInputFields, {
                definitions: aDefinitions,
                values: mValues,
                defaultType: "Campo de usuario",
                defaultSource: "Usuario",
                completedStatus: "Completado",
                missingStatus: "Pendiente"
            }).map(function (oRow) {
                return {
                    ...oRow,
                    field: oRow.name,
                    requiredText: oRow.required ? "Sí" : "No"
                };
            });
        },

        _selectDocumentForAssembly: function (oDocument) {
            const oModel = this.getView().getModel("app");
            const oVirtualDocument = this._buildVirtualDocumentFromDocument(oDocument);

            oModel.setProperty("/selectedDocument", oDocument);
            oModel.setProperty("/virtualDocument", oVirtualDocument);
            this._lastGenerationContext = {
                templateId: oVirtualDocument.templateId,
                contractNumber: oVirtualDocument.contractNumber,
                values: oVirtualDocument.values || {}
            };
            this._syncVirtualDocumentDisplay();
            this._updateSummaryCards();
            MessageToast.show("Documento virtual seleccionado para ensamblaje");
        },

        _buildVirtualDocumentFromDocument: function (oDocument) {
            const oVirtual = (oDocument && oDocument.virtualDocument) || {};
            const mValues = oDocument && oDocument.values || oVirtual.values || {};
            const mVariables = oVirtual.variables || mValues || {};

            return {
                ...oVirtual,
                virtualDocumentId: oVirtual.virtualDocumentId || (oDocument && oDocument.documentId) || "",
                documentId: oDocument && oDocument.documentId,
                templateId: oVirtual.templateId || (oDocument && oDocument.templateId) || "",
                templateVersion: oVirtual.templateVersion || (oDocument && oDocument.templateVersion) || "",
                contractNumber: oVirtual.contractNumber || (oDocument && oDocument.contractNumber) || "",
                status: oVirtual.status || (oDocument && oDocument.assemblyStatus) || "PENDING",
                generatedAt: oVirtual.generatedAt || (oDocument && oDocument.generatedAt) || "",
                lastRefreshedAt: oVirtual.lastRefreshedAt || "",
                updatedAt: oVirtual.lastRefreshedAt || oVirtual.generatedAt || (oDocument && (oDocument.modifiedAt || oDocument.generatedAt)) || "",
                dataSource: oVirtual.dataSource || oVirtual.source || (oDocument && (oDocument.dataSource || oDocument.source)) || "SAP/mock",
                messages: oVirtual.messages || (oDocument && oDocument.messages) || [],
                variables: mVariables,
                inputFields: oVirtual.inputFields || (oDocument && oDocument.inputFields) || {},
                variableDefinitions: (oDocument && oDocument.variables) || [],
                values: mValues,
                primaryFile: oDocument && oDocument.primaryFile,
                relativePath: oDocument && oDocument.relativePath
            };
        },

        _getVirtualDocumentRefreshContext: function () {
            const oModel = this.getView().getModel("app");
            const oVirtualDocument = oModel.getProperty("/virtualDocument") || {};
            const oSelectedDocument = oModel.getProperty("/selectedDocument") || {};
            const oLastContext = this._lastGenerationContext || {};

            return {
                templateId: oVirtualDocument.templateId || oSelectedDocument.templateId || oLastContext.templateId,
                contractNumber: oVirtualDocument.contractNumber || oSelectedDocument.contractNumber || oLastContext.contractNumber,
                values: oVirtualDocument.values || oSelectedDocument.values || oLastContext.values || {}
            };
        },

        _syncVirtualDocumentDisplay: function () {
            const oModel = this.getView().getModel("app");

            if (!oModel) {
                return;
            }

            const oVirtualDocument = oModel.getProperty("/virtualDocument") || null;
            const bHasActiveDocument = !!(oVirtualDocument && (oVirtualDocument.virtualDocumentId || oVirtualDocument.templateId || oVirtualDocument.contractNumber));

            if (!bHasActiveDocument) {
                oModel.setProperty("/virtualDisplay", {
                    hasActiveDocument: false,
                    emptyMessage: "No hay documento virtual seleccionado.",
                    emptyDescription: "Selecciona un documento generado o crea un documento desde una plantilla para iniciar el ensamblaje.",
                    header: {},
                    messages: [],
                    variables: [],
                    inputFields: []
                });
                return;
            }

            const aDefinitions = oVirtualDocument.variableDefinitions || [];
            const mValues = oVirtualDocument.values || {};
            const sUpdatedAt = oVirtualDocument.lastRefreshedAt || oVirtualDocument.updatedAt || oVirtualDocument.generatedAt || "";

            oModel.setProperty("/virtualDisplay", {
                hasActiveDocument: true,
                header: {
                    virtualDocumentId: oVirtualDocument.virtualDocumentId || "N/D",
                    templateId: oVirtualDocument.templateId || "N/D",
                    templateVersion: oVirtualDocument.templateVersion || "N/D",
                    contractNumber: oVirtualDocument.contractNumber || "N/D",
                    status: oVirtualDocument.status || "PENDING",
                    statusState: this._statusToState(oVirtualDocument.status),
                    statusCssClass: this._statusToCssClass(oVirtualDocument.status),
                    updatedAt: this._formatDateTime(sUpdatedAt),
                    dataSource: oVirtualDocument.dataSource || oVirtualDocument.source || "SAP/mock",
                    documentPath: oVirtualDocument.relativePath || (oVirtualDocument.primaryFile && oVirtualDocument.primaryFile.relativePath) || ""
                },
                messages: this._normalizeVirtualDocumentMessages(oVirtualDocument.messages || []),
                variables: this._normalizeVariablesForDisplay(oVirtualDocument.variables || {}, aDefinitions, mValues),
                inputFields: this._normalizeInputFieldsForDisplay(oVirtualDocument.inputFields || {}, aDefinitions, mValues)
            });
        },

        _createKeyValueTable: function (sTitle, vData, sEmptyText) {
            const aItems = this._objectToKeyValueItems(vData);

            if (!aItems.length) {
                return new VBox({ items: [new Title({ text: sTitle, level: "H5" }), new Text({ text: sEmptyText || "Sin datos." })] });
            }

            return new VBox({
                items: [
                    new Title({ text: sTitle, level: "H5" }),
                    new Table({
                        columns: [
                            new Column({ header: new Text({ text: "Nombre" }) }),
                            new Column({ header: new Text({ text: "Tipo" }) }),
                            new Column({ header: new Text({ text: "Fuente" }) }),
                            new Column({ header: new Text({ text: "Valor" }) }),
                            new Column({ header: new Text({ text: "Estado" }) })
                        ],
                        items: aItems.map(function (oItem) {
                            return new ColumnListItem({ cells: [
                                new Text({ text: oItem.name }),
                                new Text({ text: oItem.type }),
                                new Text({ text: oItem.source }),
                                new Text({ text: oItem.value }),
                                new Text({ text: oItem.status })
                            ] });
                        })
                    })
                ]
            }).addStyleClass("sapUiSmallMarginBottom");
        },

        _editRepositoryFile: async function (oItem) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            try {
                const [oEditableResult, oClausesResult] = await Promise.all([
                    this._fetchJson(
                        sApiBaseUrl +
                        "/api/files/edit/html?path=" +
                        encodeURIComponent(oItem.relativePath)
                    ),
                    this._fetchJson(
                        sApiBaseUrl +
                        "/api/clauses?includeHtml=true"
                    )
                ]);

                this._openHtmlEditorDialog(
                    oItem,
                    oEditableResult.html,
                    oClausesResult.clauses || []
                );
            } catch (oError) {
                MessageBox.error("No se pudo abrir el editor HTML:\n\n" + oError.message);
            }
        },

        _openHtmlEditorDialog: function (oItem, sHtmlContent, aClauses) {
            const sEditorId = "gpcRichTextEditor_" + Date.now();
            const sClauseSearchId = "gpcClauseSearch_" + Date.now();
            const sClauseStatusId = "gpcClauseStatus_" + Date.now();
            const sClauseCategoryId = "gpcClauseCategory_" + Date.now();
            const sClauseListId = "gpcClauseList_" + Date.now();

            this._rteEditors = this._rteEditors || {};

            const mClausesById = {};
            const aSortedClauses = (aClauses || []).slice().sort(function (a, b) {
                if (a.status === "RELEASED" && b.status !== "RELEASED") {
                    return -1;
                }

                if (a.status !== "RELEASED" && b.status === "RELEASED") {
                    return 1;
                }

                return (a.title || "").localeCompare(b.title || "");
            });
            const sClausesHtml = aSortedClauses.map(function (oClause) {
                mClausesById[oClause.clauseId] = oClause;

                return [
                    "<div class='gpcClauseCard' ",
                    "data-clause-title='", this._escapeHtml((oClause.title || "").toLowerCase()), "' ",
                    "data-clause-category='", this._escapeHtml((oClause.category || "").toLowerCase()), "' ",
                    "data-clause-status='", this._escapeHtml((oClause.status || "").toLowerCase()), "' ",
                    "style='border:1px solid #d9e2ec;border-radius:0.5rem;padding:0.75rem;margin-bottom:0.75rem;background:#fff;'>",

                    "<div style='font-weight:bold;margin-bottom:0.25rem;'>",
                    this._escapeHtml(oClause.title),
                    "</div>",

                    "<div style='font-size:0.8rem;color:#556b82;margin-bottom:0.5rem;'>",
                    this._escapeHtml(oClause.category),
                    " · ",
                    this._escapeHtml(oClause.version),
                    " · ",
                    this._escapeHtml(oClause.status),
                    " · ",
                    this._escapeHtml(oClause.class || "CLAUSE"),
                    " · ",
                    this._escapeHtml(oClause.type || "STANDARD"),
                    " · ",
                    this._escapeHtml(oClause.governingLaw || "DO"),
                    " / ",
                    this._escapeHtml(oClause.language || "es"),
                    "</div>",

                    oClause.status === "RELEASED"
                        ? ""
                        : "<div style='font-size:0.75rem;color:#b06000;margin-bottom:0.5rem;'>No liberada: revisar antes de insertar productivamente.</div>",

                    "<div style='display:flex;gap:0.5rem;flex-wrap:wrap;'>",

                    "<button type='button' ",
                    "data-action='insert-clause' ",
                    "data-clause-id='", this._escapeHtml(oClause.clauseId), "' ",
                    "data-editor-id='", this._escapeHtml(sEditorId), "' ",
                    "style='padding:0.35rem 0.6rem;border-radius:0.35rem;border:1px solid #0a6ed1;background:#0a6ed1;color:white;cursor:pointer;'>",
                    "Insertar",
                    "</button>",

                    "<button type='button' ",
                    "data-action='preview-clause' ",
                    "data-clause-id='", this._escapeHtml(oClause.clauseId), "' ",
                    "style='padding:0.35rem 0.6rem;border-radius:0.35rem;border:1px solid #8aa1b8;background:white;color:#0a6ed1;cursor:pointer;'>",
                    "Vista previa",
                    "</button>",

                    "</div>",
                    "</div>"
                ].join("");
            }.bind(this)).join("");

            const sInitialHtmlContent =
                sHtmlContent && String(sHtmlContent).trim()
                    ? String(sHtmlContent)
                    : "<p>Sin contenido para editar.</p>";

            const oRichTextEditor = new RichTextEditor({
                width: "100%",
                height: "62vh",
                value: "",
                showGroupFont: true,
                showGroupTextAlign: true,
                showGroupStructure: true,
                showGroupInsert: true,
                showGroupLink: true
            });

            this._rteEditors[sEditorId] = oRichTextEditor;

            const fnApplyInitialEditorContent = function () {
                const sCurrentValue = oRichTextEditor.getValue && oRichTextEditor.getValue();

                if (sCurrentValue && String(sCurrentValue).trim()) {
                    return;
                }

                oRichTextEditor.setValue(sInitialHtmlContent);

                const oNativeEditor =
                    oRichTextEditor.getNativeApi && oRichTextEditor.getNativeApi();

                if (oNativeEditor && typeof oNativeEditor.setContent === "function") {
                    oNativeEditor.setContent(sInitialHtmlContent);
                }
            };

            if (typeof oRichTextEditor.attachReady === "function") {
                oRichTextEditor.attachReady(fnApplyInitialEditorContent);
            }

            const oEditorActions = new HBox({
                wrap: "Wrap",
                items: [
                    new Button({
                        text: "Guardar HTML borrador",
                        type: "Emphasized",
                        icon: "sap-icon://save",
                        press: async function () {
                            await this._saveHtmlDraftVersion(oItem, sEditorId, oDialog);
                        }.bind(this)
                    }).addStyleClass("sapUiTinyMarginEnd"),

                    new Button({
                        text: "Guardar como Word",
                        icon: "sap-icon://doc-attachment",
                        press: async function () {
                            await this._saveHtmlDocxVersion(oItem, sEditorId, oDialog);
                        }.bind(this)
                    }).addStyleClass("sapUiTinyMarginEnd"),

                    new Button({
                        text: "Vista páginas",
                        icon: "sap-icon://documents",
                        press: function () {
                            this._openPagedPreview(
                                this._getEditorHtmlContent(sEditorId),
                                oItem.name
                            );
                        }.bind(this)
                    }).addStyleClass("sapUiTinyMarginEnd")
                ]
            }).addStyleClass("sapUiSmallMarginBottom");

            const oLeftPanel = new VBox({
                width: "100%",
                items: [
                    new Text({
                        text: "Editando una representación HTML del documento. Puedes aplicar formato, insertar cláusulas y guardar una nueva versión."
                    }).addStyleClass("sapUiSmallMarginBottom"),

                    oEditorActions,

                    oRichTextEditor
                ]
            });

            const oClausePanel = new HTML({
                sanitizeContent: false,
                content:
                    "<div style='width:100%;height:68vh;border-left:1px solid #d9e2ec;padding-left:1rem;overflow:auto;box-sizing:border-box;'>" +
                    "<h3 style='margin-top:0;'>Repositorio de cláusulas</h3>" +
                    "<p style='font-size:0.85rem;color:#556b82;'>Coloca el cursor en el documento y luego presiona Insertar.</p>" +

                    "<input id='" + sClauseSearchId + "' " +
                    "type='text' " +
                    "placeholder='Buscar cláusula...' " +
                    "style='width:100%;box-sizing:border-box;margin-bottom:0.75rem;padding:0.5rem;border:1px solid #c9d2dc;border-radius:0.4rem;' />" +

                    "<input id='" + sClauseCategoryId + "' " +
                    "type='text' " +
                    "placeholder='Filtrar categoría...' " +
                    "style='width:100%;box-sizing:border-box;margin-bottom:0.75rem;padding:0.5rem;border:1px solid #c9d2dc;border-radius:0.4rem;' />" +

                    "<select id='" + sClauseStatusId + "' " +
                    "style='width:100%;box-sizing:border-box;margin-bottom:0.75rem;padding:0.5rem;border:1px solid #c9d2dc;border-radius:0.4rem;'>" +
                    "<option value=''>Todos los estados</option>" +
                    "<option value='released'>Solo RELEASED</option>" +
                    "<option value='draft'>DRAFT</option>" +
                    "<option value='approved'>APPROVED</option>" +
                    "<option value='archived'>ARCHIVED</option>" +
                    "</select>" +

                    "<div id='" + sClauseListId + "'>" +
                    (sClausesHtml || "<p>No hay cláusulas disponibles.</p>") +
                    "</div>" +
                    "</div>"
            });

            const oLayout = new HBox({
                width: "100%",
                fitContainer: true,
                items: [
                    new VBox({
                        width: "calc(100% - 390px)",
                        items: [oLeftPanel]
                    }).addStyleClass("sapUiSmallMarginEnd"),

                    new VBox({
                        width: "370px",
                        items: [oClausePanel]
                    })
                ]
            }).addStyleClass("sapUiSmallMargin");

            const oDialog = new Dialog({
                title: "Editor Rich Text - " + oItem.name,
                contentWidth: "96%",
                contentHeight: "90%",
                verticalScrolling: false,
                resizable: true,
                draggable: true,
                content: [oLayout],
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterOpen: function () {
                    this._activeRichTextEditorId = sEditorId;
                    setTimeout(fnApplyInitialEditorContent, 0);
                    setTimeout(fnApplyInitialEditorContent, 250);
                    const oSearch = document.getElementById(sClauseSearchId);
                    const oCategory = document.getElementById(sClauseCategoryId);
                    const oStatus = document.getElementById(sClauseStatusId);
                    const fnFilterClauses = function () {
                        const sValue = (oSearch && oSearch.value || "").toLowerCase();
                        const sCategoryValue = (oCategory && oCategory.value || "").toLowerCase();
                        const sStatusValue = (oStatus && oStatus.value || "").toLowerCase();
                        const aCards = document.querySelectorAll("#" + sClauseListId + " .gpcClauseCard");

                        aCards.forEach(function (oCard) {
                            const sTitle = oCard.getAttribute("data-clause-title") || "";
                            const sCategory = oCard.getAttribute("data-clause-category") || "";
                            const sStatus = oCard.getAttribute("data-clause-status") || "";
                            const bVisible =
                                (!sValue || sTitle.includes(sValue) || sCategory.includes(sValue)) &&
                                (!sCategoryValue || sCategory.includes(sCategoryValue)) &&
                                (!sStatusValue || sStatus === sStatusValue);

                            oCard.style.display = bVisible ? "block" : "none";
                        });
                    };

                    const aClauseInsertButtons = document.querySelectorAll(
                        "button[data-action='insert-clause'][data-editor-id='" + sEditorId + "'][data-clause-id]"
                    );

                    aClauseInsertButtons.forEach(function (oButton) {
                        oButton.addEventListener("click", function () {
                            const sClauseId = oButton.getAttribute("data-clause-id");
                            const oClause = mClausesById[sClauseId];

                            if (!oClause) {
                                return;
                            }

                            this._insertClauseInEditor(sEditorId, oClause);

                            MessageToast.show("Cláusula insertada: " + oClause.title);
                        }.bind(this));
                    }.bind(this));

                    const aClausePreviewButtons = document.querySelectorAll(
                        "button[data-action='preview-clause'][data-clause-id]"
                    );

                    aClausePreviewButtons.forEach(function (oButton) {
                        oButton.addEventListener("click", function () {
                            const sClauseId = oButton.getAttribute("data-clause-id");
                            const oClause = mClausesById[sClauseId];

                            if (oClause) {
                                this._previewClause(oClause);
                            }
                        }.bind(this));
                    }.bind(this));

                    if (oSearch) oSearch.addEventListener("input", fnFilterClauses);
                    if (oCategory) oCategory.addEventListener("input", fnFilterClauses);
                    if (oStatus) oStatus.addEventListener("change", fnFilterClauses);
                    fnFilterClauses();
                }.bind(this),
                afterClose: function () {
                    if (this._activeRichTextEditorId === sEditorId) {
                        this._activeRichTextEditorId = null;
                    }
                    delete this._rteEditors[sEditorId];
                    oDialog.destroy();
                }.bind(this)
            });

            oDialog.open();
        },

        _openPagedPreview: function (sHtmlContent, sTitle) {
            const sPreviewHtml = sHtmlContent || "<p>Sin contenido para previsualizar.</p>";
            const oPreview = new HTML({
                sanitizeContent: false,
                content: [
                    "<div style='min-height:100%;padding:2rem;box-sizing:border-box;",
                    "background:#eef2f6;overflow:auto;text-align:center;'>",
                    "<div style='display:inline-block;width:816px;min-height:1056px;",
                    "max-width:100%;box-sizing:border-box;background:#fff;color:#1f2d3d;",
                    "text-align:left;padding:72px;box-shadow:0 0.5rem 1.5rem rgba(15,35,55,0.22);",
                    "border:1px solid #d5dde5;font-family:Arial, sans-serif;line-height:1.45;'>",
                    sPreviewHtml,
                    "</div>",
                    "</div>"
                ].join("")
            });

            const oDialog = new Dialog({
                title: "Vista páginas - " + (sTitle || "Documento"),
                contentWidth: "920px",
                contentHeight: "86vh",
                verticalScrolling: false,
                resizable: true,
                draggable: true,
                content: [oPreview],
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _saveHtmlDraftVersion: async function (oItem, sEditorId, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
            const sEditedHtml = this._getEditorHtmlContent(sEditorId);

            if (!sEditedHtml) {
                MessageBox.error("No se encontró contenido en el editor.");
                return;
            }

            try {
                oDialog.setBusy(true);

                const oResult = await this._fetchJson(
                    sApiBaseUrl + "/api/files/edit/html-version",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            sourcePath: oItem.relativePath,
                            html: sEditedHtml,
                            status: "BORRADOR"
                        })
                    }
                );

                oDialog.setBusy(false);
                oDialog.close();

                MessageToast.show(oResult.message || "Nueva versión guardada");

                await this._refreshRepositoryAfterGeneration();

                MessageBox.success(
                    "Nueva versión creada:\n\n" +
                    oResult.file.name +
                    "\n\nRuta:\n" +
                    oResult.file.relativePath
                );
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo guardar la nueva versión:\n\n" + oError.message);
            }
        },

        _saveEditorSelection: function (sEditorId) {
            const oEditor = document.getElementById(sEditorId);
            const oSelection = window.getSelection();

            if (!oEditor || !oSelection || oSelection.rangeCount === 0) {
                return;
            }

            const oRange = oSelection.getRangeAt(0);

            if (!oEditor.contains(oRange.commonAncestorContainer)) {
                return;
            }

            this._editorSelections = this._editorSelections || {};
            this._editorSelections[sEditorId] = oRange.cloneRange();
        },

        _restoreEditorSelection: function (sEditorId) {
            const oEditor = document.getElementById(sEditorId);
            const oRange = this._editorSelections && this._editorSelections[sEditorId];

            if (!oEditor || !oRange) {
                if (oEditor) {
                    oEditor.focus();
                }
                return false;
            }

            const oSelection = window.getSelection();

            oSelection.removeAllRanges();
            oSelection.addRange(oRange);
            oEditor.focus();

            return true;
        },

        _runEditorCommand: function (sEditorId, sCommand) {
            const oEditor = document.getElementById(sEditorId);

            if (!oEditor) {
                return;
            }

            this._restoreEditorSelection(sEditorId);

            switch (sCommand) {
                case "bold":
                    document.execCommand("bold", false, null);
                    break;

                case "italic":
                    document.execCommand("italic", false, null);
                    break;

                case "underline":
                    document.execCommand("underline", false, null);
                    break;

                case "h2":
                    document.execCommand("formatBlock", false, "h2");
                    break;

                case "p":
                    document.execCommand("formatBlock", false, "p");
                    break;

                case "ul":
                    document.execCommand("insertUnorderedList", false, null);
                    break;

                case "ol":
                    document.execCommand("insertOrderedList", false, null);
                    break;

                case "hr":
                    this._insertHtmlAtCursor(sEditorId, "<hr><p><br></p>");
                    break;

                case "clear":
                    document.execCommand("removeFormat", false, null);
                    break;

                default:
                    break;
            }

            this._saveEditorSelection(sEditorId);
        },

        _insertClauseInEditor: function (sEditorId, oClause) {
            if (!oClause) {
                return;
            }

            const sClauseHtml = [
                "<hr>",
                "<section data-clause-id='",
                this._escapeHtml(oClause.clauseId),
                "'>",
                oClause.html || "",
                "</section>",
                "<p><br></p>"
            ].join("");

            this._insertHtmlAtCursor(sEditorId, sClauseHtml);
        },

        _insertHtmlAtCursor: function (sEditorId, sHtml) {
            this._rteEditors = this._rteEditors || {};

            const oRichTextEditor = this._rteEditors[sEditorId];

            if (oRichTextEditor) {
                const oNativeEditor =
                    oRichTextEditor.getNativeApi && oRichTextEditor.getNativeApi();

                if (oNativeEditor && typeof oNativeEditor.insertContent === "function") {
                    oRichTextEditor.focus();
                    oNativeEditor.insertContent(sHtml);
                    return;
                }

                oRichTextEditor.setValue((oRichTextEditor.getValue() || "") + sHtml);
                return;
            }

            const oEditor = document.getElementById(sEditorId);

            if (!oEditor) {
                return;
            }

            const bRestored = this._restoreEditorSelection(sEditorId);

            if (bRestored) {
                document.execCommand("insertHTML", false, sHtml);
                this._saveEditorSelection(sEditorId);
                return;
            }

            oEditor.innerHTML = oEditor.innerHTML + sHtml;
            oEditor.focus();
            this._saveEditorSelection(sEditorId);
        },
        _previewClause: function (oClause) {
            const oHtml = new HTML({
                sanitizeContent: false,
                content:
                    "<div style='padding:1rem;font-family:Arial, sans-serif;line-height:1.5;'>" +
                    "<h3>" + this._escapeHtml(oClause.title) + "</h3>" +
                    "<div style='font-size:0.85rem;color:#556b82;margin-bottom:1rem;'>" +
                    this._escapeHtml(oClause.category) +
                    " · " +
                    this._escapeHtml(oClause.version) +
                    " · " +
                    this._escapeHtml(oClause.status) +
                    "</div>" +
                    oClause.html +
                    "</div>"
            });

            const oDialog = new Dialog({
                title: "Vista previa de cláusula",
                contentWidth: "700px",
                contentHeight: "500px",
                verticalScrolling: true,
                resizable: true,
                draggable: true,
                content: [oHtml],
                endButton: new Button({
                    text: "Cerrar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _saveHtmlDocxVersion: async function (oItem, sEditorId, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
            const sEditedHtml = this._getEditorHtmlContent(sEditorId);

            if (!sEditedHtml) {
                MessageBox.error("No se encontró contenido en el editor.");
                return;
            }

            try {
                oDialog.setBusy(true);

                const oResult = await this._fetchJson(
                    sApiBaseUrl + "/api/files/edit/docx-version",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            sourcePath: oItem.relativePath,
                            html: sEditedHtml,
                            status: "BORRADOR"
                        })
                    }
                );

                oDialog.setBusy(false);

                MessageToast.show(oResult.message || "Nueva versión Word guardada");

                await this._refreshRepositoryAfterGeneration();

                MessageBox.success(
                    "Nueva versión Word creada:\n\n" +
                    oResult.file.name +
                    "\n\nRuta:\n" +
                    oResult.file.relativePath
                );
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo guardar como Word:\n\n" + oError.message);
            }
        },
        _getEditorHtmlContent: function (sEditorId) {
            this._rteEditors = this._rteEditors || {};

            const oRichTextEditor = this._rteEditors[sEditorId];

            if (oRichTextEditor) {
                const oNativeEditor =
                    oRichTextEditor.getNativeApi && oRichTextEditor.getNativeApi();

                if (oNativeEditor && typeof oNativeEditor.getContent === "function") {
                    return oNativeEditor.getContent() || "";
                }

                return oRichTextEditor.getValue() || "";
            }

            const oEditor = document.getElementById(sEditorId);

            if (oEditor) {
                return oEditor.innerHTML || "";
            }

            return "";
        },
        _escapeHtml: function (sValue) {
            return String(sValue || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    });
});
