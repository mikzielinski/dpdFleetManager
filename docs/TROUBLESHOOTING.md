# Troubleshooting

## 404 na `assets/index-*.js` lub `index-*.css`

**Objaw:** Biały ekran, w konsoli 404 na pliki bundle.

**Przyczyna:** Rozjazd między `index.html` (stary hash) a CDN (nowy lub odwrotnie). Często po publish bez poprawnego deploy/upgrade.

**Rozwiązanie:**

1. Sprawdź `uipath:cdn-base` w źródle strony — numer na końcu URL to `deployVersion`.
2. Uruchom ponownie: `.\.uipath\deploy-dpdmonitoring.ps1 <version>`
3. **Ctrl+Shift+R** — nie zwykły F5.
4. Nie polegaj na przycisku Orchestrator **Upgrade to latest** (patrz niżej).

## Orchestrator: „Upgrading the app… failed / check dependencies”

**Przyczyna:** UI wysyła niepoprawne body upgrade (`semVersion` zamiast `version: deployVersion`).

**Rozwiązanie:** Użyj skryptu `.uipath/deploy-dpdmonitoring.ps1` lub API:

```http
PATCH /deployed/apps/{id}
{ "title": "DPDCarInvestigator.AppV2.DPDAppMonitor", "version": 8 }
```

Świeży deploy:

```http
DELETE /deployed/apps/{id}
POST /models/{systemName}/publish/versions/8/deploy
{ "title": "...", "routingName": "dpdmonitoring" }
```

## API upgrade: `invalid deployment id`

- Sprawdź, czy deployment istnieje: `GET .../deployed/apps`
- Użyj aktualnego `id` z listy (po re-deploy GUID się zmienia)
- Upewnij się, że nagłówek `x-uipath-folderkey` jest ustawiony

## PATCH zwraca 200, ale wersja się nie zmienia

Skrypt deploy wykrywa to i wykonuje **delete + fresh deploy** z `publish/versions/{deployVersion}/deploy`.

## `runtime.lastError` / TensorFlow kernels w konsoli

Komunikaty z **rozszerzeń przeglądarki** (Chrome), nie z aplikacji DPD. Testuj w **incognito** bez rozszerzeń.

## OAuth: redirect_uri mismatch

Szczegóły: **[OAUTH-AND-REDIRECT.md](OAUTH-AND-REDIRECT.md)** (sekcje 3–4 i 8).

1. Porównaj dokładny URL z paska (bez query) z listą w External Application.
2. Zarejestruj warianty z `/` i bez `/`, org name i org GUID host.
3. Na hosted nie ustawiaj sztywnego `VITE_UIPATH_REDIRECT_URI` jeśli koliduje z meta tagiem.
4. Skopiuj `redirect_uri` z ekranu błędu logowania w aplikacji (Fleet Manager pokazuje listę URI).

## Pusta faktura

1. Konsola: `window.__lastRecord`
2. Sprawdź pole pliku vs `INVOICE_FILE_FIELD_CANDIDATES` w `src/config.ts`
3. Uprawnienie `DataFabric.Data.Read` i typ pola (File) w encji

## Historia pojazdu pusta przy statusie Flagged

W encji **DPD_VehicleFlags** pole **Vehicle ID** musi odpowiadać numerowi rejestracyjnemu rekordu (np. `WA 622 AV`).

## Token wygasł podczas deploy

Skrypt odświeża token z `%USERPROFILE%\.uipath\.auth`. Jeśli refresh się nie udaje:

```powershell
uip login --organization <org> --tenant <tenant>
```

## `uip codedapp deploy` — „App has not been published”

CLI szuka innej nazwy pakietu. Używaj `.\.uipath\deploy-dpdmonitoring.ps1` zamiast surowego `uip codedapp deploy` dla pakietu `DPDCarInvestigator.AppV2.DPDAppMonitor`.

## PSReadLine: `ArgumentOutOfRangeException` (top)

Błąd konsoli Windows przy długim outputcie — **nie blokuje deploy**. Uruchom skrypt w nowym oknie PowerShell lub `pwsh`.
