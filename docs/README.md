# Dokumentacja DPD Fleet Manager

Pełna dokumentacja projektu **UiPath Coded Web App** dla managera floty DPD.

## Spis treści

| Dokument | Opis |
|----------|------|
| [Architektura](ARCHITECTURE.md) | Komponenty, przepływ danych, integracje |
| [Development](DEVELOPMENT.md) | Lokalny dev, `.env`, struktura kodu |
| [**OAuth i Redirect URI**](OAUTH-AND-REDIRECT.md) | External Application, PKCE, `redirect_uri`, błędy logowania |
| [Deploy — Staging](DEPLOY-STAGING.md) | Build, publish, deploy na staging |
| [Migracja Staging → Production](MIGRATION-STAGING-TO-PRODUCTION.md) | Przeniesienie na Automation Cloud (produkcja) |
| [Testowanie](TESTING.md) | Checklisty QA po wdrożeniu |
| [Troubleshooting](TROUBLESHOOTING.md) | Typowe błędy (404 bundle, upgrade 400, OAuth) |
| [Referencja konfiguracji](CONFIGURATION-REFERENCE.md) | ID encji, procesów, zmiennych środowiskowych |

## Szybki start (staging)

```powershell
git clone https://github.com/mikzielinski/dpdFleetManager.git
cd dpdFleetManager
copy .env.example .env
npm install
npm run login:staging
npm run build
npm run deploy:staging
```

Aplikacja: https://mzpocevylrxu.staging.uipath.host/dpdmonitoring/

## Repozytorium

https://github.com/mikzielinski/dpdFleetManager
