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

    # Check for dpkg/apt running
    stdin, stdout, stderr = ssh.exec_command("ps aux | grep -E 'apt|dpkg|setup'")
    for line in stdout:
        print(line, end="")

    ssh.close()

if __name__ == "__main__":
    main()
