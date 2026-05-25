# Development

## Wymagania

- **Node.js** 18+
- **npm** 9+
- **UiPath CLI** (`uip`) + `@uipath/codedapp-tool`
- Konto ze scope do Data Fabric i Orchestrator (staging lub production)
- **External Application** (Non-Confidential, Authorization Code + PKCE)

## Instalacja

```powershell
git clone https://github.com/mikzielinski/dpdFleetManager.git
cd dpdFleetManager
copy .env.example .env
npm install
```

## Zmienne środowiskowe (`.env`)

| Zmienna | Opis |
|---------|------|
| `VITE_BYPASS_AUTH` | `true` = mock bez logowania (tylko dev) |
| `VITE_UIPATH_CLIENT_ID` | Application ID z External Application |
| `VITE_UIPATH_ORG_NAME` | Nazwa organizacji (np. `mzpocevylrxu`) |
| `VITE_UIPATH_TENANT_NAME` | Tenant (np. `DefaultTenant`) |
| `VITE_UIPATH_BASE_URL` | `https://staging.api.uipath.com` lub `https://cloud.uipath.com` |
| `VITE_UIPATH_SCOPE` | Scope OAuth (Data Fabric, PIMS, OR.*) |
| `VITE_UIPATH_REDIRECT_URI` | Opcjonalnie; domyślnie `origin + pathname` |
| `UIPATH_PROJECT_ID` | GUID projektu Studio Web |

Zmienne `VITE_*` są **wbudowywane w bundle** przy `npm run build`.

## Logowanie CLI

```powershell
# Staging (ZAWSZE — bez --authority CLI otwiera cloud.uipath.com)
npm run login:staging

# Ręcznie:
uip logout
uip login --organization mzpocevylrxu --tenant DefaultTenant --authority https://staging.uipath.com/identity_

# Diagnostyka Data Fabric (po login:staging)
npm run diagnose:fabric
npm run diagnose:links

# Production (po migracji — inny portal)
uip login --organization <org-name> --tenant <tenant-name>
```

Deploy jednym poleceniem (z katalogu repozytorium, po loginie):

```powershell
.\deploy-now.ps1
# lub: npm run deploy:staging
```

Token trafia do `%USERPROFILE%\.uipath\.auth` (nie commituj).

## Uruchomienie lokalne

```powershell
npm run dev
# http://localhost:5173
```

W External Application zarejestruj:

- `http://localhost:5173`
- `http://localhost:5173/`

## OAuth i Redirect URI

Pełna dokumentacja (External Application, PKCE, lista URI, błędy, migracja):

**[docs/OAUTH-AND-REDIRECT.md](OAUTH-AND-REDIRECT.md)**

Skrót: SDK wysyła `redirect_uri = origin + pathname` (bez query). Na hosted priorytet ma meta `uipath:redirect-uri` z deployu.

## Struktura katalogów

```
dpdFleetManager/
├── src/
│   ├── App.tsx              # Główny ekran
│   ├── config.ts            # ID encji, kolumny, Maestro
│   ├── components/          # InvoicePreview, AnalysisResults, …
│   ├── hooks/               # useAuth, usePolling
│   ├── services/            # dataFabric, maestro, demoData
│   └── utils/               # record, oauthRedirect
├── scripts/repack-nupkg.mjs # Pakowanie .nupkg
├── .uipath/
│   ├── deploy-dpdmonitoring.ps1
│   ├── deploy-config.staging.json
│   └── deploy-config.production.example.json
├── uipath.json              # scope, redirectUri dla pakietu
└── docs/
```

## Push do Studio Web (opcjonalnie)

```powershell
npm run build
uip codedapp push <STUDIO_PROJECT_GUID>
```

Push synchronizuje kod źródłowy — **nie zastępuje** deploy hostowanego pakietu `.nupkg`.
