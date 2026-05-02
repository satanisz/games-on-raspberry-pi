import os

import paramiko
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        os.getenv("RASPBERRY_PI_IP"),
        username=os.getenv("RASPBERRY_PI_USER"),
        password=os.getenv("RASPBERRY_PI_PASSWORD"),
        timeout=15,
    )
    command = r"""
set -e
echo "nginx: $(systemctl is-active nginx)"
echo "cloudflared: $(systemctl is-active cloudflared) / $(systemctl is-enabled cloudflared)"
echo ""
pm2 status queens-backend --no-color
echo ""
echo "local frontend:"
curl -sS -I http://127.0.0.1/ | head -n 5
echo ""
echo "local api:"
curl -sS http://127.0.0.1/api/health
echo ""
echo ""
echo "cloudflared recent errors:"
journalctl -u cloudflared --since "30 minutes ago" --no-pager \
  | grep -Ei "error|err|failed|1033" \
  | tail -n 20 || true
"""
    stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", errors="replace")
    print(output.encode("ascii", errors="replace").decode("ascii"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err:
        print(err.encode("ascii", errors="replace").decode("ascii"))
    ssh.close()


if __name__ == "__main__":
    main()
