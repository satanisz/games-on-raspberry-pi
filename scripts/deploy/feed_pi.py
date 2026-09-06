"""Deploy only Feed changes, preserving the existing site and a dated rollback copy."""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
import posixpath
import shlex
import sys

import paramiko
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/home/satanisz/projects/queens'


def connect():
    cfg = dotenv_values(ROOT / '.env')
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    # Existing Malinka maintenance scripts use this same LAN host.
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(cfg['RASPBERRY_PI_IP'], username=cfg['RASPBERRY_PI_USER'],
                password=cfg['RASPBERRY_PI_PASSWORD'], timeout=15)
    return ssh


def command(ssh, text):
    _, out, err = ssh.exec_command(text, timeout=240)
    result = out.read().decode('utf-8', errors='replace')
    error = err.read().decode('utf-8', errors='replace')
    status = out.channel.recv_exit_status()
    print(result)
    if error: print(error)
    if status: raise RuntimeError(f'Remote command failed ({status})')


def deploy(ssh):
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = f'/home/satanisz/backups/feed-{timestamp}'
    sftp = ssh.open_sftp()
    def mkdir(path):
        try: sftp.stat(path)
        except FileNotFoundError:
            mkdir(posixpath.dirname(path))
            sftp.mkdir(path)
    def upload(local, relative, private=False):
        target = REMOTE + '/' + relative
        mkdir(posixpath.dirname(target))
        try:
            sftp.stat(target)
            saved = backup + '/' + relative
            mkdir(posixpath.dirname(saved))
            with sftp.open(target,'rb') as src, sftp.open(saved,'wb') as dst:
                dst.write(src.read())
            if private: sftp.chmod(saved,0o600)
        except FileNotFoundError:
            pass
        staging = target + '.feed-upload'
        sftp.put(str(local),staging)
        sftp.chmod(staging,0o600 if private else 0o644)
        sftp.posix_rename(staging,target)
        print('Uploaded',relative)
    for relative in ('backend/app/main.py','backend/app/feed.py','backend/requirements.txt'):
        upload(ROOT/relative,relative)
    for name in ('index.html','app.js','styles.css'):
        local=ROOT/'frontend/public/feed'/name
        upload(local,'frontend/public/feed/'+name)
        upload(local,'frontend/dist/feed/'+name)
    for local in (ROOT/'docs').glob('feedly*.opml'):
        upload(local,'docs/'+local.name)
    secret=ROOT/'backend/data/feed-secrets.env'
    try:
        sftp.stat(REMOTE+'/backend/data/feed-secrets.env')
        print('Preserved existing server credentials')
    except FileNotFoundError:
        upload(secret,'backend/data/feed-secrets.env',True)
    sftp.close()
    print('Rollback copies:',backup)
    command(ssh, f'{REMOTE}/.venv/bin/pip install -r {REMOTE}/backend/requirements.txt')
    command(ssh, f'if pm2 describe queens-backend >/dev/null 2>&1; then pm2 restart queens-backend --update-env; else pm2 start run.py --name queens-backend --cwd {REMOTE}/backend --interpreter {REMOTE}/.venv/bin/python; fi; pm2 save')


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser()
    parser.add_argument('--inspect',action='store_true')
    parser.add_argument('--command')
    parser.add_argument('--status',action='store_true')
    parser.add_argument('--analyze',action='store_true')
    parser.add_argument('--set-model')
    args=parser.parse_args()
    with connect() as ssh:
        if args.set_model:
            if not args.set_model.startswith('gemini-') or not all(c.isalnum() or c in '.-' for c in args.set_model):
                raise ValueError('Invalid model')
            code = 'from app import feed; feed.put("model", '+repr(args.set_model)+'); print("Model updated")'
            command(ssh,f'cd {REMOTE}/backend && ../.venv/bin/python -c '+shlex.quote(code))
        elif args.status or args.analyze:
            code = "from app import feed; "
            if args.analyze:
                code += "feed.analyze(feed.candidates(feed.settings()),feed.settings()); "
            code += "s=feed.state(); print({'paired':bool(s['config']['chat_id']),'sources':len(s['sources']),'checked':sum(bool(x['checked']) for x in s['sources']),'errors':sum(bool(x['error']) for x in s['sources']),'articles':sum(x['article_count'] for x in s['sources']),'preview':len(s['preview']),'llm_status':s['config']['llm_status'],'last_refresh':s['config']['last_refresh'],'telegram':s['config'].get('telegram_status')}); print([(x['source'],x['title']) for x in s['preview']])"
            command(ssh,f'cd {REMOTE}/backend && ../.venv/bin/python -c '+shlex.quote(code))
        elif args.inspect:
            command(ssh,f'sha256sum {REMOTE}/backend/app/main.py; {REMOTE}/.venv/bin/python --version; pm2 list')
        elif args.command: command(ssh,args.command)
        else: deploy(ssh)
