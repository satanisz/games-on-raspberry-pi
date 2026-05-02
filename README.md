# Malinka Queens

Gra logiczna Queens hostowana na Raspberry Pi.

## Struktura

- `frontend/` - React + Vite, interfejs gry.
- `backend/` - FastAPI + SQLite, logowanie PIN-em, plansze, wyniki i ranking.
- `backend/data/queens.sqlite3` - lokalna baza tworzona automatycznie poza repozytorium.

## Lokalnie

```bash
uv sync
cd frontend && npm install && npm run build
cd ../backend && uv run --project .. python run.py
```

## Raspberry Pi

Aplikacja zostala wdrozona do:

```text
/home/satanisz/projects/queens
```

Backend dziala w PM2 jako:

```bash
pm2 status queens-backend
```

Nginx serwuje frontend i przekierowuje `/api` do FastAPI na porcie `8000`.

Cloudflare Tunnel dziala na Raspberry Pi jako usluga systemowa:

```bash
systemctl status cloudflared
```

Tunel kieruje `satanisz.pl` i `www.satanisz.pl` do Nginxa na malince,
wiec aplikacja nie zalezy juz od wlaczonego komputera z Windowsem.

## Deploy przez Git

Projekt jest przygotowany pod dwa zdalne repozytoria:

- `origin` - GitHub jako backup,
- `pi` - bare repo na Raspberry Pi z hookiem `post-receive`.

Po konfiguracji deploy na maline wyglada tak:

```bash
git push pi master
```

Instrukcja konfiguracji jest w [`docs/deploy-pi-git.md`](docs/deploy-pi-git.md).
