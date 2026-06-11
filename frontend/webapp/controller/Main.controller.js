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
) {
    "use strict";

    return Controller.extend("com.gpc.contracts.GPCGestindeContratos.controller.Main", {
        onInit: function () {
            const sApiBaseUrl = this._getApiBaseUrl();

            const oModel = new JSONModel({
                apiBaseUrl: sApiBaseUrl,
                backendStatus: "Validando backend...",
                backendStatusState: "Warning",
                templates: [],
                repositoryTree: [],
                hasGenerationResult: false,
                generationMessage: "",
                lastGeneration: {
                    docxText: "",
                    docxUrl: "",
                    pdfText: "",
                    pdfUrl: "",
                    metadataText: "",
                    metadataUrl: ""
                }
            });

            this.getView().setModel(oModel, "app");
            this._loadInitialData();
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

                const [oTemplates, oRepository] = await Promise.all([
                    this._fetchJson(sApiBaseUrl + "/api/templates"),
                    this._fetchJson(sApiBaseUrl + "/api/repository")
                ]);

                oModel.setProperty("/backendStatus", "Backend conectado");
                oModel.setProperty("/backendStatusState", "Success");
                oModel.setProperty("/templates", oTemplates.templates || []);
                oModel.setProperty("/repositoryTree", this._prepareTree(oRepository.tree || []));

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
            const mLabels = {
                SEND_FOR_APPROVAL: "Enviar a aprobación",
                APPROVE: "Aprobar",
                RELEASE: "Liberar",
                APPROVE_AND_RELEASE: "Aprobar + liberar",
                REOPEN: "Reabrir",
                ARCHIVE: "Archivar",
                CREATE_NEW_VERSION: "Nueva versión",
                RESTORE: "Restaurar"
            };

            return mLabels[sAction] || sAction;
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
                const oResult = await this._fetchJson(sApiBaseUrl + "/api/clauses");
                this._openClausesManagementDialog(oResult.clauses || []);
            } catch (oError) {
                MessageBox.error("No se pudo cargar la biblioteca de cláusulas:\n\n" + oError.message);
            }
        },

        _openClausesManagementDialog: function (aClauses) {
            const sTableId = "gpcClauseManager_" + Date.now();
            const mClausesById = {};
            const sRows = (aClauses || []).map(function (oClause) {
                mClausesById[oClause.clauseId] = oClause;

                return [
                    "<tr>",
                    "<td>", this._escapeHtml(oClause.title), "</td>",
                    "<td>", this._escapeHtml(oClause.version), "</td>",
                    "<td>", this._escapeHtml(oClause.status), "</td>",
                    "<td>", this._escapeHtml(oClause.class), "</td>",
                    "<td>", this._escapeHtml(oClause.type), "</td>",
                    "<td>", this._escapeHtml(oClause.governingLaw), " / ", this._escapeHtml(oClause.language), "</td>",
                    "<td>",
                    "<button data-action='version' data-clause-id='", this._escapeHtml(oClause.clauseId), "'>Versión</button> ",
                    "<button data-action='variant' data-clause-id='", this._escapeHtml(oClause.clauseId), "'>Variante</button> ",
                    (oClause.availableActions || []).map(function (sAction) {
                        return "<button data-action='" + this._escapeHtml(sAction) + "' data-clause-id='" +
                            this._escapeHtml(oClause.clauseId) + "'>" + this._escapeHtml(this._labelForAction(sAction)) + "</button>";
                    }.bind(this)).join(" "),
                    "</td>",
                    "</tr>"
                ].join("");
            }.bind(this)).join("");

            const oHtml = new HTML({
                sanitizeContent: false,
                content: [
                    "<div style='padding:1rem;overflow:auto;'>",
                    "<table id='", sTableId, "' style='width:100%;border-collapse:collapse;'>",
                    "<thead><tr>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Título</th>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Versión</th>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Estado</th>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Clase</th>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Tipo</th>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Ley / idioma</th>",
                    "<th style='text-align:left;border-bottom:1px solid #ccc;'>Acciones</th>",
                    "</tr></thead><tbody>",
                    sRows || "<tr><td colspan='7'>No hay cláusulas disponibles.</td></tr>",
                    "</tbody></table>",
                    "</div>"
                ].join("")
            });

            const oDialog = new Dialog({
                title: "Gestionar cláusulas",
                contentWidth: "95%",
                contentHeight: "75%",
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
                    const oTable = document.getElementById(sTableId);

                    if (!oTable) {
                        return;
                    }

                    oTable.addEventListener("click", async function (oEvent) {
                        const oButton = oEvent.target;
                        const sClauseId = oButton && oButton.getAttribute("data-clause-id");
                        const sAction = oButton && oButton.getAttribute("data-action");

                        if (!sClauseId || !sAction) {
                            return;
                        }

                        await this._executeClauseManagerAction(sClauseId, sAction, oDialog);
                    }.bind(this));
                }.bind(this),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _executeClauseManagerAction: async function (sClauseId, sAction, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
            let sUrl;

            if (sAction === "version") {
                sUrl = sApiBaseUrl + "/api/clauses/" + encodeURIComponent(sClauseId) + "/version";
            } else if (sAction === "variant") {
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
                oDialog.close();
                MessageToast.show("Acción de cláusula ejecutada");
                await this._refreshTemplatesAndRepository();

                if (oResult.newClause || oResult.clause) {
                    MessageBox.success("Text block actualizado:\n\n" + ((oResult.newClause || oResult.clause).clauseId || ""));
                }
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo ejecutar la acción de cláusula:\n\n" + oError.message);
            }
        },

        _openTemplatePropertiesDialog: function (oTemplate, aVariables) {
            const oInputs = {};
            const aFields = [
                ["name", "Nombre"],
                ["contentType", "Content type"],
                ["categories", "Categorías"],
                ["governingLaw", "Governing law"],
                ["language", "Idioma"],
                ["description", "Descripción"],
                ["validFrom", "Válido desde"],
                ["validTo", "Válido hasta"],
                ["owner", "Owner"]
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
                title: "Propiedades / Ciclo de vida",
                contentWidth: "720px",
                contentHeight: "760px",
                verticalScrolling: true,
                resizable: true,
                draggable: true,
                content: [oBox],
                beginButton: new Button({
                    text: "Guardar metadata",
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
                MessageToast.show("Metadata de plantilla guardada");
                await this._refreshTemplatesAndRepository();
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo guardar metadata:\n\n" + oError.message);
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

            const sDefaultContractNumber = "900000000001";

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
                text: "Plantilla: " + oTemplate.name,
                state: "Success"
            }).addStyleClass("sapUiSmallMarginBottom"));

            oFormBox.addItem(new Title({
                text: "Consulta de contrato SAP",
                level: "H4"
            }).addStyleClass("sapUiSmallMarginTop"));

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

            addSection("Datos del contratista", [
                "CONTRACTOR_NAME",
                "CONTRACTOR_ID",
                "CONTRACTOR_ADDRESS",
                "CONTRACTOR_EMAIL"
            ]);

            addSection("Datos comerciales del contrato", [
                "CONTRACT_PURPOSE",
                "CONTRACT_AMOUNT",
                "CONTRACT_CURRENCY"
            ]);

            addSection("Vigencia", [
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

            addSection("Otros datos requeridos por la plantilla", aOtherVariables);
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

                oModel.setProperty("/repositoryTree", this._prepareTree(oRepository.tree || []));
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
                                text: aMessages.length
                                    ? aMessages.join("\n")
                                    : "Sin mensajes de validación."
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
                    text: "Refrescar variables SAP",
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
            const oContext = this._lastGenerationContext;

            if (!oContext) {
                MessageBox.warning("No hay contexto de generación para refrescar.");
                return;
            }

            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

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
                this._lastGenerationContext.values = oResult.values || oContext.values;
                MessageBox.information(
                    (oResult.message || "Variables refrescadas") +
                    "\n\nEstado: " +
                    (oResult.virtualDocument && oResult.virtualDocument.status || "N/D") +
                    "\n\nMensajes:\n" +
                    ((oResult.virtualDocument && oResult.virtualDocument.messages || []).join("\n") || "Sin mensajes")
                );
            } catch (oError) {
                oDialog.setBusy(false);
                MessageBox.error("No se pudo refrescar el documento virtual:\n\n" + oError.message);
            }
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

                            const sClauseHtml = [
                                "<hr>",
                                "<section data-clause-id='",
                                this._escapeHtml(oClause.clauseId),
                                "'>",
                                oClause.html,
                                "</section>",
                                "<p><br></p>"
                            ].join("");

                            this._insertHtmlAtCursor(sEditorId, sClauseHtml);

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
