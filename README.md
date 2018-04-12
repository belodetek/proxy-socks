# proxy-socks

> TL;DR
Follow these [instructions](#instructions) to start building residential back-connect proxy network of Windows, Linux and OS X desktop PCs.

# about
This Electron desktop app starts a [SOCKSv5 proxy server](https://github.com/mscdex/socksv5) on the local machine and forwards a randomly advailable remote port on a [Linux box](#server-config) to itself on port over [SSH](https://github.com/mscdex/ssh2). It requires a few custom configurations on the remote server to find an available TCP port.

# instructions

## client config
* create SSH key locally and copy to the server

        mkdir -p ~/.proxy-socks\
          && echo -e 'y\n' | ssh-keygen -f ~/.proxy-socks/id_rsa\
          && ssh-copy-id -i ~/.proxy-socks/id_rsa.pub root@{{server}}

* create `config.json`, replace `{{server}}` with the hostname or IP of the server
```
cat << EOF > ~/.proxy-socks/config.json
{
    "username": "tunnel",
    "host": "{{server}}",
    "port": 22,
    "privateKey": "${HOME}/.proxy-socks/id_rsa",
    "socksPort": 1080
}
EOF
```

## server config
* deploy an Ubuntu or Debian box (e.g. on [DigitalOcean](https://m.do.co/c/937b01397c94))

* create `tunnel` user, set a password and key

        useradd -m tunnel -s /bin/bash\
          && mkdir -p /home/tunnel/.ssh\
          && cat ~/.ssh/authorized_keys > /home/tunnel/.ssh/authorized_keys

* create `random_tcp_port` script
```
cat << EOF > /home/tunnel/random_tcp_port
#!/usr/bin/env bash

PIDFILE="/home/tunnel/\$(basename "\${0}").pid"

function with_backoff {
  local max_attempts=\${ATTEMPTS-5}
  local timeout=\${TIMEOUT-1}
  local attempt=0
  local exitCode=0

  while [[ \$attempt < \$max_attempts ]]
  do
    "\$@"
    exitCode=\$?

    if [[ \$exitCode == 0 ]]
    then
      break
    fi

    echo "Failure! Retrying in \$timeout.." 1>&2
    sleep \$timeout
    attempt=\$(( attempt + 1 ))
    timeout=\$(( timeout * 2 ))
  done

  if [[ \$exitCode != 0 ]]
  then
    echo "You've failed me for the last time! (\$@)" 1>&2
  fi

  return \$exitCode
}

function random_unused_port {
    local port=\$(shuf -i 10000-65000 -n 1)
    netstat -lat | grep \$port > /dev/null
    if [[ \$? == 1 ]] ; then
        echo \$port
    else
        random_unused_port
    fi
}

if [ -f "\${PIDFILE}" ]; then
    PID=\$(cat "\${PIDFILE}")
    ps -p \${PID} > /dev/null 2>&1
    if [ $? -eq 0 ]; then
      echo "\${0}: process already running (\${PID})"
      exit 1
    else
      echo \$\$ > "\${PIDFILE}"
      if [ \$? -ne 0 ]; then
        echo "\${0}: could not create \${PIDFILE}"
        exit 1
      fi
    fi
else
    echo \$\$ > "\${PIDFILE}"
    if [ \$? -ne 0 ]; then
      echo "\${0}: could not create \${PIDFILE}"
      exit 1
    fi
    PID=\$(cat "\${PIDFILE}")
fi

if [ -f "\${PIDFILE}" ]; then
    with_backoff random_unused_port
fi
rm "\${PIDFILE}"
EOF

chmod +x /home/tunnel/random_tcp_port
chown tunnel:tunnel -hR /home/tunnel
```

* test script (e.g. TCP port between `10,000` and `65,000`)
```
# /home/tunnel/random_tcp_port
39585
```

* update sshd config and restart
```
cat << EOF >> /etc/ssh/sshd_config

Match User tunnel
  ForceCommand . /home/tunnel/random_tcp_port
EOF

service ssh restart
```

* test connectivity

        ssh -i ~/.proxy-socks/id_rsa tunnel@{{server}}

* ...
