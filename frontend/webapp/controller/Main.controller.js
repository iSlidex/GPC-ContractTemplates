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
    "sap/ui/core/HTML"
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
    HTML
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

        _fetchJson: async function (sUrl, oOptions) {
            const oResponse = await fetch(sUrl, oOptions);

            if (!oResponse.ok) {
                const sText = await oResponse.text();
                throw new Error(oResponse.status + " " + oResponse.statusText + " - " + sText);
            }

            return oResponse.json();
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
                        return "- " + oVariable.name + " (" + oVariable.type + ")";
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

        _loadTemplateVariables: async function (sTemplateId) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");

            return this._fetchJson(
                sApiBaseUrl + "/api/templates/" + encodeURIComponent(sTemplateId) + "/variables"
            );
        },

        _openDynamicFormDialog: function (oTemplate, aVariables) {
            const oInputsByVariable = {};
            const sDefaultContractNumber = "GPC-" + new Date().getTime().toString().slice(-6);

            const oFormBox = new VBox({
                width: "100%"
            }).addStyleClass("sapUiMediumMargin");

            oFormBox.addItem(new ObjectStatus({
                text: "Plantilla: " + oTemplate.name,
                state: "Success"
            }).addStyleClass("sapUiSmallMarginBottom"));

            oFormBox.addItem(new Label({
                text: "Número de contrato"
            }));

            const oContractNumberInput = new Input({
                value: sDefaultContractNumber,
                required: true,
                placeholder: "Ej: GPC-0002"
            });

            oFormBox.addItem(oContractNumberInput);

            aVariables.forEach(function (oVariable) {
                oFormBox.addItem(new Label({
                    text: oVariable.label + " (" + oVariable.name + ")"
                }).addStyleClass("sapUiSmallMarginTop"));

                const oInput = new Input({
                    required: true,
                    placeholder: this._placeholderForVariable(oVariable),
                    type: this._inputTypeForVariable(oVariable)
                });

                if (oVariable.name === "CONTRACT_NUMBER") {
                    oInput.setValue(sDefaultContractNumber);
                }

                if (oVariable.name === "CONTRACT_CURRENCY") {
                    oInput.setValue("USD");
                }

                oInputsByVariable[oVariable.name] = oInput;
                oFormBox.addItem(oInput);
            }.bind(this));

            const oDialog = new Dialog({
                title: "Generar contrato desde plantilla",
                contentWidth: "720px",
                contentHeight: "680px",
                verticalScrolling: true,
                resizable: true,
                draggable: true,
                content: [oFormBox],
                beginButton: new Button({
                    text: "Generar DOCX/PDF",
                    type: "Emphasized",
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
                case "CONTRACT_PURPOSE":
                    return "Objeto del contrato";
                case "START_DATE":
                case "END_DATE":
                    return "Ej: 01/07/2026";
                default:
                    return oVariable.label;
            }
        },

        _inputTypeForVariable: function (oVariable) {
            if (oVariable.type === "email") {
                return "Email";
            }

            if (oVariable.type === "number") {
                return "Number";
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

            const oValues = {};

            Object.keys(oParams.inputsByVariable).forEach(function (sVariableName) {
                oValues[sVariableName] = oParams.inputsByVariable[sVariableName].getValue();
            });

            if (oValues.CONTRACT_NUMBER && oValues.CONTRACT_NUMBER !== sContractNumber) {
                oValues.CONTRACT_NUMBER = sContractNumber;
            }

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

            oModel.setProperty("/hasGenerationResult", true);
            oModel.setProperty("/generationMessage", oResult.message || "Documentos generados correctamente");

            oModel.setProperty("/lastGeneration", {
                docxText: "Descargar DOCX generado",
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

                            new Link({
                                text: "Abrir DOCX generado",
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
            const sEditorId = "gpcHtmlEditor_" + Date.now();

            const mClausesById = {};
            const sClausesHtml = (aClauses || []).map(function (oClause) {
                mClausesById[oClause.clauseId] = oClause;

                return [
                    "<div style='border:1px solid #d9e2ec;border-radius:0.5rem;padding:0.75rem;margin-bottom:0.75rem;background:#fff;'>",
                    "<div style='font-weight:bold;margin-bottom:0.25rem;'>",
                    this._escapeHtml(oClause.title),
                    "</div>",
                    "<div style='font-size:0.8rem;color:#556b82;margin-bottom:0.5rem;'>",
                    this._escapeHtml(oClause.category),
                    " · ",
                    this._escapeHtml(oClause.version),
                    " · ",
                    this._escapeHtml(oClause.status),
                    "</div>",
                    "<button type='button' ",
                    "data-clause-id='",
                    this._escapeHtml(oClause.clauseId),
                    "' ",
                    "data-editor-id='",
                    this._escapeHtml(sEditorId),
                    "' ",
                    "style='padding:0.35rem 0.6rem;border-radius:0.35rem;border:1px solid #0a6ed1;background:#0a6ed1;color:white;cursor:pointer;'>",
                    "Insertar cláusula",
                    "</button>",
                    "</div>"
                ].join("");
            }.bind(this)).join("");

            const oHtml = new HTML({
                sanitizeContent: false,
                content:
                    "<div style='display:flex;gap:1rem;padding:1rem;height:68vh;box-sizing:border-box;'>" +

                    "<div style='flex:1;display:flex;flex-direction:column;min-width:0;'>" +
                    "<div style='margin-bottom:0.75rem;color:#556b82;'>" +
                    "Editando una representación HTML del documento. Al guardar se creará una nueva versión BORRADOR en el repositorio." +
                    "</div>" +
                    "<div id='" + sEditorId + "' " +
                    "contenteditable='true' " +
                    "style='" +
                    "flex:1;" +
                    "min-height:56vh;" +
                    "border:1px solid #c9d2dc;" +
                    "border-radius:0.5rem;" +
                    "padding:1rem;" +
                    "background:white;" +
                    "overflow:auto;" +
                    "font-family:Arial, sans-serif;" +
                    "line-height:1.5;" +
                    "'></div>" +
                    "</div>" +

                    "<div style='width:340px;border-left:1px solid #d9e2ec;padding-left:1rem;overflow:auto;'>" +
                    "<h3 style='margin-top:0;'>Repositorio de cláusulas</h3>" +
                    "<p style='font-size:0.85rem;color:#556b82;'>Selecciona una cláusula aprobada para insertarla al final del documento editado.</p>" +
                    (sClausesHtml || "<p>No hay cláusulas disponibles.</p>") +
                    "</div>" +

                    "</div>"
            });

            const oDialog = new Dialog({
                title: "Editor HTML - " + oItem.name,
                contentWidth: "95%",
                contentHeight: "88%",
                verticalScrolling: false,
                resizable: true,
                draggable: true,
                content: [oHtml],
                beginButton: new Button({
                    text: "Guardar como borrador",
                    type: "Emphasized",
                    press: async function () {
                        await this._saveHtmlDraftVersion(oItem, sEditorId, oDialog);
                    }.bind(this)
                }),
                endButton: new Button({
                    text: "Cancelar",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterOpen: function () {
                    const oEditor = document.getElementById(sEditorId);

                    if (oEditor) {
                        oEditor.innerHTML = sHtmlContent || "<p>Sin contenido para editar.</p>";
                    }

                    const aButtons = document.querySelectorAll(
                        "button[data-editor-id='" + sEditorId + "'][data-clause-id]"
                    );

                    aButtons.forEach(function (oButton) {
                        oButton.addEventListener("click", function () {
                            const sClauseId = oButton.getAttribute("data-clause-id");
                            const oClause = mClausesById[sClauseId];

                            if (!oClause || !oEditor) {
                                return;
                            }

                            const sClauseHtml = [
                                "<hr>",
                                "<section data-clause-id='",
                                this._escapeHtml(oClause.clauseId),
                                "'>",
                                oClause.html,
                                "</section>"
                            ].join("");

                            oEditor.innerHTML = oEditor.innerHTML + sClauseHtml;

                            MessageToast.show("Cláusula insertada: " + oClause.title);
                        }.bind(this));
                    }.bind(this));
                }.bind(this),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _saveHtmlDraftVersion: async function (oItem, sEditorId, oDialog) {
            const sApiBaseUrl = this.getView().getModel("app").getProperty("/apiBaseUrl");
            const oEditor = document.getElementById(sEditorId);

            if (!oEditor) {
                MessageBox.error("No se encontró el editor HTML en pantalla.");
                return;
            }

            const sEditedHtml = oEditor.innerHTML;

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