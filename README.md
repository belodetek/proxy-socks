# proxy-socks

> TL;DR

Follow these [instructions](#instructions) to start building residential back-connect proxy network of Windows, Linux and OS X desktop PCs.

# about
This [Electron](https://electronjs.org/) desktop app starts a [SOCKS server](https://github.com/mscdex/socksv5) on the local machine and forwards a randomly advailable remote port on a [Linux box](#server-config) to itself over [SSH](https://github.com/mscdex/ssh2). It requires a few custom configurations on the remote server to find an available TCP port.

# instructions

[![](https://raw.githubusercontent.com/ab77/netflix-proxy/master/static/digitalocean.png)](https://m.do.co/c/937b01397c94)

* deploy an Ubuntu or Debian box (e.g. on [DigitalOcean](https://m.do.co/c/937b01397c94))

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
  ForceCommand /home/tunnel/random_tcp_port
EOF

service ssh restart
```

* test script (e.g. TCP port between `10,000` and `65,000`)

        # ssh -i ~/.proxy-socks/id_rsa tunnel@{{server}}
        57724

* download and install the app

|OS|release|
|---|---|
|Windows|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks-setup-1.0.0.exe)|
|Linux (AppImage)|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks-1.0.0-x86_64.AppImage)|
|Linux (Snap)|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks_1.0.0_amd64.snap)|
|Mac OS X|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks-1.0.0.dmg)|

* launch the app and note the forwarded port number

* test connectivity to the proxy from the remote server

        # netstat -a -n -p | grep LISTEN | grep 127.0.0.1
        tcp        0      0 127.0.0.1:57725         0.0.0.0:*               LISTEN      3121/sshd: tunnel

        root@ubuntu:# curl ifconfig.co
        {{server-public-ip}}

        root@ubuntu:# curl --socks5 127.0.0.1:57725 ifconfig.co
        {{proxy-public-ip}}

# next steps
Every new installation of the app, will attempt to make a connection to the remote server and forward a random port to the local proxy. These proxies can then be exposed on the public interface of the server using [HAProxy](http://www.haproxy.org/), [OpenVPN](https://openvpn.net/) or a combination of tools.

<hr>
<p align="center">&copy; 2018 <a href="https://anton.belodedenko.me/belodetek/">belodetek</a></p>
<p align="center"><a href="http://anton.belodedenko.me/"><img src="https://avatars2.githubusercontent.com/u/2033996?v=3&s=50"></a></p>
