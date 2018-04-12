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

        wget -O /home/tunnel/random_tcp_port https://raw.githubusercontent.com/ab77/proxy-socks/master/extra/random_tcp_port
        chmod +x /home/tunnel/random_tcp_port
        chown tunnel:tunnel -hR /home/tunnel

* update sshd config and restart
```
cat << EOF >> /etc/ssh/sshd_config

Match User tunnel
  ForceCommand . /home/tunnel/random_tcp_port
EOF

service ssh restart
```

* test script (e.g. TCP port between `10,000` and `65,000`)

        # ssh -i ~/.proxy-socks/id_rsa tunnel@{{server}}
        57724

* install the app and run it

* test connectivity to the remote SOCKS proxy from the remote server

        # netstat -a -n -p | grep LISTEN | grep 127.0.0.1
        tcp        0      0 127.0.0.1:57725         0.0.0.0:*               LISTEN      3121/sshd: tunnel

        root@ubuntu:# curl ifconfig.co
        {{server-public-ip}}

        root@ubuntu:# curl --socks5 127.0.0.1:57725 ifconfig.co
        {{proxy-public-ip}}

# next steps
Every new installation of the app, will attempt to make a connection to the remote server and forward a random port to the local SOCKS proxy. These proxies can be exposed on the public interface of the server using HAProxy, OpenVPN or a combination of tools.
