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

            MessageBox.information(
                "Archivo del repositorio:\n\n" +
                oItem.name +
                "\n\nRuta:\n" +
                oItem.relativePath +
                "\n\nModificado:\n" +
                (oItem.modifiedAt || "N/D"),
                {
                    actions: ["Vista previa", "Descargar", MessageBox.Action.CLOSE],
                    emphasizedAction: "Vista previa",
                    onClose: function (sAction) {
                        if (sAction === "Vista previa") {
                            this._previewRepositoryFile(oItem);
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

                const sHtml =
                    "<div style='padding:1rem;font-family:Arial, sans-serif;line-height:1.5;'>" +
                    "<h3>" + this._escapeHtml(oItem.name) + "</h3>" +
                    oResult.html +
                    "</div>";

                const oHtml = new HTML({
                    content: sHtml
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
                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                oDialog.open();
            } catch (oError) {
                MessageBox.error("No se pudo previsualizar el DOCX:\n\n" + oError.message);
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
