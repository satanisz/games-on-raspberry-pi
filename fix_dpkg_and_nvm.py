import os
import sys
import paramiko
from dotenv import load_dotenv

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    load_dotenv()
    ip = os.getenv("RASPBERRY_PI_IP")
    user = os.getenv("RASPBERRY_PI_USER")
    password = os.getenv("RASPBERRY_PI_PASSWORD")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=user, password=password)

    script = f'''
echo "{password}" | sudo -S bash -c '
dpkg --configure -a > /dev/null 2>&1
apt-get install -f -y > /dev/null 2>&1
'

export NVM_DIR="$HOME/.nvm"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash > /dev/null 2>&1
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20 > /dev/null 2>&1 || nvm install 18 > /dev/null 2>&1
npm install -g pm2 > /dev/null 2>&1

echo "NVM setup complete."
node -v
npm -v
pm2 -v
'''

    stdin, stdout, stderr = ssh.exec_command(script, get_pty=True)
    for line in iter(stdout.readline, ""):
        print(line, end="")

    ssh.close()

if __name__ == "__main__":
    main()
