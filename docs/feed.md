# Poza bańką — bot RSS na Malince

Panel: https://satanisz.pl/feed/ (prywatne dane wymagają osobnego klucza).
Bot: https://t.me/brajanusz_satanisz_bot.

## Działanie

- Import OPML przy pierwszym uruchomieniu; kolejne importy nie duplikują adresów.
- Pobieranie RSS/Atom co 4 godziny i 15 minut przed godziną wysyłki.
- Domyślnie 5 niewysłanych artykułów z ostatnich 7 dni o 08:05 Europe/Warsaw.
  Czas letni/zimowy jest automatyczny. Przy braku 5 różnych źródeł zestaw będzie krótszy.
- Przy normalnej pracy Gemini analizuje metadane przed wysyłką. Po dłuższej awarii
  urządzenia bot nadrabia dzisiejszy zestaw po starcie, więc może przyjść później.
- Wysyłka jest pojedynczą wiadomością z 5 linkami, krótkimi opisami po polsku
  oraz przyciskami ocen. Opisy bazują na tytułach i fragmentach z RSS, nie pełnej treści.
- Panel pozwala dodawać źródła, importować OPML, włączać/wyłączać źródła,
  ustalać tematy i priorytety, promować/blokować zwroty, zmieniać godzinę i klucze.

## Algorytm

1. Odrzuca linki już zarezerwowane/wysłane, powtórzone tytuły, odrzucone artykuły,
   zbyt stare teksty oraz teksty z blokowanymi zwrotami.
2. Maksymalnie 3 kandydatów z kanału trafia do puli do 80 tekstów.
   Losowanie z dziennym ziarnem i pierwszeństwo źródeł z niewielką liczbą tekstów
   zapobiegają przejęciu puli przez duże portale.
3. Gemini 3.6 Flash ocenia do 40 dotąd nieocenionych kandydatów: wartość poznawczą,
   nieoczywistość perspektywy i szeroki temat. Limit wynosi 4 wywołania dziennie,
   obejmuje także nieudane wywołania. Błędna odpowiedź uruchamia lokalny dobór.
4. Trzy miejsca łączą jakość, świeżość, nowość, historię ekspozycji oraz niewielkie
   ręczne premie. Czwarte mocniej premiuje temat rzadko pokazywany przez 30 dni.
   Piąte jest losowane z pozostałych dopuszczonych kandydatów.
5. Najwyżej jeden tekst z danego źródła i domeny w zestawie. Powtarzające się tematy
   dostają karę przy wyborze kolejnych pozycji.
6. 👍 oznacza „zaskoczyło / odkryłem coś”, 👎 „słaba jakość”. Suma ocen daje małą,
   ograniczoną premię/karę źródła (od -0,10 do +0,10). Nie wzmacnia podobnych tematów.
   Każdy artykuł ma jedną aktualną ocenę; można ją zmienić lub cofnąć w panelu.

Model 2.5 Flash podany na początku zwrócił w teście generowania HTTP 404 z informacją
o braku dostępności dla nowych użytkowników i wskazaniem 3.6 Flash jako zamiennika.
Model można zmienić w panelu.

Odkrywanie działa w obrębie dodanych kanałów. Bot nie subskrybuje sam nowych stron.
Ocena nowości przez LLM jest przybliżeniem; historia tematów dodatkowo ogranicza
powtarzalność. Kanały bez daty otrzymują datę pierwszego znalezienia przez bota.

## Utrzymanie

Backend: `backend/app/feed.py`, API `/api/feed/*`, panel `frontend/public/feed/`.
Na Pi działa w tym samym pojedynczym procesie PM2 co backend Queens.
Usługa `pm2-satanisz` jest włączona przy starcie systemu.

Dane: `/home/satanisz/projects/queens/backend/data/feed.sqlite3`.
Sekrety: `/home/satanisz/projects/queens/backend/data/feed-secrets.env` (uprawnienia 0600).
Klucz panelu lokalnie: `backend/data/feed-access.txt`. Cały katalog danych jest ignorowany przez Git.
Zrób kopię SQLite przez SQLite Backup API (baza pracuje w trybie WAL) oraz osobną
prywatną kopię pliku sekretów. Sam plik `.sqlite3` kopiowany podczas zapisu nie wystarcza.

Wdrożenie tylko tej funkcji, z datowanymi kopiami nadpisywanych plików:

```powershell
uv run python scripts/deploy/feed_pi.py
uv run python scripts/deploy/feed_pi.py --status
uv run python -m unittest discover -s backend/tests -v
```

Skrypt zachowuje istniejące sekrety na serwerze. Przy późniejszym zwykłym wdrożeniu
przez Git pliki statyczne zostaną skopiowane przez Vite z `public/feed` do `dist/feed`.

`digests.day` jest unikalne. Rezerwacja następuje przed żądaniem Telegram.
Timeout / przerwany proces podczas wysyłki oznacza niepewny wynik: automatyczne
ponowienie jest blokowane i panel wyświetla ostrzeżenie. Po takim zdarzeniu należy
sprawdzić Telegram przed ręczną ingerencją w rejestr wysyłek. Priorytetem jest brak duplikatów.
Przycisk „Wyślij dzisiejszy zestaw” zużywa dzisiejszą wysyłkę; nie jest dodatkowym testem.

Bezpieczeństwo: oddzielny losowy klucz panelu, brak sekretów w odpowiedziach API,
prywatne parowanie jednego konta Telegram, publiczne adresy RSS ze sprawdzaniem DNS
i przypięciem połączenia do zweryfikowanego IP, limity rozmiaru i przekierowań,
bezpieczny parser OPML oraz traktowanie metadanych jako niezaufanych danych dla LLM.

Dokumentacja integracji: [Telegram Bot API](https://core.telegram.org/bots/api),
[Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash),
[Generowanie odpowiedzi](https://ai.google.dev/api/generate-content).
