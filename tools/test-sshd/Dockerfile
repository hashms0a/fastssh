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
