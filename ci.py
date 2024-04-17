#!/usr/bin/env python3
# ubuntu: apt install python3-blessed
from blessed import Terminal
import os, json, subprocess, sys

term = Terminal()
if 'GITHUB_ACTOR' not in os.environ:
    print("Make sure you have GITHUB_ACTOR in your environment variables e.g. .zshrc")
    sys.exit(1)
GITHUB_ACTOR = os.environ['GITHUB_ACTOR']

def main():
    selection = -1
    with term.fullscreen(), term.cbreak():
        print(term.home + term.clear)
        while selection not in ('1', '2', '3', '4', 'q'):
            print(term.move_y(1) + "Please select an option:")
            print("1. SSH into build machine")
            print("2. SSH into bench machine")
            print("3. Start/Stop spot machines")
            print("q. Quit")
            with term.location(0, term.height - 1):
                selection = term.inkey()

    if selection == '1':
        ssh_into_machine('x86')
    elif selection == '2':
        ssh_into_machine('bench-x86')
    elif selection == '3':
        manage_spot_instances()

def ssh_into_machine(suffix):
    GITHUB_ACTOR = os.getenv('GITHUB_ACTOR', 'default_actor')
    ssh_key_path = os.path.expanduser('~/.ssh/build_instance_key')
    if not os.path.exists(ssh_key_path):
        print("SSH key does not exist.")
        return

    # Command to get the instance information
    cmd = f'aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" "Name=tag:Name,Values=aztec-packages-{GITHUB_ACTOR}-{suffix}" --output json --region us-east-2'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(result.stdout)

    if result.returncode != 0:
        print("Failed to get AWS instances:", result.stderr)
        return

    # Parse the output to find the public IP address
    try:
        instances_data = json.loads(result.stdout)
        instance = instances_data['Reservations'][0]['Instances'][0]
        instance_ip = instance['PublicIpAddress']
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        print("Error parsing AWS CLI output:", e)
        return

    # SSH command using the public IP
    ssh_cmd = f"ssh -i {ssh_key_path} ubuntu@{instance_ip}"
    print(f"Connecting to {instance_ip}...")
    ssh_process = subprocess.Popen(ssh_cmd, shell=True)
    ssh_process.wait()  # Wait for the SSH session to complete

def manage_spot_instances():
    action = input("Enter 'start' to run or 'stop' to stop spot instances: ")
    if action == 'start':
        subprocess.run('gh workflow run start-spot.yml', shell=True)
    elif action == 'stop':
        subprocess.run('gh workflow run stop-spot.yml', shell=True)

if __name__ == "__main__":
    main()

