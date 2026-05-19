# Testowanie

## Po każdym deploy (staging lub production)

### 1. Smoke — ładowanie aplikacji

- [ ] Otwórz URL hosted (np. `https://<org>.staging.uipath.host/dpdmonitoring/`)
- [ ] Hard refresh: **Ctrl+Shift+R** lub okno incognito
- [ ] Brak 404 w Network na `assets/index-*.js` i `assets/index-*.css`
- [ ] W źródle strony: `uipath:cdn-base` wskazuje aktualny `deployVersion`

### 2. OAuth

- [ ] Logowanie kończy się sukcesem (brak `redirect_uri mismatch`)
- [ ] Tabela rekordów się ładuje (Data Fabric)

### 3. Rekord testowy — pojazd i flagi

| Scenariusz | Kroki | Oczekiwany wynik |
|------------|-------|------------------|
| Historia pojazdu | Rekord **WA 622 AV**, status **Flagged** | Historia pusta dopóki w `DPD_VehicleFlags` nie ustawisz **Vehicle ID** = `WA 622 AV` (lub znormalizowany ten sam numer) |
| Po ustawieniu Vehicle ID | Odśwież rekord | Historia pokazuje powiązane flagi |

### 4. Faktura

- [ ] Wybierz rekord z załącznikiem faktury
- [ ] Sekcja **„Podgląd faktury”** pokazuje PDF lub obraz
- [ ] Jeśli pusto: w konsoli `window.__lastRecord` — sprawdź nazwę pola pliku vs `INVOICE_FILE_FIELD_CANDIDATES`

### 5. Analiza Maestro

- [ ] Klik **„Analizuj”**
- [ ] Widoczny baner postępu **lub** czytelny komunikat błędu Maestro (nie „cisza” w UI)
- [ ] Po zakończeniu — wyniki w panelu analizy

### 6. Decyzja managera (jeśli w scope release)

- [ ] Zapis komentarza / zmiana statusu rekordu (jeśli włączone w buildzie)

## Weryfikacja wersji bundle

W konsoli przeglądarki:

```javascript
document.querySelector('meta[name="uipath:cdn-base"]')?.content
document.querySelector('script[type="module"]')?.src
```

Porównaj hash w `dist/index.html` z deployowanym plikiem.

## Test lokalny (dev)

```powershell
# VITE_BYPASS_AUTH=true — mock bez OAuth
npm run dev
```

Nie zastępuje testów na hosted — OAuth i meta tagi CDN działają inaczej.

## Raportowanie błędów

Do zgłoszenia dołącz:

1. Wersja semver (`1.0.8`)
2. Środowisko (staging / production)
3. `deployVersion` z meta `cdn-base`
4. Zrzut Network (404 na assets)
5. `JSON.stringify(window.__lastRecord, null, 2)` dla problemów z fakturą
