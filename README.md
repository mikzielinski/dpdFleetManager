# DPD Fleet Manager

UiPath **Coded Web App** dla managera floty DPD: koszty kierowców z Data Fabric, podgląd faktur (PDF), analiza Maestro **DPDDataInvestigator**, historia flag pojazdu.

**Repozytorium:** https://github.com/mikzielinski/dpdFleetManager

## Funkcje

- Tabela rekordów z encji **DPD_POC** (Data Fabric)
- Podgląd faktury (PDF / obraz) z pola pliku rekordu
- Uruchomienie i polling procesu **DPDDataInvestigator** (Maestro)
- Historia z **DPD_VehicleFlags** (po dopasowaniu Vehicle ID do numeru rejestracyjnego)
- OAuth 2.0 PKCE (External Application)

## Dokumentacja

| Temat | Link |
|-------|------|
| Spis treści | [docs/README.md](docs/README.md) |
| Architektura | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| **OAuth i Redirect URI** | [docs/OAUTH-AND-REDIRECT.md](docs/OAUTH-AND-REDIRECT.md) |
| Deploy staging | [docs/DEPLOY-STAGING.md](docs/DEPLOY-STAGING.md) |
| **Migracja staging → production** | [docs/MIGRATION-STAGING-TO-PRODUCTION.md](docs/MIGRATION-STAGING-TO-PRODUCTION.md) |
| Testowanie | [docs/TESTING.md](docs/TESTING.md) |
| Troubleshooting | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Referencja konfiguracji | [docs/CONFIGURATION-REFERENCE.md](docs/CONFIGURATION-REFERENCE.md) |

## Wymagania

- Node.js 18+
- [UiPath CLI](https://github.com/UiPath/uipath-cli) (`uip`) + `@uipath/codedapp-tool`
- External Application (Non-Confidential, PKCE) w Automation Cloud

## Szybki start (staging)

```powershell
git clone https://github.com/mikzielinski/dpdFleetManager.git
cd dpdFleetManager
copy .env.example .env
# Uzupełnij VITE_UIPATH_CLIENT_ID w .env
npm install
uip login --organization mzpocevylrxu --tenant DefaultTenant
.\.uipath\deploy-dpdmonitoring.ps1 1.0.8
```

**Aplikacja:** https://mzpocevylrxu.staging.uipath.host/dpdmonitoring/

## Skrypty npm

| Polecenie | Opis |
|-----------|------|
| `npm run dev` | Serwer deweloperski Vite |
| `npm run build` | Kompilacja TypeScript + bundle produkcyjny |
| `npm run preview` | Podgląd lokalny buildu |

## Deploy

```powershell
# Staging (domyślnie)
.\.uipath\deploy-dpdmonitoring.ps1 1.0.8

# Production (po przygotowaniu deploy-config.production.json)
.\.uipath\deploy-dpdmonitoring.ps1 1.0.0 -Environment production
```

> **Nie używaj** przycisku Orchestrator „Upgrade to latest” — znany błąd API. Używaj skryptu deploy (patrz [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)).

## Zasoby UiPath (staging)

| Zasób | ID / nazwa |
|-------|------------|
| Data Fabric `DPD_POC` | `4e2e38d9-bf4a-f111-8ef3-000d3a261acd` |
| Data Fabric `DPD_VehicleFlags` | `8d83c3fe-c34a-f111-8ef3-000d3a261acd` |
| Orchestrator release | `DPDDataInvestigator.agentic.Agentic.Process` |
| Studio project | `28ac09c2-3a5c-4ba8-a78c-80883f38e6b5` |
| Folder | `Shared/DPDCarInvestigator` |
| Package / routing | `DPDCarInvestigator.AppV2.DPDAppMonitor` → `/dpdmonitoring/` |

## Licencja

Projekt wewnętrzny DPD / UiPath. Szczegóły u właściciela repozytorium.
