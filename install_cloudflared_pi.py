import os
import re
import shlex
import subprocess

import paramiko
from dotenv import load_dotenv


def get_windows_cloudflared_token() -> str:
    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        "(Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Cloudflared).ImagePath",
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    image_path = result.stdout.strip()
    match = re.search(r"--token\s+([^\s\"]+)", image_path)
    if not match:
        raise RuntimeError("Nie znaleziono tokena w lokalnej usludze Cloudflared.")
    return match.group(1)


def run(ssh: paramiko.SSHClient, command: str) -> None:
    stdin, stdout, stderr = ssh.exec_command(command, get_pty=True)
    exit_code = stdout.channel.recv_exit_status()
    output = stdout.read().decode("utf-8", errors="replace")
    error = stderr.read().decode("utf-8", errors="replace")
    if output:
        print(output.encode("ascii", errors="replace").decode("ascii"), end="")
    if error:
        print(error.encode("ascii", errors="replace").decode("ascii"), end="")
    if exit_code != 0:
        raise RuntimeError(f"Remote command failed with exit code {exit_code}")


def main() -> None:
    load_dotenv()

    ip = os.getenv("RASPBERRY_PI_IP")
    user = os.getenv("RASPBERRY_PI_USER")
    password = os.getenv("RASPBERRY_PI_PASSWORD")
    if not all([ip, user, password]):
        raise RuntimeError("Brakuje RASPBERRY_PI_IP/USER/PASSWORD w pliku .env.")

    token = get_windows_cloudflared_token()
    quoted_password = shlex.quote(password)
    quoted_token = shlex.quote(token)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=user, password=password, timeout=15)

    try:
        script = f"""
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v cloudflared >/dev/null 2>&1; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  apt-get update
  apt-get install -y cloudflared
fi
if [ ! -f /etc/systemd/system/cloudflared.service ]; then
  cloudflared service install {quoted_token}
fi
systemctl daemon-reload
systemctl enable --now cloudflared
echo "cloudflared active: $(systemctl is-active cloudflared)"
echo "cloudflared enabled: $(systemctl is-enabled cloudflared)"
cloudflared --version
journalctl -u cloudflared -n 12 --no-pager | sed -E 's/--token [^ ]+/--token [hidden]/g'
"""
        print(f"Installing persistent Cloudflare tunnel on {user}@{ip}...")
        run(ssh, f"echo {quoted_password} | sudo -S bash -c {shlex.quote(script)}")
        print("Done. Cloudflared is now configured as a Raspberry Pi system service.")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
