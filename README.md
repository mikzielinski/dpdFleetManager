# dpd-fleet-manager — DPD Fleet Manager (UiPath Coded Web App)

Panel managera floty DPD do przeglądu kosztów kierowców, podglądu faktur i uruchamiania analizy Maestro (`DPDDataInvestigator`) bezpośrednio z poziomu Coded Web App.

![UiPath Coded Web App](https://img.shields.io/badge/UiPath-Coded%20Web%20App-orange)
![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-3178c6)

## Features

- Dashboard rekordów z **Data Fabric** (`DPD_POC`)
- Podgląd faktury (**PDF/obraz**) zapisanej w rekordzie
- Uruchamianie i polling procesu Maestro **`DPDDataInvestigator`**
- Historia flag z **`DPD_VehicleFlags`** po dopasowaniu Vehicle ID
- Integracja **OAuth 2.0 PKCE** (External Application)

## Quick start

```powershell
git clone https://github.com/mikzielinski/dpdFleetManager.git
cd dpdFleetManager
npm install
copy .env.example .env
# Ustaw `VITE_UIPATH_CLIENT_ID` w `.env`

npm run dev      # lokalny preview (Vite)
npm run build    # bundle produkcyjny do dist/
npm run preview  # podgląd buildu lokalnie
```

## Deploy (UiPath)

```powershell
# STAGING — wymagane --authority (bez tego otwiera cloud.uipath.com)
npm run login:staging

# Staging deploy
npm run deploy:staging
# lub: .\.uipath\deploy-dpdmonitoring.ps1 1.1.0

# Production (po przygotowaniu deploy-config.production.json)
.\.uipath\deploy-dpdmonitoring.ps1 1.0.0 -Environment production
```

> Nie używaj przycisku Orchestrator "Upgrade to latest" - znany problem API. Do deployu korzystaj ze skryptu (szczegóły: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)).

## Dokumentacja

| Temat | Link |
|-------|------|
| Spis treści | [docs/README.md](docs/README.md) |
| Architektura | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Development | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| OAuth i Redirect URI | [docs/OAUTH-AND-REDIRECT.md](docs/OAUTH-AND-REDIRECT.md) |
| Deploy staging | [docs/DEPLOY-STAGING.md](docs/DEPLOY-STAGING.md) |
| Migracja staging -> production | [docs/MIGRATION-STAGING-TO-PRODUCTION.md](docs/MIGRATION-STAGING-TO-PRODUCTION.md) |
| Testowanie | [docs/TESTING.md](docs/TESTING.md) |
| Troubleshooting | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Referencja konfiguracji | [docs/CONFIGURATION-REFERENCE.md](docs/CONFIGURATION-REFERENCE.md) |

## Wymagania

- Node.js 18+
- [UiPath CLI](https://github.com/UiPath/uipath-cli) (`uip`) + `@uipath/codedapp-tool`
- External Application (Non-Confidential, PKCE) w Automation Cloud

## Zasoby UiPath (staging)

| Zasób | ID / nazwa |
|-------|------------|
| Data Fabric `DPD_POC` | `4e2e38d9-bf4a-f111-8ef3-000d3a261acd` |
| Data Fabric `DPD_VehicleFlags` | `8d83c3fe-c34a-f111-8ef3-000d3a261acd` |
| Orchestrator release | `DPDDataInvestigator.agentic.Agentic.Process` |
| Studio project | `28ac09c2-3a5c-4ba8-a78c-80883f38e6b5` |
| Folder | `Shared/DPDCarInvestigator` |
| Package / routing | `DPDCarInvestigator.AppV2.DPDAppMonitor` -> `/dpdmonitoring/` |

## Licencja

Projekt wewnętrzny DPD / UiPath. Szczegóły u właściciela repozytorium.
