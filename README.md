# Uniwersytet 🎓

Pamiętnik zajęć powiązany z planem tygodni A/B: co było na zajęciach, materiały, zadania i terminy.

Widoki: **Tydzień** (plan i status wpisów) · **Zaległe** (zajęcia bez wpisu) · **Przedmioty** (oś czasu i materiały) · **Zadania** (terminy, odhaczanie) · **Niemiecki** (lektorat + link do aplikacji do niemieckiego) · **Podsumowanie** tygodnia · **⚙ Ustawienia**.

## Jak to jest zbudowane (i dlaczego jest prywatne)

| Repozytorium | Widoczność | Zawartość |
|---|---|---|
| `uniwersytet` (to) | publiczne – wymóg darmowych GitHub Pages | **tylko kod**, żadnych danych |
| `uniwersytet-dane` | **prywatne** | plan, dni wolne, wpisy (format w jego `CLAUDE.md`) |

- Strona sama w sobie jest pusta. Dane pobiera z prywatnego repo przez API GitHuba **tokenem**, który wklejasz w ⚙ Ustawieniach. Bez tokenu nic nie pokaże.
- Token zostaje tylko w przeglądarce i jest wysyłany wyłącznie do `api.github.com`. Strona ma politykę bezpieczeństwa (CSP), która blokuje wszelkie inne połączenia i obce skrypty.
- Strona nie jest indeksowana przez wyszukiwarki (`noindex`, `robots.txt`).
- Commity są podpisane anonimowym adresem `…@users.noreply.github.com`.

---

## Uruchomienie lokalnie

Oba foldery muszą leżeć obok siebie (`uniwersytet/` i `uniwersytet-dane/`). Serwer uruchamiasz w folderze **nad nimi**:

```bash
cd ~/Desktop/"Cloude Project"
python3 -m http.server 8000
```

Otwórz http://localhost:8000/uniwersytet/. Bez tokenu dane czytają się z dysku (tylko odczyt; „Zapisz” pobiera plik wpisu). Z tokenem – z GitHuba, jak na stronie.

## Publikacja (raz)

1. Na https://github.com/new załóż dwa repozytoria (bez README, .gitignore i licencji):
   - `uniwersytet` – **Public**
   - `uniwersytet-dane` – **Private**
2. Wypchnij oba foldery:
   ```bash
   cd ~/Desktop/"Cloude Project"/uniwersytet && git push -u origin main
   cd ~/Desktop/"Cloude Project"/uniwersytet-dane && git push -u origin main
   ```
   Gdy Terminal zapyta: *Username* = login GitHub, *Password* = token (patrz niżej; zwykłe hasło nie działa).
3. W repo `uniwersytet`: **Settings → Pages → Source: Deploy from a branch**, gałąź `main`, folder `/ (root)` → **Save**.
4. Po 1–2 minutach strona działa pod `https://LOGIN.github.io/uniwersytet/`.

## Token (raz na każdym urządzeniu)

1. https://github.com/settings/personal-access-tokens/new (Fine-grained token).
2. Nazwa `uniwersytet`, **Expiration: 90 dni** (potem wygenerujesz nowy).
3. **Repository access → Only select repositories →** `uniwersytet-dane` (i `uniwersytet`, jeśli tym samym tokenem wypychasz kod).
4. **Permissions → Contents: Read and write**. Nic więcej.
5. **Generate token**, skopiuj.
6. Na stronie: **⚙ → wklej token → Zapisz i połącz → Sprawdź połączenie** (powinno pokazać „prywatne”).

Zasady:
- Na cudzym komputerze odznacz „Zapamiętaj na tym urządzeniu” – token zniknie po zamknięciu karty.
- Zgubiony telefon albo podejrzenie wycieku: https://github.com/settings/personal-access-tokens → **Revoke**, potem nowy token.
- Token daje dostęp tylko do wybranych repozytoriów – nie do konta, maila ani innych repo.

Na telefonie: Safari → Udostępnij → **Do ekranu początkowego**.

## Jak zmienić kod

- Kolory: początek `css/style.css` (sekcja `:root`).
- Nazwy statusów i rodzaje zadań: góra `js/app.js` (`STATUS_LABEL`, `TASK_KINDS`).
- Liczenie tygodni A/B i statusów: `js/calendar.js`.
- Odczyt i zapis do GitHuba, nazwa repo z danymi (`DEFAULT_DATA_REPO`): `js/store.js`.
- Plan zajęć i dni wolne zmieniasz w repo `uniwersytet-dane` (instrukcja w jego README).

Po zmianie odśwież stronę; na GitHub Pages zmiana kodu pojawia się po ok. minucie (czasem ⌘⇧R).
