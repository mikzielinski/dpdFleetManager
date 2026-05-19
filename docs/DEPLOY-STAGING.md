# Deploy na Staging

## Podsumowanie pipeline

```
npm run build  →  repack .nupkg  →  upload Orchestrator  →  publish  →  deploy/upgrade  →  weryfikacja CDN
```

Jeden skrypt wykonuje całość:

```powershell
cd dpdFleetManager
.\.uipath\deploy-dpdmonitoring.ps1 1.0.8
# opcjonalnie jawnie:
.\.uipath\deploy-dpdmonitoring.ps1 1.0.9 -Environment staging
```

Konfiguracja staging: `.uipath/deploy-config.staging.json`

## Wymagania wstępne

1. `uip login` na staging (`mzpocevylrxu` / `DefaultTenant`)
2. Plik `%USERPROFILE%\.uipath\.auth` z ważnym tokenem (skrypt odświeża przy wygaśnięciu)
3. Uprawnienia: upload pakietu, publish coded app, deploy w folderze `Shared/DPDCarInvestigator`
4. `.env` z poprawnym `VITE_UIPATH_CLIENT_ID` przed `npm run build`

## Kroki skryptu

| Krok | Opis |
|------|------|
| Build | `npm run build` → `dist/` |
| Repack | `node scripts/repack-nupkg.mjs <version>` → `.uipath/*.nupkg` |
| Upload | POST multipart do Orchestrator feed |
| Publish | Rejestracja wersji w Apps (zwraca `deployVersion`) |
| Deploy/Upgrade | PATCH `{ title, version: <deployVersion> }` lub świeży deploy |
| Verify | Porównanie hash JS/CSS na `hostedBaseUrl` |
| Push | `uip codedapp push` — sync Studio (opcjonalnie) |

## API deploy — ważne

UiPath Apps API przy **upgrade** wymaga pola:

```json
{ "title": "DPDCarInvestigator.AppV2.DPDAppMonitor", "version": 8 }
```

Gdzie `version` = **`deployVersion`** z odpowiedzi publish, **nie** `semVersion` (`"1.0.8"`).

| ❌ Nie działa | ✅ Działa |
|--------------|----------|
| `semVersion: "1.0.8"` | `version: 8` (deployVersion) |
| Przycisk „Upgrade to latest” w Orchestratorze (często 400) | Skrypt deploy lub `POST .../publish/versions/8/deploy` |

### Świeży deploy (gdy PATCH nie podnosi wersji)

1. `DELETE /deployed/apps/{id}`
2. `POST /models/{systemName}/publish/versions/{deployVersion}/deploy`  
   Body: `{ "title": "...", "routingName": "dpdmonitoring" }`

## Adresy staging

| Zasób | URL |
|-------|-----|
| Aplikacja | https://mzpocevylrxu.staging.uipath.host/dpdmonitoring/ |
| Orchestrator Apps | https://staging.uipath.com/mzpocevylrxu/DefaultTenant/orchestrator_/apps |
| External Apps | https://staging.uipath.com/mzpocevylrxu/portal_/admin/external-apps/oauth |
| Studio project | https://staging.uipath.com/mzpocevylrxu/studio_/designer/28ac09c2-3a5c-4ba8-a78c-80883f38e6b5 |

## Weryfikacja po deploy

1. **View Source** na `/dpdmonitoring/`:
   - `uipath:cdn-base` kończy się na `/8` (lub aktualny deployVersion)
   - `index-*.js` zgodny z `dist/index.html`
2. **Ctrl+Shift+R** (wyłącz cache)
3. Konsola — brak 404 na `assets/index-*.js` / `.css`

## Numeracja wersji

- **semVersion** — semver w `nupkg` (np. `1.0.8`)
- **deployVersion** — liczba całkowita przypisana przez platformę przy publish (np. `8`)

Zawsze podawaj nowy semver przy kolejnym release: `.\.uipath\deploy-dpdmonitoring.ps1 1.0.9`
