# Referencja konfiguracji

## Staging (aktualne wartości przykładowe)

| Klucz | Wartość |
|-------|---------|
| Org name | `mzpocevylrxu` |
| Org ID | `c9ffe0f3-25c8-4539-a40f-1cb8e9248fd2` |
| Tenant ID | `545f9d31-8f94-4c22-9476-9f91417cc156` |
| Tenant name | `DefaultTenant` |
| Folder | `Shared/DPDCarInvestigator` |
| Folder key | `eea56026-1e4f-4d2d-81f3-b487bf2f795b` |
| Package ID | `DPDCarInvestigator.AppV2.DPDAppMonitor` |
| Routing name | `dpdmonitoring` |
| Hosted URL | https://mzpocevylrxu.staging.uipath.host/dpdmonitoring |
| Studio project | `28ac09c2-3a5c-4ba8-a78c-80883f38e6b5` |
| OAuth client (staging) | `98aa3ef7-06e0-431b-9997-1963d708bd45` |

Plik: `.uipath/deploy-config.staging.json`

## Data Fabric (staging — `src/config.ts`)

| Encja | Stała | Entity ID |
|-------|-------|-----------|
| Koszty / faktury | `DPD_POC_ENTITY_ID` | `4e2e38d9-bf4a-f111-8ef3-000d3a261acd` |
| Flagi pojazdów | `DPD_VEHICLE_FLAGS_ENTITY_ID` | `8d83c3fe-c34a-f111-8ef3-000d3a261acd` |

> **Uwaga:** Nie używaj GUID pojedynczego **pola** jako ID encji.

## Maestro / Orchestrator

| Stała | Wartość |
|-------|---------|
| `ORCHESTRATOR_RELEASE_NAME` | `DPDDataInvestigator.agentic.Agentic.Process` |
| `MAESTRO_FOLDER_PATH` | `Shared/DPDDataInvestigator` |
| `MAESTRO_INPUT_RECORD_ARG` | `InRecord_Id` |

## OAuth i Redirect URI

Pełny przewodnik: **[OAUTH-AND-REDIRECT.md](OAUTH-AND-REDIRECT.md)** (External Application, lista URI, błędy, flow PKCE).

## Zmienne `VITE_*` (build-time)

| Zmienna | Opis |
|---------|------|
| `VITE_BYPASS_AUTH` | `true` = tryb demo bez logowania |
| `VITE_UIPATH_CLIENT_ID` | External Application ID |
| `VITE_UIPATH_ORG_NAME` | Nazwa organizacji |
| `VITE_UIPATH_TENANT_NAME` | Nazwa tenanta |
| `VITE_UIPATH_BASE_URL` | Bazowy URL API |
| `VITE_UIPATH_SCOPE` | Scopes OAuth (spacje) |
| `VITE_UIPATH_REDIRECT_URI` | Opcjonalny stały redirect |

## Meta tagi (runtime na hosted)

Wstrzykiwane przez platformę do `index.html`:

| Meta | Przykład |
|------|----------|
| `uipath:cdn-base` | `https://uipath-apps-stg.azureedge.net/codedapps/.../8` |
| `uipath:client-id` | OAuth client |
| `uipath:folder-key` | Folder Orchestrator |
| `uipath:redirect-uri` | Hosted redirect |

## Pola faktury (kandydaci)

Zdefiniowane w `INVOICE_FILE_FIELD_CANDIDATES`:

`Invoice File`, `InvoiceFile`, `Invoice`, `invoiceFile`, `InvoiceRecipt`, `Attachment`, …

## Production

Skopiuj szablony i uzupełnij:

- `.uipath/deploy-config.production.example.json` → `deploy-config.production.json`
- `.env.production.example` → `.env`
- Zaktualizuj `src/config.ts` — nowe Entity ID

Patrz: [MIGRATION-STAGING-TO-PRODUCTION.md](MIGRATION-STAGING-TO-PRODUCTION.md)
