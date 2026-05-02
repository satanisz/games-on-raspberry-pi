# Deploy przez Git na Raspberry Pi

Docelowy uklad:

```text
lokalny projekt
  origin -> GitHub
  pi     -> Raspberry Pi bare repo z hookiem post-receive
```

## 1. Sekrety

Plik `.env` jest ignorowany przez Git. Do repo trafia tylko `.env.example`.

Na Raspberry Pi trzymaj wlasny plik:

```bash
/home/satanisz/projects/queens/.env
```

## 2. Przygotowanie repo na Raspberry Pi

Na malinie:

```bash
mkdir -p /home/satanisz/repos
cd /home/satanisz/repos
git init --bare malinka.git
```

Skopiuj hook z projektu do repo bare:

```bash
cp /home/satanisz/projects/queens/scripts/deploy/post-receive /home/satanisz/repos/malinka.git/hooks/post-receive
chmod +x /home/satanisz/repos/malinka.git/hooks/post-receive
```

Jesli sciezki sa inne, ustaw zmienne na poczatku hooka albo przed uruchomieniem:

```bash
DEPLOY_BRANCH=master
APP_DIR=/home/satanisz/projects/queens
REPO_DIR=/home/satanisz/repos/malinka.git
PM2_PROCESS=queens-backend
```

## 3. Dodanie remote lokalnie

Na komputerze w tym projekcie:

```bash
git remote add pi satanisz@192.168.0.94:/home/satanisz/repos/malinka.git
```

GitHub dodaj jako `origin`:

```bash
git remote add origin https://github.com/TWOJ_LOGIN/TWOJE_REPO.git
```

## 4. Normalny flow pracy

Backup na GitHub:

```bash
git push origin master
```

Deploy na Raspberry Pi:

```bash
git push pi master
```

Push na oba remote'y:

```bash
git push origin master && git push pi master
```

## 5. Co robi hook

Po pushu na branch `master` hook:

- eksportuje kod do `/home/satanisz/projects/queens`,
- instaluje zaleznosci backendu z `backend/requirements.txt`,
- instaluje zaleznosci frontendu i robi `npm run build`,
- restartuje proces PM2 `queens-backend`.

Push na inne branche nie deployuje aplikacji.
