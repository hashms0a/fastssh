#!/usr/bin/env bash
# Builds the FastSSH sandbox. Safe to re-run; --reset wipes ONLY the sandbox.
set -euo pipefail
T="${FASTSSH_TESTENV:-$HOME/fastssh-testenv}"
[[ "${1:-}" == "--reset" ]] && rm -rf "$T/config" "$T/ssh" "$T/legacy" "$T/bad"
mkdir -p "$T"/{config,ssh/"key dir",legacy,bad,sshd,big}
chmod 700 "$T/config" "$T/ssh"
[[ -f "$T/ssh/id_test" ]] || ssh-keygen -q -t ed25519 -N '' -C fastssh-test -f "$T/ssh/id_test"
[[ -f "$T/ssh/key dir/id_space" ]] || ssh-keygen -q -t ed25519 -N '' -f "$T/ssh/key dir/id_space"
cp "$T/ssh/id_test.pub" "$T/sshd/id_test.pub"
touch "$T/ssh/known_hosts"
cat > "$T/ssh/config" <<'EOF'
# global options before any Host (preamble, must be preserved)
ServerAliveInterval 30

Host web1 web-alias
    HostName 127.0.0.1
    Port 2222
    User keyuser
    IdentityFile ~/fastssh-testenv/ssh/id_test

Host db10
  HostName=10.0.0.10
  User=postgres
Host db2
	HostName 10.0.0.2
	IdentityFile "~/fastssh-testenv/ssh/key dir/id_space"
Host bastion
    HostName bastion.example.invalid
    ProxyJump web1
Host !negated *.corp
    User nobody
Match host *.internal
    User matched
Include conf.d/*
Host *
    ServerAliveCountMax 3
EOF
chmod 600 "$T/ssh/config"
# Legacy EasySSH shape: kebab-case keys, port as STRING, no id.
cat > "$T/legacy/hosts.json" <<'EOF'
[
 {"name":"item10","host":"127.0.0.1","port":"2222","username":"tester","password":"fastssh-tes…-out","group":"Lab","color":"rgb(0,43,54)","font":"Monospace 11","tunnels":"-L 18080:localhost:80","identity-file":"","extra-arguments":"-o ConnectTimeout=5","account":""},
 {"name":"item2","host":"127.0.0.1","port":"2222","username":"","password":"","group":"Lab","color":"","font":"","tunnels":"","identity-file":"","extra-arguments":"","account":"lab-key"},
 {"name":"my server","host":"192.0.2.10","port":"22","username":"root","password":"","group":"Unreachable","color":"","font":"","tunnels":"","identity-file":"","extra-arguments":"-o ConnectTimeout=5","account":""},
 {"name":"Сервер-1","host":"127.0.0.1","port":"2299","username":"tester","password":"","group":"Unreachable","color":"#300a24","font":"Ubuntu Mono 13","tunnels":"","identity-file":"","extra-arguments":"","account":""},
 {"name":"bad-port","host":"127.0.0.1","port":"abc","group":"Broken"}
]
EOF
cat > "$T/legacy/accounts.json" <<'EOF'
[{"name":"lab-key","username":"keyuser","password":"","identity-file":"~/fastssh-testenv/ssh/id_test"}]
EOF
cat > "$T/legacy/bookmarks.json" <<'EOF'
[{"name":"uptime","command":"uptime"},{"name":"disk","command":"df -h"}]
EOF
printf '[{"name":"trunc' > "$T/bad/hosts.json"          # corrupt JSON
: > "$T/bad/accounts.json"                               # empty file
echo '{"not":"an array"}' > "$T/bad/bookmarks.json"      # wrong top-level type
echo '{"windowWidth":"abc","scrollbackLines":99999999,"panelSize":-5}' > "$T/bad/settings.json"
echo 'not gpg data' > "$T/bad/hosts.json.gpg"            # unsupported/corrupt gpg
touch "$T/config/.hosts.json.swp"                         # hidden file to ignore
# Generated only when missing: both are expensive to rebuild (revision 2).
if [[ ! -f "$T/big/hosts.json" ]]; then
python3 -I - "$T/big/hosts.json" <<'EOF'
import json, sys
hosts = [{"name": f"node{i}", "host": f"10.1.{i//250}.{i%250}", "port": str(22 + i % 3),
          "username": "ops", "password": "", "group": f"rack{i % 50:02d}", "color": "",
          "font": "", "tunnels": "", "identity-file": "", "extra-arguments": "",
          "account": ""} for i in range(2000)]
json.dump(hosts, open(sys.argv[1], "w"))
EOF
fi
if [[ ! -f "$T/sshd/big.txt" ]]; then
  head -c 50M /dev/urandom | base64 > "$T/sshd/big.txt"    # large terminal output
fi
cat > "$T/sshd/Dockerfile" <<'EOF'
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server \
 && rm -rf /var/lib/apt/lists/* && mkdir -p /run/sshd
RUN useradd -m -s /bin/bash tester && echo 'tester:fastssh-test-pass' | chpasswd \
 && useradd -m -s /bin/bash keyuser && usermod -p '*' keyuser
COPY id_test.pub /home/keyuser/.ssh/authorized_keys
COPY big.txt /home/tester/big.txt
RUN chown -R keyuser:keyuser /home/keyuser/.ssh && chmod 700 /home/keyuser/.ssh \
 && chmod 600 /home/keyuser/.ssh/authorized_keys \
 && printf 'PasswordAuthentication yes\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/10-test.conf
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
EOF
echo "Sandbox ready at $T"
