import os
import paramiko
from dotenv import load_dotenv

def main():
    load_dotenv()

    ip = os.getenv("RASPBERRY_PI_IP")
    user = os.getenv("RASPBERRY_PI_USER")
    password = os.getenv("RASPBERRY_PI_PASSWORD")

    print(f"Connecting to {user}@{ip}...")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(ip, username=user, password=password, timeout=10)
        print("Successfully connected!")
        
        script = f'''
echo "{password}" | sudo -S bash -c '
set -e
echo "Installing Node.js (v18 for 32-bit ARM compatibility)..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1

echo "Installing PM2..."
npm install -g pm2 > /dev/null 2>&1
'

echo ""
echo "========================================="
echo "SSH PUBLIC KEY FOR GITHUB:"
cat ~/.ssh/id_rsa.pub
echo "========================================="
echo ""
echo "Installation summary:"
node -v
npm -v
python3 --version
/usr/sbin/nginx -v
git --version
pm2 -v
'''

        print("Executing setup script on Raspberry Pi...")
        stdin, stdout, stderr = ssh.exec_command(script, get_pty=True)
        
        for line in iter(stdout.readline, ""):
            print(line, end="", flush=True)
            
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
