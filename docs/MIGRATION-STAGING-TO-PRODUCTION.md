# Migracja Staging → Production (Automation Cloud)

Przewodnik przeniesienia **DPD Fleet Manager** ze środowiska **staging** (`staging.uipath.com`) na **produkcyjny Automation Cloud** (`cloud.uipath.com`).

## Przegląd różnic

| Aspekt | Staging | Production |
|--------|---------|------------|
| Portal | `https://staging.uipath.com` | `https://cloud.uipath.com` |
| API | `https://staging.api.uipath.com` | `https://cloud.uipath.com` |
| Hosted app | `https://<org>.staging.uipath.host/...` | `https://<org>.uipath.host/...` |
| External App | Osobna aplikacja w staging | **Nowa** aplikacja w production |
| Data Fabric | Encje staging | Encje production (nowe GUID-y) |
| OAuth Client ID | Staging client ID | Production client ID |

## Checklist migracji

### Faza 1 — Przygotowanie w Production

- [ ] Utwórz / potwierdź organizację i tenant na **cloud.uipath.com**
- [ ] Utwórz folder Orchestrator (np. `Shared/DPDCarInvestigator`) — zapisz **folder key**
- [ ] Zdeployuj proces Maestro `DPDDataInvestigator` (ten sam release co staging)
- [ ] Utwórz encje Data Fabric w production:
  - [ ] `DPD_POC` — zapisz **Entity ID**
  - [ ] `DPD_VehicleFlags` — zapisz **Entity ID**
- [ ] Utwórz projekt **Studio Web** (Coded App) lub połącz istniejący — zapisz **project GUID**
- [ ] Utwórz **External Application** (Non-Confidential, PKCE):
  - [ ] Scopes: `DataFabric.Schema.Read`, `DataFabric.Data.Read`, `PIMS`, `OR.Execution`, `OR.Jobs`, `OR.Folders.Read`
  - [ ] Redirect URI (patrz sekcja poniżej)
  - [ ] Zapisz **Application ID** (client ID)

### Faza 2 — Konfiguracja repozytorium

- [ ] Skopiuj `.uipath/deploy-config.production.example.json` → `.uipath/deploy-config.production.json`
- [ ] Uzupełnij wszystkie pola GUID / nazwy (patrz [CONFIGURATION-REFERENCE.md](CONFIGURATION-REFERENCE.md))
- [ ] Skopiuj `.env.production.example` → `.env` (lub osobny plik używany tylko przy buildzie prod)
- [ ] Zaktualizuj `src/config.ts` — **Entity ID** production dla `DPD_POC` i `DPD_VehicleFlags`
- [ ] Zaktualizuj `uipath.json`:
  - `orgName`, `tenantName`, `baseUrl`, `redirectUri`, `clientId`, `scope`
- [ ] Zaktualizuj `scripts/repack-nupkg.mjs` — `redirectUri` w generowanym `dist/uipath.json` (czytane z `uipath.json`)

Przykład `uipath.json` (production):

```json
{
  "scope": "DataFabric.Schema.Read DataFabric.Data.Read PIMS OR.Execution OR.Jobs OR.Folders.Read",
  "clientId": "<PRODUCTION_CLIENT_ID>",
  "orgName": "<production-org-name>",
  "tenantName": "<ProductionTenant>",
  "baseUrl": "https://cloud.uipath.com",
  "redirectUri": "https://<production-org-name>.uipath.host/dpdmonitoring"
}
```

Przykład `.env` (production):

```env
VITE_BYPASS_AUTH=false
VITE_UIPATH_CLIENT_ID=<PRODUCTION_CLIENT_ID>
VITE_UIPATH_ORG_NAME=<production-org-name>
VITE_UIPATH_TENANT_NAME=<ProductionTenant>
VITE_UIPATH_BASE_URL=https://cloud.uipath.com
UIPATH_PROJECT_ID=<PRODUCTION_STUDIO_PROJECT_GUID>
```

### Faza 3 — Redirect URI (Production)

Zarejestruj w External Application **oba** hosty (nazwa org i GUID org), z i bez `/`:

```
https://<org-name>.uipath.host/dpdmonitoring
https://<org-name>.uipath.host/dpdmonitoring/
https://<org-guid>.uipath.host/dpdmonitoring
https://<org-guid>.uipath.host/dpdmonitoring/
```

Studio Web designer (jeśli używany):

```
https://cloud.uipath.com/<org-name>/studio_/designer/<project-guid>
https://cloud.uipath.com/<org-name>/studio_/designer/<project-guid>/
```

### Faza 4 — Deploy production

```powershell
# Login production
uip login --organization <production-org-name> --tenant <ProductionTenant>

# Build z production .env
npm run build

# Deploy (wymaga deploy-config.production.json)
.\.uipath\deploy-dpdmonitoring.ps1 1.0.0 -Environment production
```

> Pierwszy release na production zalecany jako `1.0.0` lub zgodny z polityką wersjonowania firmy.

### Faza 5 — Dane i testy

- [ ] Załaduj / zmigruj dane testowe do encji production `DPD_POC`
- [ ] Ustaw **Vehicle ID** w `DPD_VehicleFlags` zgodnie z numerem rejestracyjnym (np. `WA 622 AV`)
- [ ] Wykonaj [TESTING.md](TESTING.md) na URL production
- [ ] Potwierdź OAuth login i scope Data Fabric

### Faza 6 — Wyłączenie staging (opcjonalnie)

- [ ] Oznacz staging jako non-prod w dokumentacji operacyjnej
- [ ] Nie używaj tego samego External App client ID na obu środowiskach

## Mapowanie plików konfiguracyjnych

| Plik | Staging | Production |
|------|---------|------------|
| `.uipath/deploy-config.*.json` | `deploy-config.staging.json` | `deploy-config.production.json` |
| `.env` | wartości staging | wartości cloud |
| `uipath.json` | `*.staging.uipath.host` | `*.uipath.host` |
| `src/config.ts` | GUID encji staging | GUID encji production |

## Uzyskanie ID z portalu

| ID | Gdzie znaleźć |
|----|----------------|
| Org GUID | Admin → Organization lub URL `cloud.uipath.com/<org-guid>/...` |
| Tenant GUID | Admin → Tenant |
| Folder key | Orchestrator → folder → URL / API |
| Entity ID | Data Fabric → encja → URL zawiera GUID |
| Studio project | Studio Web → URL `designer/<guid>` |

## Rollback

1. W Orchestrator → Apps → wybierz poprzednią wersję pakietu (jeśli dostępna w historii feed).
2. Użyj skryptu deploy z poprzednim semver na tym samym `-Environment`.
3. W razie uszkodzenia deploy: `DELETE` deployment + `POST .../versions/<N>/deploy` (patrz [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

## Uwagi prawne / operacyjne

- Nie commituj `.env`, `.uipath/.auth`, ani `deploy-config.production.json` z prawdziwymi secretami do publicznego repo — użyj `.gitignore` i Azure Key Vault / zmiennych CI w przyszłości.
- Production wymaga **osobnego** External Application — nie kopiuj staging client ID.
