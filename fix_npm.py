import os
import paramiko
from dotenv import load_dotenv

def main():
    load_dotenv()
    ip = os.getenv("RASPBERRY_PI_IP")
    user = os.getenv("RASPBERRY_PI_USER")
    password = os.getenv("RASPBERRY_PI_PASSWORD")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=user, password=password)

    script = f'''
echo "{password}" | sudo -S bash -c '
apt-get update > /dev/null
apt-get install -y npm > /dev/null
npm install -g pm2 > /dev/null
'
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
