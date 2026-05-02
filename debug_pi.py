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

    # Check installed locations
    stdin, stdout, stderr = ssh.exec_command("whereis node npm nginx pm2 git")
    for line in stdout:
        print("STDOUT:", line, end="")
    for line in stderr:
        print("STDERR:", line, end="")

    ssh.close()

if __name__ == "__main__":
    main()
