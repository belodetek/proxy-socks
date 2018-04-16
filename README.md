# proxy-socks

> **TL;DR** follow these [instructions](#instructions) to start building a flexible residential back-connect proxy network using Windows, Linux and OS X desktop PCs.

# about

<img align="left" src="https://raw.githubusercontent.com/ab77/proxy-socks/master/assets/app-icon/png/48.png">  This [Electron](https://electronjs.org/) desktop app starts a [SOCKS server](https://github.com/mscdex/socksv5) locally on `proxyPort` and forwards an available port on a remote [Linux box](#server-config) to itself on `socksPort` over [SSH](https://github.com/mscdex/ssh2).

SOCKS clients connecting to `proxyPort` will be proxied via the remote server. Similarly, remote connections will be proxied out the local WAN interface of the machine running the app.

# instructions

<p align="left"><a href="https://m.do.co/c/937b01397c94" target="_blank"><img src="https://raw.githubusercontent.com/ab77/netflix-proxy/master/static/digitalocean.png" width="300"></a></p>

* deploy an Ubuntu or Debian box to be the proxy concentrator and note its public IP (e.g. on [DigitalOcean](https://m.do.co/c/937b01397c94))

## client config
* create SSH key locally and copy to the the proxy concentrator

        mkdir -p ~/.proxy-socks\
          && echo -e 'y\n' | ssh-keygen -f ~/.proxy-socks/id_rsa\
          && ssh-copy-id -i ~/.proxy-socks/id_rsa.pub root@{proxy-concentrator}

* create `config.json`, with the hostname or IP address of the proxy concentrator and adjust ports if required

```
cat << EOF > ~/.proxy-socks/config.json
{
    "username": "tunnel",
    "host": "{proxy-concentrator}",
    "port": 22,
    "privateKey": "${HOME}/.proxy-socks/id_rsa",
    "socksPort": 1081,
    "proxyPort": 1080
}
EOF
```

## server config
* on the proxy concentrator create `tunnel` user, set a password and authorize keys

        useradd -m tunnel -s /bin/bash\
          && mkdir -p /home/tunnel/.ssh\
          && cat ~/.ssh/authorized_keys > /home/tunnel/.ssh/authorized_keys

* download `random_tcp_port` script and set permissions

        wget -O /home/tunnel/random_tcp_port https://raw.githubusercontent.com/ab77/proxy-socks/master/extra/random_tcp_port
        chmod +x /home/tunnel/random_tcp_port
        chown tunnel:tunnel -hR /home/tunnel

* update sshd config and restart the service

```
cat << EOF >> /etc/ssh/sshd_config

Match User tunnel
  ForceCommand /home/tunnel/random_tcp_port
EOF

service ssh restart
```

* test script (e.g. `{zzz}` should return TCP port between `10,000` and `65,000`)

        # ssh -i ~/.proxy-socks/id_rsa tunnel@{proxy-concentrator}
        {zzz}

* download and install the app

|OS|release|
|---|---|
|Windows|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks-setup-1.0.0.exe)|
|Linux (AppImage)|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks-1.0.0-x86_64.AppImage)|
|Linux (Snap)|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks_1.0.0_amd64.snap)|
|Mac OS X|[1.0.0](https://github.com/ab77/proxy-socks/releases/download/v1.0.0/proxy-socks-1.0.0.dmg)|

* launch the app and note the forwarded port number

<img align="center" src="https://raw.githubusercontent.com/ab77/proxy-socks/master/extra/proxy-socks.png" width="400">

> <img align="left" src="https://raw.githubusercontent.com/ab77/proxy-socks/master/assets/app-icon/png/16.png">  The app will attempt to insert itself into the appropriate start-up chain to start automatically with the operating system and appear minimised to tray.

* test connectivity to the proxy from the proxy concentrator

        # netstat -a -n -p | grep LISTEN | grep 127.0.0.1
        tcp        0      0 127.0.0.1:{zzz}         0.0.0.0:*               LISTEN      1234/sshd: tunnel

        root@ubuntu:# curl ifconfig.co
        {xxx}
        
        root@ubuntu:# curl --socks5 127.0.0.1:{zzz} ifconfig.co
        {yyy}

> you should see a random TCP port and two different public IPs if everything is working correctly 

# next steps
Every new installation of the app, will attempt to make a connection to the remote server and forward a random port to the local proxy. These proxies can then be exposed on the public interface of the server using [HAProxy](http://www.haproxy.org/), [OpenVPN](https://openvpn.net/) or a combination of tools.

An [example](https://raw.githubusercontent.com/ab77/proxy-socks/master/extra/update-haproxy) shell script can be used to automatically generate HAProxy configuration for all connected proxies.

> Once the ports are exposed, ensure appropriate ACLs are set.

<hr>
<p align="center">&copy; 2018 <a href="https://anton.belodedenko.me/belodetek/">belodetek</a></p>
<p align="center"><a href="http://anton.belodedenko.me/"><img src="https://avatars2.githubusercontent.com/u/2033996?v=3&s=50"></a></p>
